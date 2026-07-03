import { randomUUID } from "node:crypto";
import { Chat, type Lock, type QueueEntry, type StateAdapter } from "chat";
import { createQQBotAdapter } from "../src/index";

type StoredValue = {
  value: unknown;
  expiresAt?: number;
};

type StoredList = {
  values: unknown[];
  expiresAt?: number;
};

function createExampleState(): StateAdapter {
  const values = new Map<string, StoredValue>();
  const lists = new Map<string, StoredList>();
  const locks = new Map<string, Lock>();
  const queues = new Map<string, QueueEntry[]>();
  const subscriptions = new Set<string>();

  const isExpired = (expiresAt?: number) => typeof expiresAt === "number" && expiresAt <= Date.now();
  const queueKey = (threadId: string) => `queue:${threadId}`;
  const getValue = <T = unknown>(key: string): T | null => {
    const item = values.get(key);
    if (!item || isExpired(item.expiresAt)) {
      values.delete(key);
      return null;
    }
    return item.value as T;
  };
  const setValue = <T = unknown>(key: string, value: T, ttlMs?: number): void => {
    values.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
  };

  return {
    async connect() {},
    async disconnect() {},

    async get<T = unknown>(key: string): Promise<T | null> {
      return getValue<T>(key);
    },

    async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
      setValue(key, value, ttlMs);
    },

    async setIfNotExists(key: string, value: unknown, ttlMs?: number): Promise<boolean> {
      if (getValue(key) !== null) return false;
      setValue(key, value, ttlMs);
      return true;
    },

    async delete(key: string): Promise<void> {
      values.delete(key);
      lists.delete(key);
    },

    async appendToList(key: string, value: unknown, options = {}): Promise<void> {
      const existing = lists.get(key);
      const list = !existing || isExpired(existing.expiresAt) ? { values: [] } : existing;
      list.values.push(value);
      if (options.maxLength && list.values.length > options.maxLength) {
        list.values = list.values.slice(-options.maxLength);
      }
      list.expiresAt = options.ttlMs ? Date.now() + options.ttlMs : undefined;
      lists.set(key, list);
    },

    async getList<T = unknown>(key: string): Promise<T[]> {
      const list = lists.get(key);
      if (!list || isExpired(list.expiresAt)) {
        lists.delete(key);
        return [];
      }
      return list.values as T[];
    },

    async acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
      const current = locks.get(threadId);
      if (current && !isExpired(current.expiresAt)) return null;

      const lock = {
        threadId,
        token: randomUUID(),
        expiresAt: Date.now() + ttlMs,
      };
      locks.set(threadId, lock);
      return lock;
    },

    async extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
      const current = locks.get(lock.threadId);
      if (!current || current.token !== lock.token || isExpired(current.expiresAt)) return false;
      current.expiresAt = Date.now() + ttlMs;
      return true;
    },

    async releaseLock(lock: Lock): Promise<void> {
      const current = locks.get(lock.threadId);
      if (current?.token === lock.token) locks.delete(lock.threadId);
    },

    async forceReleaseLock(threadId: string): Promise<void> {
      locks.delete(threadId);
    },

    async enqueue(threadId: string, entry: QueueEntry, maxSize: number): Promise<number> {
      const key = queueKey(threadId);
      const queue = queues.get(key) ?? [];
      queue.push(entry);
      while (queue.length > maxSize) queue.shift();
      queues.set(key, queue);
      return queue.length;
    },

    async dequeue(threadId: string): Promise<QueueEntry | null> {
      const key = queueKey(threadId);
      const queue = queues.get(key) ?? [];
      while (queue.length > 0) {
        const entry = queue.shift()!;
        if (entry.expiresAt > Date.now()) {
          queues.set(key, queue);
          return entry;
        }
      }
      queues.delete(key);
      return null;
    },

    async queueDepth(threadId: string): Promise<number> {
      const key = queueKey(threadId);
      const queue = queues.get(key) ?? [];
      const live = queue.filter((entry) => entry.expiresAt > Date.now());
      queues.set(key, live);
      return live.length;
    },

    async subscribe(threadId: string): Promise<void> {
      subscriptions.add(threadId);
    },

    async unsubscribe(threadId: string): Promise<void> {
      subscriptions.delete(threadId);
    },

    async isSubscribed(threadId: string): Promise<boolean> {
      return subscriptions.has(threadId);
    },
  };
}

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
  return intentNames
    .filter(([intent]) => (value & intent) === intent)
    .map(([, name]) => name);
}

const bot = new Chat({
  userName: process.env.QQ_BOT_USER_NAME ?? "qqbot",
  adapters: {
    qqbot: createQQBotAdapter({
      transport: "websocket",
    }),
  },
  state: createExampleState(),
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
