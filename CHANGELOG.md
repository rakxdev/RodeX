# Changelog

All notable changes, newest first. REV letters map to review rounds with the
founder; each shipped round went through the protected-main PR flow with the
`quality` gate green.

## [MCP] — 2026-08-09 · The universal master-key interface (on feat/mcp, unpushed)

### Added
- **MCP server at `/mcp`** on the gateway worker (Streamable HTTP, stateless,
  JSON mode + SSE legacy lane): 14 tools over the full platform (apps, tables,
  items, queries) — any MCP-capable agent connects with one master key.
- **Master keys**: `rok_mcp_` + 43 base64url; console-managed (name +
  description), hash-only at rest, re-viewable **anytime** (no window), delete
  = instant revocation, **no rotation** (founder decisions). New admin
  endpoints + `rodex_mcp_keys` table (auto-provisioned).
- **Confirmation gate**: every mutation requires `confirmed: true`; refused
  otherwise with a structured `confirmation_required` response the agent must
  relay to the user. Server-enforced.
- **`POST /v1/table/delete`** — the one missing REST surface for full access
  (owned-only, 403 unowned — no existence leak).
- **MCP budgets** in the same single-point RateLimiterDO: 600 total / 120
  writes / 240 reads per minute; 429s name the budget.
- **Console MCP page** (`/mcp`): key management (mint/reveal/list/view/
  delete) + the operating manual (connect recipes for Cursor/Claude
  Code/mcp-remote, the confirmation protocol as a copy-paste prompt, tool
  reference, budgets, FAQ).
- Docs: docs/mcp.md, ADR-006, api.md + openapi.yaml sync, CHANGELOG.

### Fixed
- N/A (new surface; existing contracts untouched — old keys, apps, and
  endpoints all work as before).

## [REV H] — 2026-08-09 · Strict limits + observability + docs

### Added
- **Strict rate limiting**: single-point Durable Object counters
  (`RateLimiterDO`) replace the eventually-consistent edge bindings — no edge
  lag, no burst tolerance. 429s now **name their budget**
  (`"Rate limit exceeded — writes budget, retry in 59s"`).
- Tables provision **5 WCU / 5 RCU** (auto-upgrade of legacy 1/1 on next touch).
- **Observability**: `GET /v1/admin/apps/:id/usage` (limiter peek + storage
  size) and a LIVE METERS panel on app detail (30 s refresh).
- `POST /v1/admin/change-password` + PROFILE popup; app `description` field;
  `POST .../view-key` (48 h recovery window); `rok_`-prefixed keys;
  `POST .../delete` alias; `get` defaults `sk` to `"~"`.

### Fixed
- Split-flap board rebuilt to real half-flap mechanics; auto-sizes per message
  (no blank cells); endless cycling; resting shimmer.
- Logout hardened (persistent flag + hard navigation + `no-store` HTML).
- Force-purge crash (blank page); app-row read path dropping new fields.
- GitHub OAuth 403 (missing `User-Agent`); FoldButton submit type.
- First deploy of the DO needed `new_sqlite_classes` (free plan).

### Docs
- `docs/rate-limits.md` rewritten (strict model + stress evidence table),
  `docs/api.md` + `openapi.yaml` synced, `docs/env.md` added,
  `docs/decisions/` ADRs added, README modernized, CHANGELOG started.

## [REV G] — 2026-08-09 · Product polish rounds

### Added
- Public docs + usage pages with scroll-spy; SaaS landing (typewriter
  terminal, magnetic CTAs, tilt cards, ambient gradient, split-flap boards);
- `/credits` page + glowing RAKXDEV everywhere; gold favicon; themed
  scrollbars + loader; IST timestamps; app-board search + Fabricate modal;
  EXIT in danger red; CTA deduplication.

## [REV F] — 2026-08-09 · The gateway shipped (v1 core)

### Added
- Gateway: apps/tables/items/query APIs, idempotency, soft-delete lifecycle,
  purge cron, GitHub OAuth + password sessions, per-app budgets.
- Dashboard (React): login, app board, app detail (key reveal, tables,
  quick-start curl), docs, usage.
- CI/CD, protected main, deploy workflow, security headers, 79+ tests.

### Fixed
- Cross-site session cookie blocked by third-party-cookie policies → dual
  channel (cookie + bearer token); OAuth callback URL handoff.
- Logout 415 (bodyless POST rejected) → middleware now only rejects bodies.
