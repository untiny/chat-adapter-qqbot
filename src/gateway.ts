import type { Logger, WebhookOptions } from "chat";
import type { QQBotAdapter } from "./adapter";
import type {
  QQBotGatewayEvent,
  QQBotResolvedConfig,
  QQBotWebSocketConstructor,
  QQBotWebSocketLike,
} from "./types";

const OP_DISPATCH = 0;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;
const OP_IDENTIFY = 2;
const OP_HEARTBEAT = 1;
const OP_RESUME = 6;
const CLOSE_DISALLOWED_INTENTS = 4014;
const RECONNECT_DELAY_MS = 5_000;

/** Minimal QQBot Gateway client for WebSocket event transport. */
export class QQBotGatewayClient {
  private socket: QQBotWebSocketLike | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sequence: number | undefined;
  private sessionId: string | undefined;
  private gatewayUrl: string | null = null;
  private manuallyClosed = false;

  /** Create a Gateway client bound to an adapter instance. */
  constructor(
    private readonly adapter: QQBotAdapter,
    private readonly config: QQBotResolvedConfig,
    private readonly logger: Logger,
    private readonly WebSocketImpl?: QQBotWebSocketConstructor,
  ) {}

  /** Open a WebSocket connection and attach Gateway event handlers. */
  async connect(options?: WebhookOptions): Promise<void> {
    const WebSocketCtor =
      this.WebSocketImpl ?? (globalThis as unknown as { WebSocket?: QQBotWebSocketConstructor }).WebSocket;
    if (!WebSocketCtor) {
      this.logger.warn("QQBot WebSocket transport requested but no WebSocket implementation is available.");
      return;
    }

    const gatewayUrl = await this.resolveGatewayUrl();

    this.manuallyClosed = false;
    this.clearReconnectTimer();
    this.socket = new WebSocketCtor(gatewayUrl);
    this.socket.onopen = () => {
      this.logger.info("QQBot gateway connected.");
    };
    this.socket.onmessage = (event) => {
      void this.handleMessage(event.data, options);
    };
    this.socket.onclose = (event) => {
      this.clearHeartbeat();
      this.logger.warn("QQBot gateway closed.", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      if (event.code === CLOSE_DISALLOWED_INTENTS) {
        this.logger.error(
          "QQBot gateway closed because the configured intents are not allowed for this bot. Set QQ_BOT_INTENTS to only the event permissions enabled for your QQBot application.",
        );
        return;
      }
      if (!this.manuallyClosed && this.config.reconnect) {
        this.scheduleReconnect(options);
      }
    };
    this.socket.onerror = (event) => {
      this.logger.error("QQBot gateway error.", event);
    };
  }

  /** Close the Gateway socket and stop heartbeat timers. */
  disconnect(): void {
    this.manuallyClosed = true;
    this.clearHeartbeat();
    this.clearReconnectTimer();
    this.socket?.close(1000, "adapter disconnect");
    this.socket = null;
  }

  private async resolveGatewayUrl(): Promise<string> {
    if (this.config.gatewayUrl) return this.config.gatewayUrl;
    if (this.gatewayUrl) return this.gatewayUrl;
    const info = await this.adapter.client.getGateway();
    this.gatewayUrl = info.url;
    return this.gatewayUrl;
  }

  private async handleMessage(rawData: unknown, options?: WebhookOptions): Promise<void> {
    const event = parseGatewayEvent(rawData);
    if (!event) return;
    if (typeof event.s === "number") this.sequence = event.s;

    if (event.op === OP_HELLO) {
      const interval = Number((event.d as { heartbeat_interval?: number })?.heartbeat_interval ?? 45_000);
      this.startHeartbeat(interval);
      await this.identifyOrResume();
      return;
    }

    if (event.op === OP_HEARTBEAT_ACK) {
      return;
    }

    if (event.op === OP_DISPATCH) {
      if (event.t === "READY") {
        this.sessionId = (event.d as { session_id?: string })?.session_id;
      }
      await this.adapter.dispatchGatewayEvent(event, options);
    }
  }

  private scheduleReconnect(options?: WebhookOptions): void {
    this.clearReconnectTimer();
    this.logger.info("QQBot gateway reconnect scheduled.", {
      delayMs: RECONNECT_DELAY_MS,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(options).catch((error) => {
        this.logger.error("QQBot gateway reconnect failed.", error);
        if (!this.manuallyClosed && this.config.reconnect) {
          this.scheduleReconnect(options);
        }
      });
    }, RECONNECT_DELAY_MS);
  }

  private startHeartbeat(interval: number): void {
    this.clearHeartbeat();
    this.heartbeat = setInterval(() => {
      this.send({ op: OP_HEARTBEAT, d: this.sequence ?? null });
    }, interval);
  }

  private async identifyOrResume(): Promise<void> {
    const token = await this.adapter.client.getAccessToken();
    if (this.sessionId) {
      this.send({
        op: OP_RESUME,
        d: {
          token: `QQBot ${token}`,
          session_id: this.sessionId,
          seq: this.sequence,
        },
      });
      return;
    }
    this.send({
      op: OP_IDENTIFY,
      d: {
        token: `QQBot ${token}`,
        intents: this.config.intents,
        shard: [0, 1],
        properties: {
          os: process.platform,
          browser: "chat-adapter-qqbot",
          device: "chat-adapter-qqbot",
        },
      },
    });
  }

  private send(payload: unknown): void {
    this.socket?.send(JSON.stringify(payload));
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

function parseGatewayEvent(rawData: unknown): QQBotGatewayEvent | null {
  const text =
    typeof rawData === "string"
      ? rawData
      : rawData instanceof Buffer
        ? rawData.toString("utf8")
        : String(rawData ?? "");
  try {
    return JSON.parse(text) as QQBotGatewayEvent;
  } catch {
    return null;
  }
}
