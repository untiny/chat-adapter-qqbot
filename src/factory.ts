import { ConsoleLogger, type Logger } from "chat";
import { validationError } from "./errors";
import { QQBotAdapter } from "./adapter";
import { resolveApiBaseUrl } from "./client";
import type { QQBotAdapterConfig, QQBotResolvedConfig, QQBotTransport } from "./types";

/** QQBot Gateway intent bit for guild metadata events. */
export const QQ_BOT_INTENT_GUILDS = 1 << 0;
/** QQBot Gateway intent bit for guild member events. */
export const QQ_BOT_INTENT_GUILD_MEMBERS = 1 << 1;
/** QQBot Gateway intent bit for guild direct messages. */
export const QQ_BOT_INTENT_DIRECT_MESSAGE = 1 << 12;
/** QQBot Gateway intent bit for group and C2C direct messages. */
export const QQ_BOT_INTENT_GROUP_AND_C2C = 1 << 25;
/** QQBot Gateway intent bit for button/interaction callbacks. */
export const QQ_BOT_INTENT_INTERACTION = 1 << 26;
/** QQBot Gateway intent bit for public guild channel messages. */
export const QQ_BOT_INTENT_PUBLIC_GUILD_MESSAGES = 1 << 30;

/** Default QQBot Gateway intents used by the adapter. */
export const DEFAULT_QQ_BOT_INTENTS =
  QQ_BOT_INTENT_PUBLIC_GUILD_MESSAGES |
  QQ_BOT_INTENT_DIRECT_MESSAGE |
  QQ_BOT_INTENT_GROUP_AND_C2C |
  QQ_BOT_INTENT_INTERACTION;

/** Create a QQBot adapter using config values plus `QQ_BOT_*` env fallbacks. */
export function createQQBotAdapter(
  config: Partial<QQBotAdapterConfig> & { logger?: Logger } = {},
): QQBotAdapter {
  return new QQBotAdapter(resolveConfig(config));
}

/** Resolve user config into a complete adapter config with defaults applied. */
export function resolveConfig(
  config: Partial<QQBotAdapterConfig> & { logger?: Logger } = {},
): QQBotResolvedConfig {
  const appId = config.appId ?? process.env.QQ_BOT_APP_ID;
  const secret = config.secret ?? process.env.QQ_BOT_SECRET;
  const webhookUrl = config.webhookUrl ?? process.env.QQ_BOT_WEBHOOK_URL;
  const transport = parseTransport(config.transport ?? process.env.QQ_BOT_TRANSPORT ?? "auto");

  if (!appId) {
    throw validationError("QQ_BOT_APP_ID is required. Pass appId or set QQ_BOT_APP_ID.");
  }
  if (!secret) {
    throw validationError("QQ_BOT_SECRET is required. Pass secret or set QQ_BOT_SECRET.");
  }
  if (transport === "webhook" && !webhookUrl) {
    throw validationError("QQBot transport 'webhook' requires webhookUrl or QQ_BOT_WEBHOOK_URL.");
  }

  const sandbox =
    config.sandbox ??
    (process.env.QQ_BOT_SANDBOX ? ["1", "true", "yes"].includes(process.env.QQ_BOT_SANDBOX) : false);
  const intentsRaw = config.intents ?? parseNumber(process.env.QQ_BOT_INTENTS);

  return {
    appId,
    secret,
    token: config.token ?? process.env.QQ_BOT_TOKEN,
    webhookUrl,
    transport,
    intents: intentsRaw ?? DEFAULT_QQ_BOT_INTENTS,
    sandbox,
    apiBaseUrl: resolveApiBaseUrl({
      apiBaseUrl: config.apiBaseUrl ?? process.env.QQ_BOT_API_BASE_URL,
      sandbox,
    }),
    tokenUrl: config.tokenUrl ?? process.env.QQ_BOT_TOKEN_URL,
    gatewayUrl: config.gatewayUrl ?? process.env.QQ_BOT_GATEWAY_URL ?? "",
    userName: config.userName ?? process.env.QQ_BOT_USER_NAME ?? "qqbot",
    logger: config.logger ?? new ConsoleLogger(),
    fetch: config.fetch,
    WebSocket: config.WebSocket,
    reconnect: config.reconnect ?? true,
  };
}

function parseTransport(value: string): QQBotTransport {
  if (value === "auto" || value === "webhook" || value === "websocket") {
    return value;
  }
  throw validationError(`Invalid QQBot transport: ${value}`);
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
