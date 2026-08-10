# RodeX v1 — Environment Reference

Every variable, secret, and binding the gateway reads. Secrets are set with
`npx wrangler secret put <NAME>`; plain vars live in `wrangler.toml [vars]`;
dev values go in `gateway/.dev.vars` (see `.dev.vars.example`).

## Plain vars (`wrangler.toml [vars]`)

| Var | Default | Used by | Purpose |
|---|---|---|---|
| `STORAGE` | `"aws"` (toml) / `"mock"` (dev) | `storage.ts` | `aws` = real DynamoDB, `mock` = in-memory (tests/dev) |
| `DASHBOARD_ORIGIN` | `https://rodexdb.pages.dev` | CORS + OAuth redirect + cookies | the console origin (single allowed Origin) |

## Secrets (`wrangler secret put`)

| Secret | Min | Used by | Purpose |
|---|---|---|---|
| `ADMIN_PASSWORD` | 12 chars | `admin.ts` login | factory password; once changed via `POST /v1/admin/change-password`, the stored hash (DynamoDB settings row) takes over and the env value is only a fallback |
| `SESSION_SECRET` | 24 chars | session signing, key hashing, AES-GCM key derivation | HMAC for session tokens + `rok_` key hashes + the 48 h key cipher. Rotating it invalidates all sessions and key recovery — do NOT rotate casually |
| `GITHUB_CLIENT_ID` | — | OAuth | GitHub OAuth app id |
| `GITHUB_CLIENT_SECRET` | — | OAuth | GitHub OAuth app secret |
| `AWS_ACCESS_KEY_ID` | — | DynamoDB (SigV4) | IAM user `rodex-gateway` (least-privilege, docs/aws-setup.md) |
| `AWS_SECRET_ACCESS_KEY` | — | DynamoDB (SigV4) | same |

## Bindings (`wrangler.toml`)

| Binding | Type | Purpose |
|---|---|---|
| `RL_DO` | Durable Object (`RateLimiterDO`, SQLite) | single-point strict rate counters — every budget (total / writes / reads / platform / admin) lives here |
| `triggers.crons` | `* * * * *` | purge worker: finalizes soft-deleted apps whose window passed |

## Reserved settings rows (DynamoDB, auto-created)

| Table | Key | Row | Written by |
|---|---|---|---|
| `rodex_apps` | `appId` | one row per app | registry |
| `rodex_idem` | `requestId` | idempotency records, TTL on `exp` (auto-enabled) | idempotency layer |
| `rodex_meta` | `k` | `admin_password_hash` (after first password change) | change-password |

## Dev only (`.dev.vars`)

`ADMIN_PASSWORD` (min 12), optional `SESSION_SECRET` (dev fallback exists), and
any of the above to test OAuth/AWS locally. `STORAGE=mock` needs no AWS keys.
