# RodeX — Personal Database Gateway Platform

A database platform **you own**: create apps, get isolated credentials, and every
app gets its own tables on DynamoDB — through one clean HTTP API with a polished
console, full documentation, and honest rate limits you can watch live.

```
Cloudflare Pages (dashboard) ──┐
Your apps (bots/websites)  ────┼──▶ Cloudflare Worker (gateway) ──▶ DynamoDB (ap-southeast-1)
Cron (1/min) ──▶ purge finalized deletions                      (free tier: 25 GB, 25+25 units)
```

**Cost: $0.** AWS DynamoDB always-free tier + Cloudflare free tier. No credit card.

## What it gives you

- **Per-app isolation** — each app gets its own `rok_`-prefixed API key and its
  own `app_<app_id>_<name>` tables. Enforced at the storage layer: no cross-app
  access, ever.
- **One documented contract** — put / get / update / delete / query, idempotent
  writes (`request_id`, 24 h dedupe), version-guarded updates (`expected_version`).
- **Strict rate limits** — single-point counters (Durable Object): the numbers
  the docs promise are the numbers enforced. 429s name their budget.
- **Live observability** — per-app request meters + storage bars on every app
  detail page (zero-cost: limiter peek + `DescribeTable`).
- **Key recovery window** — 48 h after issue/rotation the console can re-show a
  key (AES-GCM encrypted at rest); after that, hash-only + rotate.
- **Console password you control** — change it anytime from PROFILE.

## Stack

- Gateway: Cloudflare Worker, TypeScript + Hono, `aws4fetch` (SigV4 → DynamoDB)
- Storage: DynamoDB ap-southeast-1, provisioned (tables at 5 WCU/5 RCU),
  Standard class — all core tables auto-provisioned on first use
- Dashboard: Cloudflare Pages, React + Vite + Tailwind v4 + Framer Motion
  (the "Instrument-Packet" design world)
- Strict rate limiting: Durable Object (`RateLimiterDO`, free plan, SQLite)
- Auth: GitHub OAuth (allowlisted users) + admin password; sessions are
  HMAC-signed tokens delivered as cookie AND bearer header (works even when
  third-party cookies are blocked)
- Storage abstraction: `mock` (zero-AWS local dev) / `aws` (production)

## Quick start (local, no AWS)

```bash
npm install
cp gateway/.dev.vars.example gateway/.dev.vars   # set ADMIN_PASSWORD (dev)
npm run dev                                       # gateway on :8787 (mock storage)
npm test                                          # 105 tests, mock storage
npm run dev:dashboard                             # dashboard (Vite dev)
```

## Commands

| Command | Description |
|---|---|
| `npm test` | vitest — 105 tests, mock storage |
| `npm run typecheck` | strict TS across gateway |
| `cd dashboard && npx tsc --noEmit` | dashboard typecheck |
| `npm run lint` | eslint (gateway) |
| `npm run deploy:gateway` | `wrangler deploy` the gateway |
| `npm run deploy:dashboard` | build + `wrangler pages deploy` |
| `npm run dev:dashboard` | Vite dev server (proxies `/v1` to the gateway) |

## Deploy (one time)

1. **AWS** ([docs/aws-setup.md](docs/aws-setup.md)): IAM user `rodex-gateway` +
   least-privilege policy. Tables (`rodex_apps`, `rodex_idem`, `rodex_meta`,
   TTL on `rodex_idem.exp`) are **auto-created by the gateway** on first use —
   nothing to create manually.
2. **Secrets** (gateway): `npx wrangler secret put` — see [docs/env.md](docs/env.md)
   for the full list.
3. **Deploy gateway**: `npm run deploy:gateway` → note the `*.workers.dev` URL.
4. **GitHub OAuth app**: callback URL = `<gateway-url>/v1/auth/github/callback`
   (allowed users: `rakxdev,newylbot,luminoxpp` in `wrangler.toml`).
5. **Deploy dashboard**: `npm run deploy:dashboard` → `https://rodexdb.pages.dev`.
6. **Verify** ([docs/testing.md](docs/testing.md) §Live): health → login →
   fabricate → key shown once → view-key within 48 h → table → CRUD →
   403 cross-app → 429 (budget-named) → soft-delete lifecycle.

## Docs

- [SPEC.md](SPEC.md) — the product spec (living)
- [docs/api.md](docs/api.md) — full API reference (every endpoint, every error)
- [docs/rate-limits.md](docs/rate-limits.md) — the capacity math + stress evidence
- [docs/env.md](docs/env.md) — every environment variable and secret
- [docs/aws-setup.md](docs/aws-setup.md) — IAM + auto-provisioning notes
- [docs/testing.md](docs/testing.md) — tests + live verification runbook
- [docs/ci-cd.md](docs/ci-cd.md) — CI gates, deploy, rollback
- [docs/research-validation.md](docs/research-validation.md) — verified sources
- [docs/mcp.md](docs/mcp.md) — the universal master-key MCP interface
- [docs/decisions/](docs/decisions/) — architecture decision records (001–006)
- [CHANGELOG.md](CHANGELOG.md) — shipped history
- [tasks/](tasks/) — plan + task list

## CI

Quality gates (lint → typecheck → tests → bundle → audit) run on every push/PR
via GitHub Actions (`.github/workflows/ci.yml`). `main` is protected: PRs only,
required `quality` check, strict up-to-date. Auto-deploy of the gateway runs on
main pushes (`.github/workflows/deploy.yml`) — see [docs/ci-cd.md](docs/ci-cd.md).

## Security invariants (tested, non-negotiable)

- App tables are always `app_<app_id>_<name>`; unowned tables → 403 (no existence leak)
- Keys stored hashed (HMAC), shown once, rotate instantly revokes; raw keys
  recoverable only inside the 48 h AES-GCM window
- Idempotency via `request_id` (24 h, auto-expired by DynamoDB TTL),
  version-guarded updates (409 on conflict)
- 20 KB write cap → one write never exceeds the 25-WCU free budget
- Rate limits are strict single-point counters; 429s name the budget and carry `retry_after`
- DynamoDB throttling maps to 429, never a 500
- Secrets only via `wrangler secret`; logs never contain keys or payloads
- Sessions: HMAC-signed, 12 h TTL, cookie + bearer token channels
