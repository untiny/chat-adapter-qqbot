import type { Logger } from "chat";

/** Transport mode used to receive QQBot events. */
export type QQBotTransport = "auto" | "webhook" | "websocket";

/** Chat surface represented by a Chat SDK thread ID. */
export type QQBotThreadKind = "guild" | "group" | "dm" | "dms";

/** Decoded components of a QQBot Chat SDK thread ID. */
export interface QQBotThreadId {
  /** Surface type: guild channel, group chat, C2C direct chat, or guild direct chat. */
  kind: QQBotThreadKind;
  /** QQ guild ID for channel messages and guild direct messages. */
  guildId?: string;
  /** QQ channel ID for guild channel messages. */
  channelId?: string;
  /** Open ID for QQ group messages. */
  groupOpenId?: string;
  /** Open ID for QQ C2C users or guild direct message recipients. */
  userOpenId?: string;
  /** Optional source/root message ID used for replies. */
  messageId?: string;
}

/** User-provided adapter configuration. */
export interface QQBotAdapterConfig {
  /** QQBot application ID. */
  appId: string;
  /** QQBot application secret used to obtain app access tokens. */
  secret: string;
  /** Optional pre-issued bot token; when omitted the adapter fetches app access tokens. */
  token?: string;
  /** Public webhook URL configured for QQBot callbacks. Absence enables WebSocket in auto mode. */
  webhookUrl?: string;
  /** Event transport selection. Defaults to "auto". */
  transport?: QQBotTransport;
  /** Gateway intents bitmask used by WebSocket identify. */
  intents?: number;
  /** Use QQBot sandbox API base URL. */
  sandbox?: boolean;
  /** Override QQBot REST API base URL. */
  apiBaseUrl?: string;
  /** Override QQBot app access token endpoint. */
  tokenUrl?: string;
  /** Override QQBot Gateway URL, primarily useful for tests or proxies. */
  gatewayUrl?: string;
  /** Bot mention/display name exposed to Chat SDK. */
  userName?: string;
  /** Optional Chat SDK compatible logger. */
  logger?: Logger;
  /** Fetch implementation override for tests or non-standard runtimes. */
  fetch?: typeof fetch;
  /** WebSocket constructor override for tests or Node runtimes without global WebSocket. */
  WebSocket?: QQBotWebSocketConstructor;
  /** Reconnect Gateway automatically after unexpected close. Defaults to true. */
  reconnect?: boolean;
}

/** Fully resolved adapter configuration after env fallback and defaults. */
export interface QQBotResolvedConfig extends QQBotAdapterConfig {
  transport: QQBotTransport;
  apiBaseUrl: string;
  gatewayUrl: string;
  userName: string;
  intents: number;
  reconnect: boolean;
  logger: Logger;
}

/** Cached QQBot app access token with an absolute expiry time. */
export interface QQBotAccessToken {
  accessToken: string;
  expiresAt: number;
}

/** Raw response returned by QQBot app token endpoint. */
export interface QQBotTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

/** Common QQBot REST error response body. */
export interface QQBotApiErrorBody {
  code?: number;
  message?: string;
  err_code?: number;
  trace_id?: string;
}

/** QQBot user shape used by messages, members, and interactions. */
export interface QQBotUser {
  id?: string;
  user_openid?: string;
  member_openid?: string;
  username?: string;
  bot?: boolean;
  avatar?: string;
  union_openid?: string;
}

/** QQ guild member wrapper. */
export interface QQBotMember {
  user?: QQBotUser;
  nick?: string;
  joined_at?: string;
}

/** QQBot attachment metadata from message events. */
export interface QQBotAttachment {
  id?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  url?: string;
  height?: number;
  width?: number;
}

/** Raw QQBot message event payload normalized across guild/group/DM surfaces. */
export interface QQBotMessage {
  id: string;
  /** Internal event type copied from the Gateway/webhook envelope for routing hints. */
  eventType?: QQBotEventType | string;
  channel_id?: string;
  guild_id?: string;
  group_openid?: string;
  author?: QQBotUser;
  member?: QQBotMember;
  direct_message?: boolean;
  src_guild_id?: string;
  content?: string;
  timestamp?: string;
  edited_timestamp?: string;
  attachments?: QQBotAttachment[];
  mentions?: QQBotUser[];
  msg_id?: string;
  event_id?: string;
  message_reference?: {
    message_id?: string;
  };
}

/** Raw QQBot group message payload. */
export interface QQBotGroupMessage extends QQBotMessage {
  group_openid: string;
}

/** Raw QQBot direct/C2C message payload. */
export interface QQBotDirectMessage extends QQBotMessage {
  author: QQBotUser & { id: string };
}

/** QQBot webhook or Gateway dispatch envelope. */
export interface QQBotWebhookPayload {
  id?: string;
  op?: number;
  s?: number;
  t?: QQBotEventType | string;
  d?: unknown;
  plain_token?: string;
  event_ts?: string;
}

/** QQBot event names handled or recognized by this adapter. */
export type QQBotEventType =
  | "AT_MESSAGE_CREATE"
  | "DIRECT_MESSAGE_CREATE"
  | "GROUP_AT_MESSAGE_CREATE"
  | "GROUP_MESSAGE_CREATE"
  | "C2C_MESSAGE_CREATE"
  | "MESSAGE_CREATE"
  | "MESSAGE_REACTION_ADD"
  | "MESSAGE_REACTION_REMOVE"
  | "INTERACTION_CREATE"
  | "GUILD_MEMBER_ADD"
  | "GUILD_MEMBER_UPDATE"
  | "GUILD_MEMBER_REMOVE";

/** Raw message type exposed through Chat SDK escape hatches. */
export type QQBotRawMessage =
  | QQBotMessage
  | QQBotGroupMessage
  | QQBotDirectMessage
  | QQBotWebhookPayload;

/** QQBot REST payload used to send or edit messages. */
export interface QQBotPostMessagePayload {
  content?: string;
  msg_id?: string;
  message_reference?: {
    message_id: string;
    ignore_get_message_error?: boolean;
  };
  markdown?: {
    content?: string;
    custom_template_id?: string;
    params?: Array<{ key: string; values: string[] }>;
  };
  keyboard?: QQBotKeyboard;
  media?: {
    file_info?: string;
  };
  image?: string;
  file_image?: string;
  event_id?: string;
}

/** QQBot inline keyboard container. */
export interface QQBotKeyboard {
  content?: {
    rows: QQBotKeyboardRow[];
  };
}

/** QQBot inline keyboard row. */
export interface QQBotKeyboardRow {
  buttons: QQBotKeyboardButton[];
}

/** QQBot inline keyboard button payload. */
export interface QQBotKeyboardButton {
  id?: string;
  render_data: {
    label: string;
    visited_label?: string;
    style?: number;
  };
  action: {
    type: number;
    permission: {
      type: number;
      specify_role_ids?: string[];
      specify_user_ids?: string[];
    };
    data?: string;
    enter?: boolean;
    anchor?: number;
    click_limit?: number;
  };
}

/** Raw message response returned after sending or editing a message. */
export interface QQBotMessageResponse extends QQBotMessage {
  seq?: number;
}

/** QQBot Gateway discovery response. */
export interface QQBotGatewayInfo {
  url: string;
  shards?: number;
  session_start_limit?: {
    total?: number;
    remaining?: number;
    reset_after?: number;
    max_concurrency?: number;
  };
}

/** QQBot Gateway WebSocket event frame. */
export interface QQBotGatewayEvent {
  op: number;
  s?: number;
  t?: string;
  d?: unknown;
}

/** QQBot interaction payload, including keyboard/button callbacks. */
export interface QQBotInteraction {
  id?: string;
  application_id?: string;
  type?: number;
  event_id?: string;
  guild_id?: string;
  channel_id?: string;
  group_openid?: string;
  user_openid?: string;
  data?: {
    resolved?: {
      button_data?: string;
      button_id?: string;
      user_id?: string;
      message_id?: string;
    };
    custom_id?: string;
    value?: string;
  };
  message?: QQBotMessage;
  member?: QQBotMember;
  user?: QQBotUser;
}

/** Minimal WebSocket surface needed by the Gateway client. */
export interface QQBotWebSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string; wasClean?: boolean }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** Constructor signature for injectable WebSocket implementations. */
export interface QQBotWebSocketConstructor {
  new (url: string): QQBotWebSocketLike;
}
