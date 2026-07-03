import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  Message,
  type Adapter,
  type AdapterPostableMessage,
  type ChannelInfo,
  type ChatInstance,
  type EmojiValue,
  type EphemeralMessage,
  type FetchOptions,
  type FetchResult,
  type FormattedContent,
  type Logger,
  type RawMessage,
  type StreamChunk,
  type StreamOptions,
  type ThreadInfo,
  type UserInfo,
  type WebhookOptions,
} from "chat";
import { extractFiles } from "@chat-adapter/shared";
import { QQBotClient } from "./client";
import { ADAPTER_NAME, validationError } from "./errors";
import {
  actionFromInteraction,
  createMessageFromQQBot,
  isInteractionEvent,
  isMessageEvent,
  payloadData,
  payloadType,
  threadFromMessage,
} from "./events";
import { QQBotFormatConverter } from "./format-converter";
import { QQBotGatewayClient } from "./gateway";
import { decodeQQBotThreadId, encodeQQBotThreadId } from "./thread-id";
import type {
  QQBotInteraction,
  QQBotMessage,
  QQBotPostMessagePayload,
  QQBotRawMessage,
  QQBotResolvedConfig,
  QQBotThreadId,
  QQBotWebhookPayload,
} from "./types";

/**
 * Chat SDK platform adapter for QQBot.
 *
 * The adapter supports HTTP webhooks and QQBot Gateway WebSocket transport. In
 * `transport: "auto"` mode it uses webhooks when `webhookUrl` is configured and
 * falls back to WebSocket when no webhook URL is available.
 */
export class QQBotAdapter implements Adapter<QQBotThreadId, QQBotRawMessage> {
  readonly name = ADAPTER_NAME;
  readonly userName: string;
  botUserId?: string;
  readonly persistThreadHistory = true;
  readonly lockScope = "thread" as const;

  readonly client: QQBotClient;

  private chat: ChatInstance | null = null;
  private logger: Logger;
  private readonly converter = new QQBotFormatConverter();
  private readonly sentMessageIds = new Set<string>();
  private gateway: QQBotGatewayClient | null = null;

  /** Create a QQBot adapter from already resolved configuration. */
  constructor(readonly config: QQBotResolvedConfig) {
    this.userName = config.userName;
    this.logger = config.logger!;
    this.client = new QQBotClient({
      appId: config.appId,
      secret: config.secret,
      token: config.token,
      apiBaseUrl: config.apiBaseUrl,
      tokenUrl: config.tokenUrl,
      fetch: config.fetch,
    });
  }

  /**
   * Attach the adapter to a Chat SDK instance and start Gateway transport when
   * configured by the transport selection rules.
   */
  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
    this.logger = chat.getLogger(ADAPTER_NAME);
    try {
      const me = await this.client.getMe();
      this.botUserId = me.id ?? me.union_openid;
    } catch (error) {
      this.logger.warn("Unable to fetch QQBot bot identity during initialize.", error);
    }

    if (this.shouldUseWebSocket()) {
      this.gateway = new QQBotGatewayClient(this, this.config, this.logger, this.config.WebSocket);
      await this.gateway.connect();
    }
  }

  /** Close any active Gateway connection and release runtime resources. */
  async disconnect(): Promise<void> {
    this.gateway?.disconnect();
    this.gateway = null;
  }

  /** Encode decoded QQBot thread data into a stable Chat SDK thread ID. */
  encodeThreadId(platformData: QQBotThreadId): string {
    return encodeQQBotThreadId(platformData);
  }

  /** Decode a Chat SDK thread ID into QQBot-specific routing data. */
  decodeThreadId(threadId: string): QQBotThreadId {
    return decodeQQBotThreadId(threadId);
  }

  /** Return the channel-level identity used for lock scoping and channel APIs. */
  channelIdFromThreadId(threadId: string): string {
    const decoded = this.decodeThreadId(threadId);
    if (decoded.kind === "guild") return `qqbot:guild:${decoded.guildId}:${decoded.channelId}`;
    if (decoded.kind === "group") return `qqbot:group:${decoded.groupOpenId}`;
    return decoded.guildId
      ? `qqbot:dm:${decoded.guildId}:${decoded.userOpenId}`
      : `qqbot:dm:${decoded.userOpenId}`;
  }

  /**
   * Handle a QQBot webhook request, including challenge responses, optional
   * signature verification, and dispatch into Chat SDK message/action handlers.
   */
  async handleWebhook(request: Request, options?: WebhookOptions): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const rawBody = await request.text();
    const payload = parseJson<QQBotWebhookPayload>(rawBody);
    if (!payload) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const challenge = this.handleChallenge(payload);
    if (challenge) return challenge;

    const signatureOk = await this.verifyWebhook(request, rawBody);
    if (!signatureOk) {
      return new Response("Invalid signature", { status: 401 });
    }

    await this.dispatchWebhookPayload(payload, options);
    return new Response("OK", { status: 200 });
  }

  /** Convert a raw QQBot message payload into Chat SDK's normalized Message. */
  parseMessage(raw: QQBotRawMessage): Message<QQBotRawMessage> {
    const data = payloadData(raw);
    if (!data || typeof data !== "object" || !("id" in data)) {
      throw validationError("QQBot raw message payload is not a message.");
    }
    return createMessageFromQQBot(this, data as QQBotMessage);
  }

  /** Post a message to a guild channel, group chat, or direct/C2C thread. */
  async postMessage(
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<QQBotRawMessage>> {
    const thread = this.decodeThreadId(threadId);
    const payload = await this.toQQBotPayload(thread, message);
    const raw = await this.client.postMessage(thread, payload);
    if (raw.id) this.sentMessageIds.add(raw.id);
    return { id: raw.id ?? raw.msg_id ?? raw.event_id ?? "", raw, threadId };
  }

  /** Post a top-level guild channel message by channel ID. */
  async postChannelMessage(
    channelId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<QQBotRawMessage>> {
    const parts = channelId.split(":");
    const thread =
      parts[0] === "qqbot" && parts[1] === "guild"
        ? { kind: "guild" as const, guildId: parts[2], channelId: parts[3] }
        : { kind: "guild" as const, channelId };
    const payload = await this.toQQBotPayload(thread, message);
    const raw = await this.client.postMessage(thread, payload);
    if (raw.id) this.sentMessageIds.add(raw.id);
    return { id: raw.id ?? raw.msg_id ?? "", raw, threadId: this.encodeThreadId(thread) };
  }

  /** Edit a previously sent guild channel message. */
  async editMessage(
    threadId: string,
    messageId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<QQBotRawMessage>> {
    const thread = this.decodeThreadId(threadId);
    const raw = await this.client.editMessage(thread, messageId, await this.toQQBotPayload(thread, message));
    return { id: raw.id ?? messageId, raw, threadId };
  }

  /** Delete or recall a message where the QQBot API supports it. */
  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    await this.client.deleteMessage(this.decodeThreadId(threadId), messageId);
  }

  /** Add an emoji reaction to a guild channel message. */
  async addReaction(
    threadId: string,
    messageId: string,
    emoji: EmojiValue | string,
  ): Promise<void> {
    await this.client.addReaction(this.decodeThreadId(threadId), messageId, emojiToString(emoji));
  }

  /** Remove an emoji reaction from a guild channel message. */
  async removeReaction(
    threadId: string,
    messageId: string,
    emoji: EmojiValue | string,
  ): Promise<void> {
    await this.client.removeReaction(this.decodeThreadId(threadId), messageId, emojiToString(emoji));
  }

  /** Fetch recent guild channel messages in chronological order. */
  async fetchMessages(
    threadId: string,
    options?: FetchOptions,
  ): Promise<FetchResult<QQBotRawMessage>> {
    const thread = this.decodeThreadId(threadId);
    if (thread.kind !== "guild" || !thread.channelId) {
      return { messages: [], nextCursor: undefined };
    }
    const raw = await this.client.fetchChannelMessages(thread.channelId, {
      limit: options?.limit,
      cursor: options?.cursor,
    });
    const messages = raw.map((message) => this.parseMessage(message));
    messages.sort(
      (a, b) =>
        new Date(a.metadata.dateSent).getTime() - new Date(b.metadata.dateSent).getTime(),
    );
    return {
      messages,
      nextCursor: raw.length ? raw[0]?.id : undefined,
    };
  }

  /** Fetch one guild channel message by ID. */
  async fetchMessage(threadId: string, messageId: string): Promise<Message<QQBotRawMessage> | null> {
    const raw = await this.client.fetchMessage(this.decodeThreadId(threadId), messageId);
    return this.parseMessage(raw);
  }

  /** Return minimal thread metadata derived from the encoded thread ID. */
  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const decoded = this.decodeThreadId(threadId);
    const channelId =
      decoded.kind === "guild"
        ? decoded.channelId!
        : decoded.kind === "group"
          ? decoded.groupOpenId!
          : (decoded.guildId ?? decoded.userOpenId!);
    return {
      id: threadId,
      channelId,
      channelName: channelId,
      isDM: decoded.kind === "dm",
      metadata: decoded as unknown as Record<string, unknown>,
    };
  }

  /** Fetch guild channel metadata. */
  async fetchChannelInfo(channelId: string): Promise<ChannelInfo> {
    const raw = await this.client.fetchChannelInfo(channelId);
    return {
      id: String(raw.id ?? channelId),
      name: String(raw.name ?? channelId),
      metadata: raw,
    };
  }

  /** Fetch top-level messages for a guild channel. */
  async fetchChannelMessages(
    channelId: string,
    options?: FetchOptions,
  ): Promise<FetchResult<QQBotRawMessage>> {
    const raw = await this.client.fetchChannelMessages(channelId, {
      limit: options?.limit,
      cursor: options?.cursor,
    });
    return {
      messages: raw.map((message) => this.parseMessage(message)),
      nextCursor: raw.length ? raw[0]?.id : undefined,
    };
  }

  /** Look up QQBot user information by platform user ID. */
  async getUser(userId: string): Promise<UserInfo | null> {
    const user = await this.client.getUser(userId);
    return {
      userId: user.union_openid ?? user.id ?? userId,
      userName: user.username ?? userId,
      fullName: user.username ?? userId,
      isBot: user.bot ?? false,
      avatarUrl: user.avatar,
    };
  }

  /** Create a Chat SDK DM thread ID for a QQ user open ID. */
  async openDM(userId: string): Promise<string> {
    return this.encodeThreadId({ kind: "dm", userOpenId: userId });
  }

  /** Check whether a Chat SDK thread ID represents a QQ direct/C2C chat. */
  isDM(threadId: string): boolean {
    return this.decodeThreadId(threadId).kind === "dm";
  }

  /**
   * QQBot does not expose a general ephemeral message API, so this falls back to
   * sending the user a direct message and marks the response as a fallback.
   */
  async postEphemeral(
    threadId: string,
    userId: string,
    message: AdapterPostableMessage,
  ): Promise<EphemeralMessage<QQBotRawMessage>> {
    const dmThreadId = await this.openDM(userId);
    const sent = await this.postMessage(dmThreadId, message);
    return {
      ...sent,
      threadId,
      userId,
      usedFallback: true,
    } as EphemeralMessage<QQBotRawMessage>;
  }

  /** Send a typing indicator when supported by the target QQBot surface. */
  async startTyping(threadId: string): Promise<void> {
    await this.client.startTyping(this.decodeThreadId(threadId));
  }

  /**
   * Stream text by sending the first chunk and editing the same message as more
   * chunks arrive. Surfaces without edit support keep the initial message.
   */
  async stream(
    threadId: string,
    textStream: AsyncIterable<string | StreamChunk>,
    _options?: StreamOptions,
  ): Promise<RawMessage<QQBotRawMessage> | null> {
    let accumulated = "";
    let sent: RawMessage<QQBotRawMessage> | null = null;
    for await (const chunk of textStream) {
      const text = typeof chunk === "string" ? chunk : chunk.type === "markdown_text" ? chunk.text : "";
      if (!text) continue;
      accumulated += text;
      if (!sent) {
        sent = await this.postMessage(threadId, accumulated);
      } else {
        try {
          sent = await this.editMessage(threadId, sent.id, accumulated);
        } catch {
          // QQ group/C2C edits may be unavailable; keep the initial message.
        }
      }
    }
    return sent;
  }

  /** Render Chat SDK formatted markdown AST to QQBot-compatible markdown text. */
  renderFormatted(content: FormattedContent): string {
    return this.converter.fromAst(content);
  }

  /** Detect messages sent by this adapter runtime to prevent self-echo loops. */
  isOwnMessage(message: QQBotMessage): boolean {
    const authorId = message.author?.id ?? message.author?.union_openid ?? message.member?.user?.id;
    return Boolean(
      (message.id && this.sentMessageIds.has(message.id)) ||
        (authorId && this.botUserId && authorId === this.botUserId),
    );
  }

  /** Dispatch a Gateway frame through the same event path used by webhooks. */
  async dispatchGatewayEvent(event: { t?: string; d?: unknown }, options?: WebhookOptions): Promise<void> {
    this.logger.debug("QQBot gateway dispatch received.", { type: event.t });
    await this.dispatchEvent(event.t, event.d, event as QQBotWebhookPayload, options);
  }

  private shouldUseWebSocket(): boolean {
    if (this.config.transport === "websocket") return true;
    if (this.config.transport === "webhook") return false;
    return !this.config.webhookUrl;
  }

  private async dispatchWebhookPayload(
    payload: QQBotWebhookPayload,
    options?: WebhookOptions,
  ): Promise<void> {
    await this.dispatchEvent(payloadType(payload), payloadData(payload), payload, options);
  }

  private async dispatchEvent(
    type: string | undefined,
    data: unknown,
    raw: QQBotWebhookPayload,
    options?: WebhookOptions,
  ): Promise<void> {
    if (!this.chat) return;

    if (isMessageEvent(type, data)) {
      const message = { ...(data as QQBotMessage), eventType: type };
      const parsed = () => Promise.resolve(this.parseMessage(message));
      const threadId = this.encodeThreadId(threadFromMessage(message));
      await this.chat.processMessage(this, threadId, parsed, options);
      return;
    }

    if (isInteractionEvent(type, data)) {
      const action = actionFromInteraction(this, data as QQBotInteraction);
      if (action) {
        await this.chat.processAction(action, options);
      }
      return;
    }

    this.logger.debug("Ignoring unsupported QQBot event.", { type, raw });
  }

  private async toQQBotPayload(
    thread: QQBotThreadId,
    message: AdapterPostableMessage,
  ): Promise<QQBotPostMessagePayload> {
    const content = this.converter.renderPostable(message);
    const payload: QQBotPostMessagePayload = content ? { content } : {};

    if (thread.messageId) {
      payload.msg_id = thread.messageId;
      payload.message_reference = {
        message_id: thread.messageId,
        ignore_get_message_error: true,
      };
    }

    const files = extractFiles(message);
    if (files.length > 0) {
      const media = await this.client.uploadMedia(thread, {
        data: files[0]?.data,
        filename: files[0]?.filename,
        contentType: files[0]?.mimeType,
      });
      if (media.file_info) {
        payload.media = { file_info: media.file_info };
      } else if (media.url) {
        payload.image = media.url;
      }
    }

    return payload;
  }

  private handleChallenge(payload: QQBotWebhookPayload): Response | null {
    if (!payload.plain_token) return null;
    const signature = createHash("sha256")
      .update(`${payload.event_ts ?? ""}${this.config.secret}${payload.plain_token}`)
      .digest("hex");
    return Response.json({
      plain_token: payload.plain_token,
      signature,
    });
  }

  private async verifyWebhook(request: Request, rawBody: string): Promise<boolean> {
    const signature =
      request.headers.get("x-signature-ed25519") ??
      request.headers.get("x-qq-signature") ??
      request.headers.get("x-signature");
    const timestamp =
      request.headers.get("x-signature-timestamp") ??
      request.headers.get("x-qq-timestamp") ??
      request.headers.get("x-timestamp");

    if (!signature || !timestamp) {
      return true;
    }

    if (!this.config.token) {
      return false;
    }

    try {
      const expected = createHmac("sha256", this.config.token)
        .update(`${timestamp}${rawBody}`)
        .digest("hex");
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function emojiToString(emoji: EmojiValue | string): string {
  return typeof emoji === "string" ? emoji : emoji.name;
}
