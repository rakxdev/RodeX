# RodeX MCP Server — the Universal Master-Key Interface

Served by the gateway worker itself at:

```
https://rodex-gateway.rakxdev.workers.dev/mcp
```

**One endpoint. One master key. Every MCP-capable agent** (Cursor, Claude Code,
VS Code/Copilot, Zed, Windsurf, Gemini CLI, Codex, Cline, Continue, …) can
operate the entire platform — every app, every table, every item — through
standard Streamable HTTP (JSON-RPC). No OAuth, no per-agent accounts.

Design decisions are recorded in ADR-006 and `tasks/mcp-plan.md`.

## Authentication (master keys only)

- Keys are `rok_mcp_` + 43 base64url chars (256-bit), created **only in the
  console** (MCP page). Name (1–40 chars) + optional description (≤ 200).
- Every request must send `Authorization: Bearer rok_mcp_…`.
- Keys are **hash-only** at rest (HMAC-SHA256); the console can re-view the raw
  key **anytime** (AES-GCM ciphertext with no expiry — founder decision).
- **No rotation**: delete + recreate is the flow. Deleting a key revokes it
  instantly (every request is re-checked against the registry).
- Invalid/missing keys → HTTP 401 with a JSON-RPC error (`-32001`).

## Scope: full platform access

A master key can do everything the gateway can: apps, tables, items, queries —
creation and deletion included. The one safety mechanism is the
**confirmation gate** below.

## The confirmation gate (non-negotiable)

Every mutation tool (`create_*`, `delete_*`, `put_item`, `update_item`,
`delete_item`, `batch_put_item`) requires `confirmed: true` in its arguments. Without it the
server refuses with:

```json
{ "ok": false, "code": "confirmation_required",
  "what_would_happen": { "action": "delete_table", "app_id": "app_…", "table": "users" },
  "ask_user": "Present exactly what will happen to the user and ask for explicit approval. …" }
```

Agents are instructed (in every tool description, in `get_instructions`, and in
the console manual) to: **gather everything → present the full plan → get one
approval → execute step by step**. The server enforces the gate regardless of
what the agent "thinks" it was told.

## Tools (22)

| Tool | Kind | Confirmation | Notes |
|---|---|---|---|
| `health` | read | — | server + auth status |
| `get_instructions` | read | — | the operating manual (rules, budgets, conventions) |
| `list_apps` | read | — | every app (id, name, status, tables, description) |
| `get_app` | read | — | one app's details |
| `list_tables` | read | — | tables of an app |
| `get_item` | read | — | pk required; sk defaults to `~`; `strong` for read-after-write |
| `get_app_usage` | read | — | live request budgets (used/limit/remaining per minute) + storage size — the meters as data |
| `query` | read | — | pk + optional `sk_prefix`, limit ≤ 100, `next_start_key` pagination |
| `create_app` | **mutate** | ✅ | name pattern `^[a-z0-9][a-z0-9_-]{0,39}$` |
| `delete_app` | **mutate** | ✅ | soft delete (recoverable window, then purge) |
| `create_table` | **mutate** | ✅ | name pattern `^[a-z0-9][a-z0-9_-]{0,41}$` |
| `delete_table` | **mutate** | ✅ | irreversible — ALL data in the table |
| `put_item` | **mutate** | ✅ | `request_id` idempotency, `overwrite` force-replace, 20 KB cap |
| `batch_put_item` | **mutate** | ✅ | up to 50 items in one call; all-or-nothing validation; consumes N writes |
| `update_item` | **mutate** | ✅ | version-guarded (`expected_version` → 409) |
| `delete_item` | **mutate** | ✅ | exact pk/sk |

All tools return structured JSON text blocks: `{"ok":true,"result":…}` or
`{"ok":false,"code":<status>,"message":…}` — never raw crashes. Errors map to
the REST contract codes (400/403/404/409/413/429).

## One wire shape (REST = MCP)

MCP items use the same envelope as REST: `{ pk, sk?, data: {…} }` and the
payload is stored **flat** under `data` — a row written through `put_item` is
physically identical to one written through `POST /v1/item/put`. Mixing
interfaces is safe (locked by a contract test in the CI gate).

## Budgets

| Surface | Per minute | Key |
|---|---|---|
| MCP total (platform-wide) | 600 | `mcp:total` |
| MCP writes | 120 | `mcp:write` |
| MCP reads | 240 | `mcp:read` |

MCP budgets live in the **same single-point RateLimiterDO** as app budgets
(ADR-003). App budgets also apply to MCP traffic (an agent's writes count
against the app's 120 writes/min — visible in the app's LIVE METERS). 429s
name the budget and carry `retry_after`.

## Connecting agents

**Cursor** (`.cursor/mcp.json`):
```json
{ "mcpServers": {
  "rodexdb": {
    "url": "https://rodex-gateway.rakxdev.workers.dev/mcp",
    "headers": { "Authorization": "Bearer ${env:RODEX_MCP_KEY}" }
  }
} }
```

**Claude Code / CLI agents**:
```bash
export RODEX_MCP_KEY=rok_mcp_…
claude mcp add --transport http rodexdb https://rodex-gateway.rakxdev.workers.dev/mcp \
  --header "Authorization: Bearer $RODEX_MCP_KEY"
```

**stdio-only clients** (Claude Desktop, anything that only runs local servers) — two ways:
```bash
npx mcp-remote https://rodex-gateway.rakxdev.workers.dev/mcp \
  --header "Authorization: Bearer $RODEX_MCP_KEY"
```

or the branded wrapper (same bridge, zero config beyond the key):

```bash
npx -y rodex-mcp --key $RODEX_MCP_KEY                        # live instance
npx -y rodex-mcp --url <your-worker>/mcp --key $RODEX_MCP_KEY # your own deploy
```

Never paste the key into a chat — reference `${env:RODEX_MCP_KEY}`.

## Implementation notes

- **Transport**: Streamable HTTP, stateless (`createMcpHandler` from the Agents
  SDK, `@modelcontextprotocol/server` v2). `responseMode: "json"` for
  2026-protocol clients; the legacy lane serves 2025-era clients over SSE —
  that is the standard streamable flow real clients use today. No sessions, no
  long-lived streams → inside free-plan limits.
- **Origin/Host validation** is built into the handler (DNS-rebinding
  protection, spec-required); non-browser clients send no Origin and are fine.
- **`nodejs_compat`** compatibility flag is required (the Agents SDK uses
  `node:async_hooks` internally).
- **Testing**: 20+ integration tests drive real JSON-RPC over HTTP (auth
  matrix, handshake, tool discovery, gate refusals, full item lifecycle,
  structured errors, the MCP≡REST wire-shape contract test, and an
  end-to-end write-burst proving both budgets bite exactly and name
themselves).
