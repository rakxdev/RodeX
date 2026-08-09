# RodeX — Personal Database Gateway Platform · Version 1

A database platform **you own**: create apps, get isolated credentials, and every
app gets its own tables on DynamoDB — through one clean HTTP API with one docs page.

```
Cloudflare Pages (dashboard) ──┐
Your apps (bots/websites)  ────┼──▶ Cloudflare Worker (gateway) ──▶ DynamoDB (ap-southeast-1)
Cron (1/min) ──▶ purge finalized deletions                      (free tier: 25 GB, 25+25 units)
```

**Cost: $0.** AWS DynamoDB always-free tier + Cloudflare free tier. No credit card.

## Stack

- Gateway: Cloudflare Worker, TypeScript + Hono, `aws4fetch` (SigV4 → DynamoDB)
- Storage: DynamoDB ap-southeast-1, provisioned 25/25, Standard class
- Dashboard: Cloudflare Pages (vanilla HTML/CSS/JS), login via GitHub OAuth + password
- Storage abstraction: `mock` (zero-AWS local dev) / `aws` (production)

## Quick start (local, no AWS)

```bash
npm install
cp gateway/.dev.vars.example gateway/.dev.vars   # set ADMIN_PASSWORD (dev)
npm run dev                                       # gateway on :8787 (mock storage)
npm test                                          # 70+ tests
cd dashboard && python3 -m http.server 8788       # dashboard (dev DASHBOARD_ORIGIN)
```

## Deploy (one time)

1. **AWS** (docs/aws-setup.md): IAM user `rodex-gateway` + least-privilege policy;
   create `rodex_apps` + `rodex_idem` (with TTL) in ap-southeast-1.
2. **Secrets** (gateway):
   ```bash
   cd gateway
   npx wrangler secret put ADMIN_PASSWORD      # min 12 chars
   npx wrangler secret put SESSION_SECRET      # min 24 chars
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put AWS_ACCESS_KEY_ID
   npx wrangler secret put AWS_SECRET_ACCESS_KEY
   ```
3. **Deploy gateway**: `npm run deploy:gateway` → note the `*.workers.dev` URL.
4. **GitHub OAuth app**: callback URL = `<gateway-url>/v1/auth/github/callback`
   (allowed users already in wrangler.toml: rakxdev, newylbot, luminoxpp).
5. **Deploy dashboard**: `npm run deploy:dashboard` (project `rodexdb` →
   `https://rodexdb.pages.dev`; fallback `rodex-db` if taken), then set
   `DASHBOARD_ORIGIN` to the final Pages URL in `wrangler.toml` and redeploy.
6. **Verify** (docs/testing.md §Live): health → create app → table → CRUD → 403 cross-app → 429 → soft delete lifecycle.

## Docs

- [SPEC.md](SPEC.md) — the spec (living)
- [docs/api.md](docs/api.md) — full API reference
- [docs/rate-limits.md](docs/rate-limits.md) — the capacity math behind every limit
- [docs/aws-setup.md](docs/aws-setup.md) — IAM + tables
- [docs/testing.md](docs/testing.md) — tests + live runbook
- [docs/ci-cd.md](docs/ci-cd.md) — CI gates, deploy, rollback
- [docs/research-validation.md](docs/research-validation.md) — verified sources
- [tasks/](tasks/) — plan + task list (Version 1 scope)

## CI

Quality gates (lint → typecheck → tests → bundle → audit) run on every push/PR
via GitHub Actions (`.github/workflows/ci.yml`). Opt-in auto-deploy to Cloudflare
and rollback runbook: [docs/ci-cd.md](docs/ci-cd.md).

## Security invariants (tested, non-negotiable)

- App tables are always `app_<app_id>_<name>`; unowned tables → 403 (no existence leak)
- Keys stored hashed (HMAC), shown once, rotate instantly revokes
- Idempotency via `request_id` (24 h), version-guarded updates (409 on conflict)
- 20 KB write cap → never exceeds the 25-WCU free budget → no throttling by design
- DynamoDB throttling maps to 429 + Retry-After, never a 500
- Secrets only via `wrangler secret`; logs never contain keys or payloads
