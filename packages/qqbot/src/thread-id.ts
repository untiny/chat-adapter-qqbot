import { validationError } from "./errors";
import type { QQBotThreadId } from "./types";

const PREFIX = "qqbot";

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeSegment(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

/** Encode QQBot thread routing data into a Chat SDK thread ID. */
export function encodeQQBotThreadId(data: QQBotThreadId): string {
  if (data.kind === "guild") {
    if (!data.guildId || !data.channelId) {
      throw validationError("QQBot guild thread IDs require guildId and channelId.");
    }
    return [
      PREFIX,
      "guild",
      data.guildId,
      data.channelId,
      data.messageId ? encodeSegment(data.messageId) : undefined,
    ]
      .filter(Boolean)
      .join(":");
  }

  if (data.kind === "group") {
    if (!data.groupOpenId) {
      throw validationError("QQBot group thread IDs require groupOpenId.");
    }
    return [
      PREFIX,
      "group",
      data.groupOpenId,
      data.messageId ? encodeSegment(data.messageId) : undefined,
    ]
      .filter(Boolean)
      .join(":");
  }

  if (data.kind === "dms") {
    if (!data.guildId || !data.userOpenId) {
      throw validationError("QQBot guild DM thread IDs require guildId and userOpenId.");
    }
    return [
      PREFIX,
      "dms",
      data.guildId,
      data.userOpenId,
      data.messageId ? encodeSegment(data.messageId) : undefined,
    ]
      .filter(Boolean)
      .join(":");
  }

  if (!data.userOpenId) {
    throw validationError("QQBot DM thread IDs require userOpenId.");
  }
  return [
    PREFIX,
    "dm",
    data.userOpenId,
    data.messageId ? encodeSegment(data.messageId) : undefined,
  ]
    .filter(Boolean)
    .join(":");
}

/** Decode a QQBot Chat SDK thread ID back to platform routing data. */
export function decodeQQBotThreadId(threadId: string): QQBotThreadId {
  const parts = threadId.split(":");
  if (parts[0] !== PREFIX || parts.length < 3) {
    throw validationError(`Invalid QQBot thread ID: ${threadId}`);
  }

  const kind = parts[1];
  if (kind === "guild") {
    if (parts.length < 4) {
      throw validationError(`Invalid QQBot guild thread ID: ${threadId}`);
    }
    return {
      kind,
      guildId: parts[2],
      channelId: parts[3],
      messageId: parts[4] ? decodeSegment(parts[4]) : undefined,
    };
  }

  if (kind === "group") {
    return {
      kind,
      groupOpenId: parts[2],
      messageId: parts[3] ? decodeSegment(parts[3]) : undefined,
    };
  }

  if (kind === "dms") {
    if (parts.length < 4 || parts.length > 5) {
      throw validationError(`Invalid QQBot guild DM thread ID: ${threadId}`);
    }
    return {
      kind,
      guildId: parts[2],
      userOpenId: parts[3],
      messageId: parts[4] ? decodeSegment(parts[4]) : undefined,
    };
  }

  if (kind === "dm") {
    if (parts.length > 4) {
      throw validationError(`Invalid QQBot DM thread ID: ${threadId}`);
    }
    return {
      kind,
      userOpenId: parts[2],
      messageId: parts[3] ? decodeSegment(parts[3]) : undefined,
    };
  }

  throw validationError(`Unsupported QQBot thread kind: ${kind}`);
}
