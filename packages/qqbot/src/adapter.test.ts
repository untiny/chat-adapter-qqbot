import { describe, expect, it, vi } from "vitest";
import { QQBotAdapter } from "./adapter";
import { resolveConfig } from "./factory";
import { createMockChatInstance, createMockLogger, jsonResponse } from "./test-utils";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readyState = 1;
  sent: string[] = [];

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

describe("QQBotAdapter", () => {
  it("dispatches webhook message events", async () => {
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        webhookUrl: "https://example.com/webhook",
        logger: createMockLogger(),
        fetch: vi.fn().mockResolvedValue(jsonResponse({ id: "bot", username: "bot", bot: true })),
      }),
    );
    const chat = createMockChatInstance();
    await adapter.initialize(chat);

    const response = await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          t: "AT_MESSAGE_CREATE",
          d: {
            id: "msg-1",
            guild_id: "guild",
            channel_id: "channel",
            content: "@qqbot hello",
            author: { id: "user", username: "Ada" },
            timestamp: "2026-07-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(chat.calls.some((call) => call.name === "processMessage")).toBe(true);
  });

  it("dispatches C2C message events using author user_openid", async () => {
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        webhookUrl: "https://example.com/webhook",
        logger: createMockLogger(),
        fetch: vi.fn().mockResolvedValue(jsonResponse({ id: "bot", username: "bot", bot: true })),
      }),
    );
    const chat = createMockChatInstance();
    await adapter.initialize(chat);

    const response = await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          t: "C2C_MESSAGE_CREATE",
          d: {
            id: "msg-1",
            content: "hello",
            author: { user_openid: "user-openid", username: "Ada" },
            timestamp: "2026-07-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(chat.calls.some((call) => call.name === "processMessage")).toBe(true);
  });

  it("dispatches guild direct messages with guild routing data", async () => {
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        webhookUrl: "https://example.com/webhook",
        logger: createMockLogger(),
        fetch: vi.fn().mockResolvedValue(jsonResponse({ id: "bot", username: "bot", bot: true })),
      }),
    );
    const chat = createMockChatInstance();
    await adapter.initialize(chat);

    const response = await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          t: "DIRECT_MESSAGE_CREATE",
          d: {
            id: "msg-1",
            guild_id: "guild",
            direct_message: true,
            content: "hello",
            author: { id: "user", username: "Ada" },
            timestamp: "2026-07-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const call = chat.calls.find((item) => item.name === "processMessage");
    expect(call?.args[1]).toContain("qqbot:dm:");
    expect(adapter.decodeThreadId(call?.args[1] as string)).toEqual({
      kind: "dm",
      userOpenId: "user",
      guildId: "guild",
      messageId: "msg-1",
    });
  });

  it("dispatches group message events", async () => {
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        webhookUrl: "https://example.com/webhook",
        logger: createMockLogger(),
        fetch: vi.fn().mockResolvedValue(jsonResponse({ id: "bot", username: "bot", bot: true })),
      }),
    );
    const chat = createMockChatInstance();
    await adapter.initialize(chat);

    const response = await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          t: "GROUP_MESSAGE_CREATE",
          d: {
            id: "msg-1",
            group_openid: "group-openid",
            content: "hello group",
            author: { member_openid: "member-openid", username: "Ada" },
            timestamp: "2026-07-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const call = chat.calls.find((item) => item.name === "processMessage");
    expect(call?.args[1]).toContain("qqbot:group:");
  });

  it("marks group at-message events as mentions", async () => {
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        webhookUrl: "https://example.com/webhook",
        logger: createMockLogger(),
        fetch: vi.fn().mockResolvedValue(jsonResponse({ id: "bot", username: "bot", bot: true })),
      }),
    );
    const chat = createMockChatInstance();
    await adapter.initialize(chat);

    await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          t: "GROUP_AT_MESSAGE_CREATE",
          d: {
            id: "msg-1",
            group_openid: "group-openid",
            content: "@qqbot hello",
            author: { member_openid: "member-openid", username: "Ada" },
            timestamp: "2026-07-02T00:00:00.000Z",
          },
        }),
      }),
    );

    const call = chat.calls.find((item) => item.name === "processMessage");
    const parseMessage = call?.args[2] as () => Promise<{ isMention?: boolean }>;
    await expect(parseMessage()).resolves.toMatchObject({ isMention: true });
  });

  it("starts websocket transport when webhookUrl is absent", async () => {
    MockWebSocket.instances = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "bot", username: "bot", bot: true }))
      .mockResolvedValueOnce(jsonResponse({ url: "wss://gateway.example.com" }));
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        logger: createMockLogger(),
        fetch: fetchMock,
        WebSocket: MockWebSocket,
        reconnect: false,
      }),
    );

    await adapter.initialize(createMockChatInstance());

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe("wss://gateway.example.com");
    await adapter.disconnect();
  });

  it("sends identify after gateway hello", async () => {
    MockWebSocket.instances = [];
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        gatewayUrl: "wss://gateway.example.com",
        logger: createMockLogger(),
        fetch: vi.fn().mockResolvedValue(jsonResponse({ id: "bot", username: "bot", bot: true })),
        WebSocket: MockWebSocket,
        reconnect: false,
      }),
    );

    await adapter.initialize(createMockChatInstance());
    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    if (!socket) throw new Error("Expected gateway socket to be created.");

    socket.onmessage?.({
      data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const identifyPayload = socket.sent[0];
    expect(identifyPayload).toBeDefined();
    if (!identifyPayload) throw new Error("Expected identify payload to be sent.");
    expect(JSON.parse(identifyPayload).op).toBe(2);
    await adapter.disconnect();
  });

  it("reuses discovered gateway URL when reconnecting", async () => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "bot", username: "bot", bot: true }))
      .mockResolvedValueOnce(jsonResponse({ url: "wss://gateway.example.com" }));
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        logger: createMockLogger(),
        fetch: fetchMock,
        WebSocket: MockWebSocket,
        reconnect: true,
      }),
    );

    await adapter.initialize(createMockChatInstance());
    MockWebSocket.instances[0]?.onclose?.({ code: 4009, reason: "session timed out" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]?.url).toBe("wss://gateway.example.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await adapter.disconnect();
    vi.useRealTimers();
  });

  it("does not reconnect after disallowed intents close", async () => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    const adapter = new QQBotAdapter(
      resolveConfig({
        appId: "app",
        secret: "secret",
        token: "token",
        gatewayUrl: "wss://gateway.example.com",
        logger: createMockLogger(),
        fetch: vi.fn().mockResolvedValue(jsonResponse({ id: "bot", username: "bot", bot: true })),
        WebSocket: MockWebSocket,
        reconnect: true,
      }),
    );

    await adapter.initialize(createMockChatInstance());
    MockWebSocket.instances[0]?.onclose?.({
      code: 4014,
      reason: "disallowed intents",
      wasClean: true,
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(MockWebSocket.instances).toHaveLength(1);

    await adapter.disconnect();
    vi.useRealTimers();
  });
});
