import { describe, expect, it, vi } from "vitest";
import { QQBotClient } from "./client";
import { jsonResponse } from "./test-utils";

describe("QQBotClient", () => {
  it("posts guild messages with app access token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ id: "msg-1", channel_id: "channel" }));
    const client = new QQBotClient({
      appId: "app",
      secret: "secret",
      apiBaseUrl: "https://api.example.com",
      fetch: fetchMock,
    });

    const response = await client.postMessage(
      { kind: "guild", guildId: "guild", channelId: "channel" },
      { content: "hello" },
    );

    expect(response.id).toBe("msg-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://bots.qq.com/app/getAppAccessToken",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/channels/channel/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "hello" }),
      }),
    );
  });

  it("supports overriding the app access token endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ url: "wss://gateway.example.com" }));
    const client = new QQBotClient({
      appId: "app",
      secret: "secret",
      apiBaseUrl: "https://api.example.com",
      tokenUrl: "https://token.example.com/app/getAppAccessToken",
      fetch: fetchMock,
    });

    await client.getGateway();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://token.example.com/app/getAppAccessToken",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("posts guild direct messages through the dms endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "msg-1" }));
    const client = new QQBotClient({
      appId: "app",
      secret: "secret",
      token: "token",
      apiBaseUrl: "https://api.example.com",
      fetch: fetchMock,
    });

    await client.postMessage(
      { kind: "dm", userOpenId: "user", guildId: "guild", messageId: "incoming-msg" },
      { content: "hello", msg_id: "incoming-msg" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/dms/guild/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "hello", msg_id: "incoming-msg" }),
      }),
    );
  });
});
