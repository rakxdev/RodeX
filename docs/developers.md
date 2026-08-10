# RodexDB Developer Guide — connect your own code

Everything you need to point **your own code or agents** at a RodexDB
gateway — yours or ours. The golden rule: **the URL is always yours**.
No package ever hardcodes a gateway; you always pass it.

## Personas

| You are… | Use |
|---|---|
| Building a TypeScript/Node bot or script | [`rodexdb`](https://www.npmjs.com/package/rodexdb) SDK (ESM + CJS) |
| Connecting a local AI agent (Claude Desktop, VS Code, …) | [`rodex-mcp`](https://www.npmjs.com/package/rodex-mcp) stdio bridge |
| Calling from any language / curl | the REST API directly ([docs/api.md](api.md), [live reference](https://rodexdb.pages.dev/docs)) |

## Step 1 — pick your gateway

**Option A: your own deployment** (recommended) — click the Deploy button in
the README, follow the form, and note your `https://<name>.workers.dev` URL.
Tables auto-provision; nothing else to create.

**Option B: the live instance** — `https://rodex-gateway.rakxdev.workers.dev`
(read/play only — you still need an app + key from its console).

## Step 2 — get credentials

- **App key** (`rok_…`): console → create an app → the key is shown once
  (re-viewable inside 48 h; rotate anytime).
- **Master key** (`rok_mcp_…`, MCP only): console → MCP page → mint.

## Step 3 — the SDK (TypeScript, both module systems)

```bash
npm install rodexdb
```

```ts
import { RodexDB, RodexError } from "rodexdb";          // ESM
const { RodexDB } = require("rodexdb");                  // CJS — same API

const db = new RodexDB({
  url: "https://your-name.workers.dev",   // ← YOUR gateway
  appId: "app_xxxx",                       // ← YOUR app
  apiKey: "rok_...",                       // ← YOUR key
});

await db.createTable("users");
await db.put("users", { pk: "u1", name: "Ada" }, { requestId: "job-1" }); // idempotent
const user = await db.get("users", "u1");                 // null when missing
await db.update("users", "u1", "~", { name: "Grace" }, 1); // version-guarded
await db.delete("users", "u1", "~");
const page = await db.query("users", "u1", { limit: 10 });
```

Errors: every failure throws `RodexError` with `.status` / `.code`
(409 conflict · 413 too large · 429 rate limit — retry after the message's
seconds). Timeout default 15 s, configurable via `timeoutMs`.

Run the full example: [`examples/sdk-bot.mjs`](../examples/sdk-bot.mjs).

## Step 4 — the MCP bridge for local agents

```bash
npx -y rodex-mcp --url https://your-name.workers.dev/mcp --key $RODEX_MCP_KEY
```

- `--url` defaults to the live instance; always override with your own.
- Key via `--key` or `RODEX_MCP_KEY`.
- Client config (Claude Desktop / VS Code style):

```json
{ "mcpServers": {
  "rodex": { "command": "npx", "args": ["-y", "rodex-mcp", "--key", "rok_mcp_..."] }
} }
```

The agent gets the full 21-tool surface; every mutation still requires
`confirmed: true` (the server-side gate — agents cannot skip it).

## Budgets to keep in mind (per app, per minute)

600 total · 120 writes · 240 reads — plus the platform pool (1000/min) and
the MCP pool. 429s name the budget and carry `retry_after` seconds; writes
with a `request_id` are always safe to retry. Full math:
[docs/rate-limits.md](rate-limits.md).

## FAQ

- **Is the SDK required?** No — it is a thin typed wrapper over the REST
  contract. REST and MCP work without it.
- **Can I use our live instance?** For evaluation, with your own app+key.
  For real use, deploy your own — it is the same code, one button.
- **License?** Personal/educational use; commercial strictly forbidden —
  see [LICENSE](../LICENSE).
