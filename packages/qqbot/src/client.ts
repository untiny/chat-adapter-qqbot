import { toBuffer } from "@chat-adapter/shared";
import { authError, mapQQBotError, validationError } from "./errors";
import type {
  QQBotAccessToken,
  QQBotAdapterConfig,
  QQBotGatewayInfo,
  QQBotMessage,
  QQBotMessageResponse,
  QQBotPostMessagePayload,
  QQBotThreadId,
  QQBotTokenResponse,
  QQBotUser,
} from "./types";

export interface QQBotClientOptions {
  /** QQBot application ID. */
  appId: string;
  /** QQBot application secret. */
  secret: string;
  /** Optional static bot token; skips app-token fetching when provided. */
  token?: string;
  /** QQBot REST API base URL. */
  apiBaseUrl: string;
  /** QQBot app access token endpoint. */
  tokenUrl?: string;
  /** Fetch implementation override. */
  fetch?: typeof fetch;
}

const DEFAULT_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

/** Thin REST client for QQBot OpenAPI endpoints used by the adapter. */
export class QQBotClient {
  private readonly fetchImpl: typeof fetch;
  private accessToken: QQBotAccessToken | null = null;

  /** Create a client with credentials, base URL, and optional fetch override. */
  constructor(private readonly options: QQBotClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** Return a usable bot token, refreshing app access tokens when needed. */
  async getAccessToken(): Promise<string> {
    if (this.options.token) {
      return this.options.token;
    }
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.accessToken;
    }

    const response = await this.fetchImpl(this.options.tokenUrl ?? DEFAULT_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appId: this.options.appId,
        clientSecret: this.options.secret,
      }),
    });

    const body = (await safeJson(response)) as QQBotTokenResponse;
    if (!response.ok || !body.access_token) {
      throw response.status === 401
        ? authError("QQBot credentials were rejected.")
        : mapQQBotError(response.status, body as never);
    }

    this.accessToken = {
      accessToken: body.access_token,
      expiresAt: Date.now() + Math.max(0, body.expires_in ?? 7200) * 1000,
    };
    return this.accessToken.accessToken;
  }

  /** Fetch the QQBot Gateway URL and session-start metadata. */
  async getGateway(): Promise<QQBotGatewayInfo> {
    return this.request<QQBotGatewayInfo>("/gateway");
  }

  /** Fetch the bot account identity. */
  async getMe(): Promise<QQBotUser> {
    return this.request<QQBotUser>("/users/@me");
  }

  /** Send a message to the REST endpoint matching the target thread kind. */
  async postMessage(
    thread: QQBotThreadId,
    payload: QQBotPostMessagePayload,
  ): Promise<QQBotMessageResponse> {
    if (thread.kind === "guild") {
      return this.request(`/channels/${required(thread.channelId, "channelId")}/messages`, {
        method: "POST",
        body: payload,
      });
    }
    if (thread.kind === "group") {
      return this.request(`/v2/groups/${required(thread.groupOpenId, "groupOpenId")}/messages`, {
        method: "POST",
        body: payload,
      });
    }
    if (thread.guildId) {
      return this.request(`/dms/${thread.guildId}/messages`, {
        method: "POST",
        body: payload,
      });
    }
    return this.request(`/v2/users/${required(thread.userOpenId, "userOpenId")}/messages`, {
      method: "POST",
      body: payload,
    });
  }

  /** Edit a guild channel message. */
  async editMessage(
    thread: QQBotThreadId,
    messageId: string,
    payload: QQBotPostMessagePayload,
  ): Promise<QQBotMessageResponse> {
    if (thread.kind !== "guild") {
      throw validationError("QQBot editMessage is only available for guild channel messages.");
    }
    return this.request(
      `/channels/${required(thread.channelId, "channelId")}/messages/${messageId}`,
      {
        method: "PATCH",
        body: payload,
      },
    );
  }

  /** Delete or recall a message on the target surface. */
  async deleteMessage(thread: QQBotThreadId, messageId: string): Promise<void> {
    if (thread.kind === "guild") {
      await this.request(
        `/channels/${required(thread.channelId, "channelId")}/messages/${messageId}`,
        { method: "DELETE" },
      );
      return;
    }
    if (thread.kind === "group") {
      await this.request(
        `/v2/groups/${required(thread.groupOpenId, "groupOpenId")}/messages/${messageId}`,
        { method: "DELETE" },
      );
      return;
    }
    await this.request(
      `/v2/users/${required(thread.userOpenId, "userOpenId")}/messages/${messageId}`,
      {
        method: "DELETE",
      },
    );
  }

  /** Fetch a single guild channel message. */
  async fetchMessage(thread: QQBotThreadId, messageId: string): Promise<QQBotMessage> {
    if (thread.kind !== "guild") {
      throw validationError("QQBot fetchMessage is only available for guild channel messages.");
    }
    return this.request(
      `/channels/${required(thread.channelId, "channelId")}/messages/${messageId}`,
    );
  }

  /** Fetch guild channel messages with optional pagination parameters. */
  async fetchChannelMessages(
    channelId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<QQBotMessage[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("around", options.cursor);
    const suffix = params.size ? `?${params.toString()}` : "";
    return this.request<QQBotMessage[]>(`/channels/${channelId}/messages${suffix}`);
  }

  /** Fetch guild channel metadata. */
  async fetchChannelInfo(channelId: string): Promise<Record<string, unknown>> {
    return this.request(`/channels/${channelId}`);
  }

  /** Fetch user metadata by QQBot platform user ID. */
  async getUser(userId: string): Promise<QQBotUser> {
    return this.request(`/users/${userId}`);
  }

  /** Add an emoji reaction to a guild channel message. */
  async addReaction(thread: QQBotThreadId, messageId: string, emoji: string): Promise<void> {
    if (thread.kind !== "guild") {
      throw validationError("QQBot reactions are only available for guild channel messages.");
    }
    await this.request(
      `/channels/${required(thread.channelId, "channelId")}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      { method: "PUT" },
    );
  }

  /** Remove an emoji reaction from a guild channel message. */
  async removeReaction(thread: QQBotThreadId, messageId: string, emoji: string): Promise<void> {
    if (thread.kind !== "guild") {
      throw validationError("QQBot reactions are only available for guild channel messages.");
    }
    await this.request(
      `/channels/${required(thread.channelId, "channelId")}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      { method: "DELETE" },
    );
  }

  /** Send a typing signal for guild channel threads; no-op for other surfaces. */
  async startTyping(thread: QQBotThreadId): Promise<void> {
    if (thread.kind !== "guild") {
      return;
    }
    await this.request(`/channels/${required(thread.channelId, "channelId")}/typing`, {
      method: "POST",
      body: {},
    });
  }

  /** Upload media to the endpoint matching the target thread kind. */
  async uploadMedia(
    thread: QQBotThreadId,
    file: { data: unknown; filename?: string; contentType?: string },
  ): Promise<{ file_info?: string; url?: string }> {
    const buffer = await toBuffer(file.data, { platform: "discord" });
    if (!buffer) {
      throw validationError("Unsupported QQBot file data.");
    }

    const formData = new FormData();
    formData.set(
      "file",
      new Blob(
        [
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ) as ArrayBuffer,
        ],
        {
          type: file.contentType ?? "application/octet-stream",
        },
      ),
      file.filename ?? "file",
    );

    if (thread.kind === "guild") {
      return this.request(`/channels/${required(thread.channelId, "channelId")}/files`, {
        method: "POST",
        body: formData,
        rawBody: true,
      });
    }
    if (thread.kind === "group") {
      return this.request(`/v2/groups/${required(thread.groupOpenId, "groupOpenId")}/files`, {
        method: "POST",
        body: formData,
        rawBody: true,
      });
    }
    return this.request(`/v2/users/${required(thread.userOpenId, "userOpenId")}/files`, {
      method: "POST",
      body: formData,
      rawBody: true,
    });
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      rawBody?: boolean;
    } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `QQBot ${token}`,
    };

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.rawBody) {
        body = options.body as BodyInit;
      } else {
        headers["content-type"] = "application/json";
        body = JSON.stringify(options.body);
      }
    }

    const response = await this.fetchImpl(`${this.options.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body,
    });
    if (response.status === 204) {
      return undefined as T;
    }
    const json = await safeJson(response);
    if (!response.ok) {
      throw mapQQBotError(response.status, json as never);
    }
    return json as T;
  }
}

/** Resolve the QQBot REST API base URL from explicit config or sandbox mode. */
export function resolveApiBaseUrl(
  config: Pick<QQBotAdapterConfig, "apiBaseUrl" | "sandbox">,
): string {
  if (config.apiBaseUrl) {
    return config.apiBaseUrl.replace(/\/$/, "");
  }
  return config.sandbox ? "https://sandbox.api.sgroup.qq.com" : "https://api.sgroup.qq.com";
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw validationError(`QQBot ${name} is required for this operation.`);
  }
  return value;
}
