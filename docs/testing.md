# RodeX v1 — Testing & Local Development

## Unit tests (no AWS needed)

```bash
npm install
npm test          # vitest — 70+ tests, mock storage
npm run typecheck # strict TS
```

Test map:

| File | Covers |
|---|---|
| `test/auth.test.ts` | key gen/hash, constant-time compare, session sign/verify/tamper |
| `test/errors.test.ts` | error contract shape |
| `test/limits.test.ts` | size caps, name patterns |
| `test/storage-mock.test.ts` | storage contract: apps, idempotency TTL, items, versions, queries |
| `test/registry.test.ts` | lifecycle: rotate, soft delete/recover, purge bounds |
| `test/rate.test.ts` | rate envelope: 429 on block, budgets, missing-binding skip |
| `test/api.test.ts` | full-stack via `app.fetch`: isolation 403, idempotency, 409/413/401, table create |
| `test/admin.test.ts` | password + GitHub OAuth (mocked fetch), admin CRUD, suspend, soft delete |

## Local gateway (mock storage — zero AWS)

```bash
npm run dev        # wrangler dev on :8787, STORAGE=mock (in-memory, resets on restart)
```

Smoke test (from another terminal):

```bash
BASE=http://localhost:8787
# 1. admin login
curl -s -c /tmp/cj $BASE/v1/admin/login -H 'Content-Type: application/json' -d '{"password":"dev"}'
# 2. create app (ADMIN_PASSWORD via .dev.vars)
curl -s -b /tmp/cj $BASE/v1/admin/apps -H 'Content-Type: application/json' -d '{"name":"smoke"}'
# → copy api_key, then:
curl -s $BASE/v1/table/create -H 'Content-Type: application/json' \
  -H 'X-App-Id: <id>' -H 'X-Api-Key: <key>' -d '{"name":"users"}'
curl -s $BASE/v1/item/put -H 'Content-Type: application/json' \
  -H 'X-App-Id: <id>' -H 'X-Api-Key: <key>' \
  -d '{"table":"users","item":{"pk":"U#1","sk":"P","hello":"world"},"request_id":"r1"}'
curl -s $BASE/v1/item/get -H 'Content-Type: application/json' \
  -H 'X-App-Id: <id>' -H 'X-Api-Key: <key>' -d '{"table":"users","pk":"U#1","sk":"P"}'
```

## Local dashboard

```bash
cd dashboard && python3 -m http.server 8788
```
Open http://localhost:8788 → login with password. Put in `gateway/.dev.vars`:
```
ADMIN_PASSWORD=<your dev password>
DASHBOARD_ORIGIN=http://localhost:8788
```
(`.dev.vars` overrides `wrangler.toml` vars during `wrangler dev`.)

## Live (AWS) verification runbook

After deploy (README §Deploy):
1. `curl <gw>/v1/health` → `{"ok":true,...}`
2. Login → create app → table → put/get/update/query/delete (same curl as above, real base URL).
3. Cross-app check: second app touching first app's table → 403.
4. Rate limit: hammer an app key 601 times in a minute → 429.
5. Soft delete an app → app key → 403; recover → works; delete again → force-delete → gone.
6. `wrangler tail` shows gateway logs; console shows purge ticks.
