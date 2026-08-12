# Spec: RodeX — Personal Database Gateway Platform — Version 1

> **Version:** 1.0 (docs in this repo describe Version 1)
> Status: SPECIFIED — awaiting final approval, then plan execution.
> Research basis: verified May 2026 against official AWS DynamoDB pricing/quotas
> and Cloudflare Workers limits/rate-limit docs (see `docs/research-validation.md`).

## 1. Objective

**What:** A personal "database platform" Rakesh owns completely. He creates an
application (or bot), the platform issues credentials (`app_id` + `api_key`), and
that app can create its own tables and store/read its own data — isolated from
every other app. One shared API, one shared docs page, one dashboard. No other
database company involved.

**Why:** Repeated raw DynamoDB setup (scripts, table creation, credentials) for
every bot/website is painful. This productizes it: create app → copy key →
follow docs → done.

**Who uses it:** Rakesh and his own apps (websites, Cloudflare Workers backends,
Telegram bots). Not a public product in v1, but engineered production-grade.

**Success looks like:**
- Free forever (DynamoDB always-free 25 GB / 25+25 units + Cloudflare free tier).
- New app provisioned in < 1 minute including its docs example.
- No app can read/write another app's data (proven by automated tests).
- Predictable, documented rate limits; zero DynamoDB throttling in normal use.
- All failure modes map to clean HTTP errors; nothing crashes silently.

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Gateway | Cloudflare Worker — TypeScript + **Hono** | Cloudflare's official pattern; tiny; fast |
| Database | **DynamoDB** — **ap-southeast-1 (Singapore)**, provisioned mode, Standard class | 25 GB + 25 read/s + 25 write/s always-free; Singapore = nearest region to Rakesh's dev servers/bots |
| AWS access | **aws4fetch** (SigV4) + IAM user, least-privilege policy | official pattern (cloudflare/workers-aws-template) |
| Dashboard | Cloudflare Pages (static) + Pages functions not needed — OAuth handled by gateway | free, unlimited bandwidth |
| Login | **GitHub OAuth** (client ID + secret) **+ admin password fallback** | Rakesh has GitHub OAuth app credentials |
| Tests | **Vitest** unit + curl integration against `wrangler dev` | same toolchain |
| Local dev | `STORAGE=mock` in-memory adapter — full gateway testable with zero AWS creds | instant feedback, safe |
| Secrets | `wrangler secret`: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ADMIN_PASSWORD, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_ALLOWED_USERS | never in code/logs |

Not used in v1: D1, KV as primary store, S3, on-demand DynamoDB (costs money),
chunking (see §6.2), global tables.

## 3. Commands

```bash
npm install                  # install deps
npm run dev                  # wrangler dev — mock storage (no AWS needed)
npm test                     # vitest unit tests
npm run typecheck            # tsc --noEmit
npm run dev:real             # STORAGE=aws wrangler dev (secrets required)
npm run deploy:gateway       # wrangler deploy
npm run deploy:dashboard     # wrangler pages deploy dashboard/ --project-name rodex-dash
```

Secrets: `wrangler secret put <NAME>` for the six secrets in §2.

## 4. Project Structure

```
RodeX/
├── gateway/                 → Cloudflare Worker API
│   ├── src/
│   │   ├── index.ts         → Hono app + routing + error mapping
│   │   ├── env.ts           → typed env (secrets/bindings)
│   │   ├── auth.ts          → app key auth (HMAC hashed, constant-time) + admin session
│   │   ├── oauth.ts         → GitHub OAuth start/callback
│   │   ├── registry.ts      → apps: create/list/rotate/delete/soft-delete state machine
│   │   ├── items.ts         → put/get/update/delete/query handlers
│   │   ├── tables.ts        → table create (auto-prefixed app_<id>_), list
│   │   ├── storage.ts       → storage interface + error mapping (throttle→429)
│   │   ├── storage-mock.ts  → in-memory impl (dev/tests)
│   │   ├── storage-aws.ts   → DynamoDB impl via aws4fetch
│   │   ├── idempotency.ts   → request_id dedupe (meta table, TTL)
│   │   ├── purge.ts         → cron: finalize scheduled deletions
│   │   └── limits.ts        → size caps + rate-limit wiring
│   ├── test/*.test.ts       → vitest
│   ├── wrangler.toml        → bindings, ratelimits, cron, vars
│   └── package.json
├── dashboard/               → Pages static admin UI
│   ├── index.html (login) / apps.html / app.html / docs.html
│   └── css/ js/
├── docs/                    → rate-limits.md, api.md, testing.md, research-validation.md
├── SPEC.md                  → this document (living)
└── tasks/                   → plan.md, todo.md
```

## 5. Code Style

- TypeScript strict. Logic in modules; Hono handlers stay thin.
- JSON responses: `{ ok: true, result }` | `{ ok: false, error: { code, message } }`.
- No secrets in code; typed `env` access only via `env.ts`.
- All DynamoDB data uses `pk` / `sk` (+ `data`, `_v`) attribute scheme.
- Errors: throw typed `HttpError(status, message)`; central handler maps.

```ts
app.post("/v1/item/put", async (c) => {
  const ctx = await authenticate(c, env);              // 401
  const body = await parseJson(c);                     // 400
  assertSize(body.item, env);                          // 413 (> 400 KB)
  await registry.assertTableAccess(ctx, body.table);   // 403
  const result = await storage.put(ctx, body, c.req.header("x-request-id"));
  return c.json({ ok: true, result });
});
```

## 6. Data Design & Limits

### 6.1 DynamoDB layout (all tables in ap-southeast-1)

- `meta` table — platform control data: apps registry (app_id PK), key hashes,
  allowed-tables list, idempotency records (request_id PK, TTL 24 h),
  purge schedule rows.
- Per-app data tables: named `app_<appId>_<name>` by the gateway — apps never
  supply raw table names. Registry records the mapping; any request for a table
  not in the app's list → 403.

### 6.2 Item size policy (throttle-safe — critical math in docs/rate-limits.md)

- **Hard item cap: 400 KB per item (413 above) in both capacity modes.**
  NORMAL charges write-units by item size; 20 KB or smaller is the recommended
  cost-friendly shape. PERFORMANCE uses on-demand billing with guardrails.
- Read: items up to 400 KB are returned in one call; 400 KB costs up to 100
  strong read units / 50 eventual read units. Gateway reads are
  **eventually-consistent by default** (halves read cost), with `strong: true` available.
- No chunking in v1. Large payloads beyond 400 KB belong in object storage; store the URL in the row.

### 6.3 Soft delete (scheduled deletion)

- `DELETE /v1/apps/:id` → status `deleting`, `purge_at = now + 5 min`.
- Within window: `POST /v1/apps/:id/recover` → back to `active`.
- `POST /v1/apps/:id/force-delete` → immediate purge (all tables emptied then deleted, registry rows removed).
- Cron trigger (every 1 min, free plan allows 5) finalizes expired `purge_at` rows.
- Purge = paginated scan+delete of items, then `DeleteTable`, then registry cleanup.
- Same soft-delete state machine for table deletion inside an app.

## 7. Authentication & Authorization

- **App keys:** `X-App-Id` + `X-Api-Key`. Keys: 32 random bytes base64url;
  stored as HMAC-SHA256(key, salt); shown once at creation; rotate + revoke
  endpoints; constant-time compare; suspended apps → 403.
- **Admin (dashboard):** GitHub OAuth (authorization code flow, client ID/secret,
  allowed usernames list in `meta` table / env) **and** admin password fallback.
  Sessions: signed HttpOnly cookie (HMAC), 12 h expiry.
- **Isolation invariant:** a key grants access only to its own app's tables.
  Registry assertTableAccess is the single enforcement point (unit-tested).

## 8. Rate Limits (computed — full math in docs/rate-limits.md)

Implemented with the Workers Rate Limiting binding (GA, per unique key, per
Cloudflare location — documented approximation; see docs).

| Scope | Limit | Basis |
|---|---|---|
| Per app — total API calls | NORMAL: 2 000 / min · PERFORMANCE: 500 000 guardrail | mode-aware contract |
| Per app — writes (put/update/delete/create) | NORMAL: 800 write-units / min · PERFORMANCE: 100 000 guardrail | size-priced units |
| Per app — reads (get/query) | NORMAL: 800 / min · PERFORMANCE: 400 000 guardrail | strong reads cost 2× |
| Platform — all apps combined | NORMAL: 2 400 / min · PERFORMANCE: 2 000 000 guardrail | shared platform safety net |
| Admin/dashboard endpoints | 60 / min | low, human-only |
| DynamoDB throttling | mapped → **429 + Retry-After: 1** | never leaks 5xx; clients retry |

Safety reserves: meta/idempotency ops counted inside platform limit; per-app caps
assume ≤ 10 apps; any excess returns 429 (never 500).

## 9. Testing Strategy

- Vitest, `gateway/test/*.test.ts`; branch coverage ≥ 90% for auth, registry,
  limits, idempotency.
- Mandatory tests (cannot ship without them):
  1. App A key cannot access App B table → 403.
  2. Duplicate `request_id` → same response, no second write.
  3. Update with stale `version` → 409.
  4. Payload > 20 KB → 413; 3 KB-ish writes never exceed WCU math (mock asserts ≤ 20 units).
  5. Unknown key → 401; suspended app → 403.
  6. Soft delete: deleting → purge_at set; recover works in window; force-delete purges now; expired purge runs via cron handler.
  7. Rate limiter envelope: over-limit → 429 (unit test on wrapper; binding itself verified live).
  8. GitHub OAuth: callback validates `code`, rejects bad state (mock fetch).
  9. Docs page renders real endpoint examples used by the test suite.

## 10. Boundaries

**Always**
- `npm test` green before commit; keep tests green.
- Prefix every app table `app_<appId>_`; never accept raw table names from apps.
- Hash keys; show key once; standard JSON errors; logs free of secrets/payloads.
- Map DynamoDB throttling to 429 with Retry-After; never expose internal errors.

**Ask first**
- Changing AWS region; adding dependencies beyond Hono/vitest/aws4fetch;
  creating ANY paid resource; changing public API JSON schema;
  adding a second AWS account; adding chunking/R2 before v2.

**Never**
- Commit AWS/GitHub secrets or api_keys; allow raw SQL or raw DynamoDB
  pass-through; store blobs in DynamoDB items; bypass the soft-delete window
  by accident (force delete is explicit).

## 11. Success Criteria (v1 done when ALL pass)

1. `POST /v1/apps` (admin) → app created, key returned once.
2. App creates table → physical table is `app_<appId>_<name>`, registered.
3. put/get/update(version)/delete/query all work; stale version → 409.
4. `request_id` replay → identical response, no duplicate (mock asserts count).
5. Query by `pk` (+ `sk` prefix, `limit`) works.
6. App B accessing App A table → 403 (automated test).
7. Over-limit app → 429; throttled DynamoDB → 429 + Retry-After.
8. Dashboard: GitHub login OR password → create app → copy key → create table →
   sample curl prefilled → runs from a terminal.
9. Docs render the same examples the test suite uses.
10. Soft delete lifecycle works end-to-end incl. cron purge + recovery.
11. Total cost $0 — nothing provisioned beyond free tiers.
12. Repo pushed to github.com/rakxdev/RodeX, docs marked "Version 1".

## 12. Decisions Log (from human review, 2026)

- Region: **ap-southeast-1 (Singapore)** — nearest to Rakesh's dev servers.
- Login: **GitHub OAuth + admin password fallback** (GitHub client ID/secret provided).
- Rate limits: computed by us (§8, docs/rate-limits.md) — human confirmed "calculate it".
- Deletion: **soft delete with 5-min recover window + force delete**.
- Quality bar: production-grade, all skills applied, "unbeatable" error handling.

## 13. Decisions (human answers, same session)

1. **Allowed GitHub usernames:** `rakxdev`, `newylbot`, `luminoxpp`
   (env `GITHUB_ALLOWED_USERS="rakxdev,newylbot,luminoxpp"`).
2. **Dashboard URL:** Cloudflare Pages project `rodexdb` → `rodexdb.pages.dev`;
   fallback if taken: `rodex-db.pages.dev`. Final OAuth callback URL = that
   domain + `/v1/auth/github/callback` — Rakesh pastes it into GitHub OAuth app.
3. **Auth notes:** cross-site session cookie (`SameSite=None; Secure`) between
   gateway (workers.dev) and dashboard (pages.dev); CORS with credentials for
   `DASHBOARD_ORIGIN`.