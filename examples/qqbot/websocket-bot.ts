import { createMemoryState } from "@chat-adapter/state-memory";
import { createQQBotAdapter } from "@untiny/chat-adapter-qqbot";
import { Chat } from "chat";

function ensureWebSocketAvailable(): void {
  if (typeof globalThis.WebSocket === "undefined") {
    console.error(
      "This example requires a Node.js runtime with global WebSocket support. Upgrade Node.js or provide a WebSocket implementation in the adapter config.",
    );
    process.exit(1);
  }
}

ensureWebSocketAvailable();

const intentNames = [
  [1 << 0, "guilds"],
  [1 << 1, "guild_members"],
  [1 << 12, "guild_direct_messages"],
  [1 << 25, "group_and_c2c"],
  [1 << 26, "interactions"],
  [1 << 30, "public_guild_messages"],
] as const;

function describeIntents(value: number): string[] {
  return intentNames.filter(([intent]) => (value & intent) === intent).map(([, name]) => name);
}

const bot = new Chat({
  userName: process.env.QQ_BOT_USER_NAME ?? "qqbot",
  adapters: {
    qqbot: createQQBotAdapter({
      transport: "websocket",
    }),
  },
  state: createMemoryState(),
});

bot.onNewMention(async (thread, message) => {
  console.log("[qqbot:new-mention]", {
    threadId: thread.id,
    messageId: message.id,
    text: message.text,
  });
  await thread.subscribe();
  await thread.post(`Received your mention: ${message.text || "(no text)"}`);
});

bot.onDirectMessage(async (thread, message) => {
  console.log("[qqbot:direct-message]", {
    threadId: thread.id,
    messageId: message.id,
    text: message.text,
  });
  await thread.post(`Received your direct message: ${message.text || "(no text)"}`);
});

bot.onNewMessage(/[\s\S]*/, async (thread, message) => {
  console.log("[qqbot:new-message]", {
    threadId: thread.id,
    messageId: message.id,
    text: message.text,
    isMention: message.isMention,
  });
});

bot.onSubscribedMessage(async (thread, message) => {
  console.log("[qqbot:subscribed-message]", {
    threadId: thread.id,
    messageId: message.id,
    text: message.text,
  });
  await thread.post(`Received your follow-up: ${message.text || "(no text)"}`);
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received. Shutting down QQBot WebSocket example...`);
  await bot.shutdown();
  process.exit(0);
}

process.once("SIGINT", (signal) => void shutdown(signal));
process.once("SIGTERM", (signal) => void shutdown(signal));

const configuredIntents = Number(process.env.QQ_BOT_INTENTS ?? 0);
console.log("Starting QQBot WebSocket example...", {
  intents: process.env.QQ_BOT_INTENTS ? configuredIntents : "default",
  enabledIntents: process.env.QQ_BOT_INTENTS ? describeIntents(configuredIntents) : "default",
});
try {
  await bot.initialize();
  console.log("QQBot WebSocket example is running. Press Ctrl+C to stop.");
} catch (error) {
  console.error("Failed to start QQBot WebSocket example.", error);
  if (String(error).includes("不支持的调用") || String(error).includes("ResourceNotFoundError")) {
    console.error(
      [
        "QQBot rejected the Gateway discovery API call.",
        "If your bot supports Gateway/WebSocket, set QQ_BOT_GATEWAY_URL explicitly in .env.",
        "For production this is usually wss://api.sgroup.qq.com/websocket; for sandbox, use the matching sandbox Gateway URL.",
        "If the error continues, this QQBot application may only support webhook callbacks instead of Gateway/WebSocket events.",
      ].join("\n"),
    );
  }
  process.exit(1);
}
