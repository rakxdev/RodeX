# Changelog

All notable changes, newest first. REV letters map to review rounds with the
founder; each shipped round went through the protected-main PR flow with the
`quality` gate green.

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
