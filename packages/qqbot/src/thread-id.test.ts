import { describe, expect, it } from "vitest";
import { decodeQQBotThreadId, encodeQQBotThreadId } from "./thread-id";

describe("QQBot thread IDs", () => {
  it("round trips guild, group, C2C DM, and guild DM IDs", () => {
    const guild = {
      kind: "guild" as const,
      guildId: "guild123",
      channelId: "channel456",
      messageId: "m 1",
    };
    const group = { kind: "group" as const, groupOpenId: "group789", messageId: "m2" };
    const dm = { kind: "dm" as const, userOpenId: "user123", messageId: "m3" };
    const guildDm = {
      kind: "dms" as const,
      userOpenId: "user456",
      guildId: "guild789",
      messageId: "m4",
    };

    expect(encodeQQBotThreadId(guild)).toBe("qqbot:guild:guild123:channel456:bSAx");
    expect(encodeQQBotThreadId(group)).toBe("qqbot:group:group789:bTI");
    expect(encodeQQBotThreadId(dm)).toBe("qqbot:dm:user123:bTM");
    expect(encodeQQBotThreadId(guildDm)).toBe("qqbot:dms:guild789:user456:bTQ");

    expect(decodeQQBotThreadId(encodeQQBotThreadId(guild))).toEqual(guild);
    expect(decodeQQBotThreadId(encodeQQBotThreadId(group))).toEqual(group);
    expect(decodeQQBotThreadId(encodeQQBotThreadId(dm))).toEqual(dm);
    expect(decodeQQBotThreadId(encodeQQBotThreadId(guildDm))).toEqual(guildDm);
  });

  it("decodes a guild DM thread without a message ID", () => {
    expect(decodeQQBotThreadId("qqbot:dms:guild123:user456")).toEqual({
      kind: "dms",
      guildId: "guild123",
      userOpenId: "user456",
      messageId: undefined,
    });
  });

  it("treats the optional dm segment as a C2C message ID", () => {
    expect(decodeQQBotThreadId("qqbot:dm:user123:bTM")).toEqual({
      kind: "dm",
      userOpenId: "user123",
      messageId: "m3",
    });
  });

  it("rejects invalid IDs", () => {
    expect(() => decodeQQBotThreadId("slack:C123")).toThrow(/Invalid QQBot/);
    expect(() => decodeQQBotThreadId("qqbot:dm:user123:guild789:bTQ")).toThrow(
      /Invalid QQBot DM/,
    );
  });
});
