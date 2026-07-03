import { Message, parseMarkdown, type Author } from "chat";
import { decodeQQBotButtonData } from "./cards";
import type { QQBotAdapter } from "./adapter";
import type {
  QQBotInteraction,
  QQBotMessage,
  QQBotRawMessage,
  QQBotThreadId,
  QQBotWebhookPayload,
  QQBotUser,
} from "./types";

/** Extract the dispatch data from a QQBot webhook/Gateway envelope. */
export function payloadData(payload: QQBotWebhookPayload | unknown): unknown {
  if (payload && typeof payload === "object" && "d" in payload) {
    return (payload as QQBotWebhookPayload).d;
  }
  return payload;
}

/** Extract the QQBot event type from a webhook/Gateway envelope. */
export function payloadType(payload: QQBotWebhookPayload | unknown): string | undefined {
  return payload && typeof payload === "object" && "t" in payload
    ? String((payload as QQBotWebhookPayload).t)
    : undefined;
}

/** Type guard for QQBot message creation events. */
export function isMessageEvent(type: string | undefined, data: unknown): data is QQBotMessage {
  if (!data || typeof data !== "object") return false;
  if (!("id" in data)) return false;
  if (!type) return "content" in data || "channel_id" in data || "group_openid" in data;
  return [
    "AT_MESSAGE_CREATE",
    "DIRECT_MESSAGE_CREATE",
    "GROUP_AT_MESSAGE_CREATE",
    "GROUP_MESSAGE_CREATE",
    "C2C_MESSAGE_CREATE",
    "MESSAGE_CREATE",
  ].includes(type);
}

/** Type guard for QQBot interaction/button events. */
export function isInteractionEvent(
  type: string | undefined,
  data: unknown,
): data is QQBotInteraction {
  return type === "INTERACTION_CREATE" && !!data && typeof data === "object";
}

/** Derive Chat SDK thread routing data from a raw QQBot message. */
export function threadFromMessage(message: QQBotMessage): QQBotThreadId {
  if (message.group_openid) {
    return {
      kind: "group",
      groupOpenId: message.group_openid,
      messageId: message.id,
    };
  }

  const userOpenId = userIdFromQQBotUser(message.author ?? message.member?.user);
  if (message.direct_message || message.src_guild_id) {
    return {
      kind: "dm",
      userOpenId: userOpenId ?? message.id,
      guildId: message.guild_id ?? message.src_guild_id,
      messageId: message.id,
    };
  }

  if (!message.guild_id && userOpenId) {
    return {
      kind: "dm",
      userOpenId,
      messageId: message.id,
    };
  }

  return {
    kind: "guild",
    guildId: message.guild_id,
    channelId: message.channel_id,
    messageId: message.id,
  };
}

/** Derive Chat SDK thread routing data from a QQBot interaction. */
export function threadFromInteraction(interaction: QQBotInteraction): QQBotThreadId | null {
  if (interaction.group_openid) {
    return { kind: "group", groupOpenId: interaction.group_openid };
  }
  if (interaction.user_openid || userIdFromQQBotUser(interaction.user)) {
    return { kind: "dm", userOpenId: interaction.user_openid ?? userIdFromQQBotUser(interaction.user) };
  }
  if (interaction.guild_id && interaction.channel_id) {
    return {
      kind: "guild",
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
    };
  }
  if (interaction.message) {
    return threadFromMessage(interaction.message);
  }
  return null;
}

/** Convert QQBot user/member data to Chat SDK author metadata. */
export function authorFromQQBotUser(
  user: QQBotUser | undefined,
  fallbackName: string,
  isMe: boolean,
): Author {
  return {
    userId: userIdFromQQBotUser(user) ?? "unknown",
    userName: user?.username ?? fallbackName,
    fullName: user?.username ?? fallbackName,
    isBot: user?.bot ?? "unknown",
    isMe,
  };
}

function userIdFromQQBotUser(user: QQBotUser | undefined): string | undefined {
  return user?.user_openid ?? user?.member_openid ?? user?.union_openid ?? user?.id;
}

/** Convert a QQBot message into Chat SDK's normalized Message class. */
export function createMessageFromQQBot(
  adapter: QQBotAdapter,
  raw: QQBotMessage,
): Message<QQBotRawMessage> {
  const threadData = threadFromMessage(raw);
  const threadId = adapter.encodeThreadId(threadData);
  const text = raw.content ?? "";
  const author = authorFromQQBotUser(
    raw.author ?? raw.member?.user,
    raw.member?.nick ?? raw.author?.username ?? "qq-user",
    adapter.isOwnMessage(raw),
  );

  return new Message<QQBotRawMessage>({
    id: raw.id,
    threadId,
    text,
    formatted: parseMarkdown(text),
    isMention: raw.eventType === "AT_MESSAGE_CREATE" || raw.eventType === "GROUP_AT_MESSAGE_CREATE",
    raw,
    author,
    metadata: {
      dateSent: raw.timestamp ? new Date(raw.timestamp) : new Date(),
      edited: Boolean(raw.edited_timestamp),
      editedAt: raw.edited_timestamp ? new Date(raw.edited_timestamp) : undefined,
    },
    attachments: (raw.attachments ?? []).map((attachment) => ({
      type: inferAttachmentType(attachment.content_type, attachment.filename),
      name: attachment.filename,
      mimeType: attachment.content_type,
      url: attachment.url,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
      fetchMetadata: Object.fromEntries(
        Object.entries(attachment).map(([key, value]) => [key, String(value)]),
      ),
    })),
  });
}

/** Convert a QQBot keyboard interaction into Chat SDK action event data. */
export function actionFromInteraction(adapter: QQBotAdapter, raw: QQBotInteraction) {
  const thread = threadFromInteraction(raw);
  if (!thread) return null;

  const buttonData =
    raw.data?.resolved?.button_data ?? raw.data?.custom_id ?? raw.data?.value ?? "";
  if (!buttonData) return null;

  const { actionId, value } = decodeQQBotButtonData(buttonData);
  return {
    actionId,
    value,
    adapter,
    threadId: adapter.encodeThreadId(thread),
    messageId:
      raw.data?.resolved?.message_id ?? raw.message?.id ?? raw.event_id ?? raw.id ?? "unknown",
    triggerId: raw.event_id ?? raw.id,
    raw,
    user: authorFromQQBotUser(raw.user ?? raw.member?.user, "qq-user", false),
  };
}

function inferAttachmentType(
  mimeType: string | undefined,
  filename: string | undefined,
): "image" | "file" | "video" | "audio" {
  const value = `${mimeType ?? ""} ${filename ?? ""}`.toLowerCase();
  if (value.includes("image")) return "image";
  if (value.includes("video")) return "video";
  if (value.includes("audio")) return "audio";
  return "file";
}
