# ADR-006: MCP server on the gateway — master keys, full access, confirmation gate

## Status
Accepted

## Date
2026-08-09

## Context
The platform should be operable from any coding agent (Cursor, Claude Code,
VS Code/Copilot, Windsurf, Zed, Gemini CLI, Codex, …). The MCP standard makes
one server speak to every client. Research (official Cloudflare + MCP spec
docs, 2026-07) confirmed: free Workers hosting is first-party supported, the
stateless `createMcpHandler` path is the current blessed API, and static
Bearer tokens are supported by every major client (Cursor headers, Claude
Code headers, `mcp-remote` bridge for stdio-only clients).

Founder decisions locked during review: **master keys only** (no GitHub OAuth
for MCP), **full platform access** (create/delete apps, tables, items),
`rok_mcp_`-prefixed keys, console-managed with name + description, view-again
**anytime** (no window), delete-only lifecycle (**no rotation**).

## Decision
- The MCP server runs **inside the existing gateway worker** at `/mcp`
  (one deploy, one secret set; MCP budgets share the same RateLimiterDO —
  single authority, no drift).
- Auth: `Authorization: Bearer rok_mcp_…` verified against hash-only rows in
  the new auto-provisioned `rodex_mcp_keys` table (PAY_PER_REQUEST control
  table, same pattern as `rodex_meta`). Raw keys recoverable anytime via
  AES-GCM ciphertext (no expiry — differs from app keys' 48 h window).
- Tools reuse the exact tested REST handlers (items/tables/registry), so MCP
  traffic gets the same validation, idempotency, size caps, and per-app
  budgets. 14 tools: 7 read + 7 mutation.
- **Confirmation gate**: every mutation requires `confirmed: true`; otherwise
  the server returns a structured `confirmation_required` refusal the agent
  must relay to the user. Enforced server-side, not by description.
- New gateway surface: `POST /v1/table/delete` (owned-only, 403 unowned —
  no existence leak) — the only missing REST capability for full access.
- Transport: Streamable HTTP, stateless, JSON mode for modern clients, SSE
  legacy lane for 2025-era clients; `nodejs_compat` for the SDK.

## Alternatives Considered
- **Separate `rodex-mcp` worker**: name checked available; rejected — a
  second worker means a second secret set and a second rate authority for no
  benefit.
- **GitHub OAuth for MCP**: rejected by founder — the master key is the only
  door (already-allowlisted GitHub is used for the console only).
- **Per-app MCP keys**: rejected — master keys are the universal interface;
  per-app isolation already exists at the table level via ownership checks.
- **Sessions/stateful transport**: rejected — stateless per request, no
  long-lived streams (free-plan wall-clock limits).

## Consequences
- One key = full platform power: the confirmation gate + instant delete are
  the safety net. Key in a chat = exposure → keys are hash-only, views are
  console-only, delete & recreate is instant.
- MCP traffic consumes both MCP budgets (600/120/240 per min) and app
  budgets (an agent's writes show up in the app's LIVE METERS — correct).
- The key cipher uses `SESSION_SECRET` (same as app keys): rotating
  SESSION_SECRET invalidates sessions AND makes existing MCP keys un-viewable
  (delete + recreate). Documented in docs/env.md.
