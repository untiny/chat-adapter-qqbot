import type { ChatInstance, Logger, StateAdapter } from "chat";

export function createMockLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => createMockLogger(),
  } as unknown as Logger;
}

export function createMockChatInstance() {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const chat = {
    calls,
    getLogger: () => createMockLogger(),
    getUserName: () => "qqbot",
    getState: () => ({}) as StateAdapter,
    handleIncomingMessage: async (...args: unknown[]) => {
      calls.push({ name: "handleIncomingMessage", args });
    },
    processMessage: async (...args: unknown[]) => {
      calls.push({ name: "processMessage", args });
    },
    processAction: async (...args: unknown[]) => {
      calls.push({ name: "processAction", args });
    },
    processAppHomeOpened: (...args: unknown[]) => {
      calls.push({ name: "processAppHomeOpened", args });
    },
    processAssistantContextChanged: (...args: unknown[]) => {
      calls.push({ name: "processAssistantContextChanged", args });
    },
    processAssistantThreadStarted: (...args: unknown[]) => {
      calls.push({ name: "processAssistantThreadStarted", args });
    },
    processMemberJoinedChannel: (...args: unknown[]) => {
      calls.push({ name: "processMemberJoinedChannel", args });
    },
    processModalClose: (...args: unknown[]) => {
      calls.push({ name: "processModalClose", args });
    },
    processModalSubmit: async (...args: unknown[]) => {
      calls.push({ name: "processModalSubmit", args });
      return undefined;
    },
    processOptionsLoad: async (...args: unknown[]) => {
      calls.push({ name: "processOptionsLoad", args });
      return { options: [] };
    },
  } as unknown as ChatInstance & {
    calls: Array<{ name: string; args: unknown[] }>;
  };
  return chat;
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
