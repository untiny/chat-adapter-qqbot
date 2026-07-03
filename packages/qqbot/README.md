# @untiny/chat-adapter-qqbot

QQBot adapter for Chat SDK. It connects QQBot guild channels, groups, and C2C direct messages to the Chat SDK adapter interface, with support for webhook and Gateway WebSocket transports.

## Features

- Chat SDK adapter implementation for QQBot.
- Webhook and WebSocket event transports.
- Guild channel, group, and direct/C2C thread routing.
- Message sending, editing, deletion/recall, reactions, typing indicators, and message fetching where supported by QQBot APIs.
- File/media upload for outgoing messages.
- Chat SDK formatted content and card fallback rendering.
- QQBot button callback data helpers.
- Stable QQBot thread ID encoding and decoding helpers.

## Installation

```bash
pnpm add @untiny/chat-adapter-qqbot chat
```

`chat` is a peer dependency and must be installed by the host application.

## Configuration

You can pass configuration directly or use environment variables.

```bash
QQ_BOT_APP_ID=your-app-id
QQ_BOT_SECRET=your-app-secret
QQ_BOT_TOKEN=optional-static-token
QQ_BOT_WEBHOOK_URL=https://example.com/qqbot/webhook
QQ_BOT_TRANSPORT=auto
QQ_BOT_SANDBOX=false
QQ_BOT_INTENTS=1174409216
QQ_BOT_TOKEN_URL=https://bots.qq.com/app/getAppAccessToken
```

| Option | Environment variable | Description |
| --- | --- | --- |
| `appId` | `QQ_BOT_APP_ID` | QQBot application ID. Required. |
| `secret` | `QQ_BOT_SECRET` | QQBot application secret. Required. |
| `token` | `QQ_BOT_TOKEN` | Optional pre-issued bot token. When omitted, the adapter fetches app access tokens. |
| `webhookUrl` | `QQ_BOT_WEBHOOK_URL` | Public callback URL configured in QQBot. Required for explicit webhook mode. |
| `transport` | `QQ_BOT_TRANSPORT` | `auto`, `webhook`, or `websocket`. Defaults to `auto`. |
| `intents` | `QQ_BOT_INTENTS` | Gateway intents bitmask. Defaults to public guild messages + guild direct messages + group/C2C + interactions (`1174409216`). |
| `sandbox` | `QQ_BOT_SANDBOX` | Use QQBot sandbox API base URL when set to `1`, `true`, or `yes`. |
| `apiBaseUrl` | `QQ_BOT_API_BASE_URL` | Override QQBot REST API base URL. |
| `tokenUrl` | `QQ_BOT_TOKEN_URL` | Override QQBot app access token endpoint. Defaults to `https://bots.qq.com/app/getAppAccessToken`. |
| `gatewayUrl` | `QQ_BOT_GATEWAY_URL` | Override QQBot Gateway URL. |
| `userName` | `QQ_BOT_USER_NAME` | Bot display name exposed to Chat SDK. Defaults to `qqbot`. |

In `transport: "auto"` mode, the adapter uses webhooks when `webhookUrl` is configured and falls back to WebSocket when it is not.

## Usage

```ts
import { createQQBotAdapter } from "@untiny/chat-adapter-qqbot";

const qqbot = createQQBotAdapter({
  appId: process.env.QQ_BOT_APP_ID,
  secret: process.env.QQ_BOT_SECRET,
  webhookUrl: process.env.QQ_BOT_WEBHOOK_URL,
  transport: "auto",
});
```

Register the adapter with your Chat SDK application using the same adapter registration pattern used by your host app.

### Webhook Handling

When using webhook transport, forward QQBot callback requests to `handleWebhook`.

```ts
import { createQQBotAdapter } from "@untiny/chat-adapter-qqbot";

const qqbot = createQQBotAdapter({
  transport: "webhook",
  webhookUrl: process.env.QQ_BOT_WEBHOOK_URL,
});

export async function POST(request: Request): Promise<Response> {
  return qqbot.handleWebhook(request);
}
```

### WebSocket Transport

For Gateway WebSocket transport, omit `webhookUrl` in auto mode or set `transport: "websocket"`.

```ts
import { createQQBotAdapter } from "@untiny/chat-adapter-qqbot";

const qqbot = createQQBotAdapter({
  transport: "websocket",
  intents: 0xffffffff,
});
```

The adapter starts the Gateway connection during Chat SDK initialization and reconnects automatically after unexpected closes by default.

### WebSocket Example

Run the local Gateway example to verify that the adapter can connect to QQBot over WebSocket and dispatch events through Chat SDK handlers.

Required environment variables:

```bash
QQ_BOT_APP_ID=your-app-id
QQ_BOT_SECRET=your-app-secret
```

Optional environment variables:

```bash
QQ_BOT_TOKEN=optional-static-token
QQ_BOT_INTENTS=1174409216
QQ_BOT_SANDBOX=false
QQ_BOT_GATEWAY_URL=wss://gateway.example.com
QQ_BOT_TOKEN_URL=https://bots.qq.com/app/getAppAccessToken
QQ_BOT_USER_NAME=qqbot
```

If the Gateway closes with `4014 disallowed intents`, set `QQ_BOT_INTENTS` to match only the event permissions enabled for your QQBot application. Common values:

| Events | `QQ_BOT_INTENTS` |
| --- | ---: |
| Public guild channel messages | `1073741824` |
| Group and C2C messages | `33554432` |
| Button/interaction callbacks | `67108864` |
| Guild direct messages | `4096` |
| Group/C2C + guild direct messages | `33558528` |
| Group/C2C + interactions | `100663296` |
| Group/C2C + interactions + guild direct messages | `100667392` |
| Public guild + guild DM + group/C2C + interactions | `1174409216` |

Start the example:

```bash
pnpm --filter @chat-adapter-examples/qqbot websocket
```

The script loads environment variables from the project root `.env` file before it starts. The example calls `bot.initialize()` on startup, which opens the QQBot Gateway connection in `transport: "websocket"` mode. After it is running, trigger the bot from a QQ guild channel, group, or direct/C2C message. The terminal should log the incoming event and the bot should reply with a short confirmation message. Press `Ctrl+C` to shut down and disconnect the Gateway.

## Thread IDs

The adapter exposes helpers for encoding and decoding QQBot routing data into Chat SDK thread IDs.

```ts
import { decodeQQBotThreadId, encodeQQBotThreadId } from "@untiny/chat-adapter-qqbot";

const threadId = encodeQQBotThreadId({
  kind: "guild",
  guildId: "guild-id",
  channelId: "channel-id",
});

const decoded = decodeQQBotThreadId(threadId);
```

Supported thread kinds:

- `guild`: requires `guildId` and `channelId`.
- `group`: requires `groupOpenId`.
- `dm`: requires `userOpenId`.

## Button Data

QQBot keyboard callback payloads can be packed and unpacked with the button helpers.

```ts
import { decodeQQBotButtonData, encodeQQBotButtonData } from "@untiny/chat-adapter-qqbot";

const data = encodeQQBotButtonData("approve", "request-123");
const action = decodeQQBotButtonData(data);
```

## Exports

```ts
export { QQBotAdapter } from "@untiny/chat-adapter-qqbot";
export { createQQBotAdapter, resolveConfig } from "@untiny/chat-adapter-qqbot";
export { QQBotClient, resolveApiBaseUrl } from "@untiny/chat-adapter-qqbot";
export { QQBotFormatConverter } from "@untiny/chat-adapter-qqbot";
export { encodeQQBotThreadId, decodeQQBotThreadId } from "@untiny/chat-adapter-qqbot";
export { encodeQQBotButtonData, decodeQQBotButtonData } from "@untiny/chat-adapter-qqbot";
export type * from "@untiny/chat-adapter-qqbot";
```

## Development

From the repository root:

```bash
pnpm install
pnpm check
pnpm test
pnpm typecheck
pnpm build
```

Available scripts:

- `pnpm build`: build all workspace packages.
- `pnpm check`: run Biome formatting and lint checks.
- `pnpm check:fix`: apply Biome safe fixes and formatting.
- `pnpm format`: format supported files with Biome.
- `pnpm lint`: run Biome lint checks.
- `pnpm dev`: build in watch mode.
- `pnpm test`: run workspace test suites.
- `pnpm --filter @untiny/chat-adapter-qqbot test:watch`: run the QQBot package tests in watch mode.
- `pnpm --filter @chat-adapter-examples/qqbot websocket`: build the QQBot adapter and run the local Gateway/WebSocket example from `examples/qqbot`.
- `pnpm typecheck`: run TypeScript type checking across workspace packages and examples.
- `pnpm clean`: remove workspace build outputs.

## License

MIT




