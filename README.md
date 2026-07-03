# chat-adapters

Monorepo for Chat SDK adapter packages and runnable examples.

## Packages

| Package | Description |
| --- | --- |
| [`@untiny/chat-adapter-qqbot`](./packages/qqbot) | QQBot adapter for Chat SDK. |

## Examples

| Example | Command |
| --- | --- |
| [`examples/qqbot`](./examples/qqbot) | `pnpm --filter @chat-adapter-examples/qqbot websocket` |

The QQBot example loads environment variables from the repository root `.env` file. See [`packages/qqbot/README.md`](./packages/qqbot/README.md) for package usage, configuration, and QQBot-specific documentation.

## Development

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
- `pnpm test`: run workspace test suites.
- `pnpm typecheck`: run TypeScript type checking across workspace packages and examples.
- `pnpm clean`: remove workspace build outputs.
- `pnpm --filter @chat-adapter-examples/qqbot websocket`: build the QQBot adapter and run the local Gateway/WebSocket example.

## License

MIT

