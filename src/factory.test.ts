import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_QQ_BOT_INTENTS, resolveConfig } from "./factory";
import { createMockLogger } from "./test-utils";

describe("resolveConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses websocket in auto mode when webhookUrl is absent", () => {
    const config = resolveConfig({
      appId: "app",
      secret: "secret",
      logger: createMockLogger(),
    });
    expect(config.transport).toBe("auto");
    expect(config.webhookUrl).toBeUndefined();
    expect(config.intents).toBe(DEFAULT_QQ_BOT_INTENTS);
  });

  it("reads environment variables", () => {
    vi.stubEnv("QQ_BOT_APP_ID", "env-app");
    vi.stubEnv("QQ_BOT_SECRET", "env-secret");
    vi.stubEnv("QQ_BOT_WEBHOOK_URL", "https://example.com/webhook");
    vi.stubEnv("QQ_BOT_TRANSPORT", "webhook");

    const config = resolveConfig({ logger: createMockLogger() });

    expect(config.appId).toBe("env-app");
    expect(config.secret).toBe("env-secret");
    expect(config.webhookUrl).toBe("https://example.com/webhook");
    expect(config.transport).toBe("webhook");
  });

  it("rejects explicit webhook transport without a webhook URL", () => {
    expect(() =>
      resolveConfig({
        appId: "app",
        secret: "secret",
        transport: "webhook",
        logger: createMockLogger(),
      }),
    ).toThrow(/requires webhookUrl/);
  });
});
