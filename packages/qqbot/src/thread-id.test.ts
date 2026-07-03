import { describe, expect, it } from "vitest";
import { decodeQQBotThreadId, encodeQQBotThreadId } from "./thread-id";

describe("QQBot thread IDs", () => {
  it("round trips guild, group, and dm IDs", () => {
    const guild = { kind: "guild" as const, guildId: "g:1", channelId: "c/1", messageId: "m 1" };
    const group = { kind: "group" as const, groupOpenId: "group/open", messageId: "m2" };
    const dm = { kind: "dm" as const, userOpenId: "user/open", messageId: "m3" };
    const guildDm = {
      kind: "dm" as const,
      userOpenId: "user/open",
      guildId: "guild/open",
      messageId: "m4",
    };

    expect(decodeQQBotThreadId(encodeQQBotThreadId(guild))).toEqual(guild);
    expect(decodeQQBotThreadId(encodeQQBotThreadId(group))).toEqual(group);
    expect(decodeQQBotThreadId(encodeQQBotThreadId(dm))).toEqual(dm);
    expect(decodeQQBotThreadId(encodeQQBotThreadId(guildDm))).toEqual(guildDm);
  });

  it("rejects invalid IDs", () => {
    expect(() => decodeQQBotThreadId("slack:C123")).toThrow(/Invalid QQBot/);
  });
});
