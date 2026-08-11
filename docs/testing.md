# RodeX v1 — Testing & Local Development

## Unit tests (no AWS needed)

```bash
npm install
npm test          # vitest — 182 tests, mock storage
npm run typecheck # strict TS (gateway)
cd dashboard && npx tsc --noEmit   # dashboard typecheck
npx eslint gateway/src gateway/test   # lint gate (CI matches)
```

Run a single file: `npx vitest run gateway/test/rate.test.ts`.

## Test map

| File | Covers |
|---|---|
| `test/auth.test.ts` | `rok_` key gen/hash, constant-time compare, session sign/verify/tamper, AES-GCM encrypt/decrypt |
| `test/storage-mock.test.ts` | storage contract: apps, idempotency TTL, items, versions, queries, settings rows, storageSize |
| `test/storage-aws.test.ts` | marshaling rules (empty-string-set guard), table ACTIVE polling, 5/5 auto-upgrade, **app-row round-trip of newer fields** (view-key regression) |
| `test/registry.test.ts` | lifecycle: rotate, soft delete/recover, purge bounds, key cipher on create/rotate |
| `test/rate.test.ts` | **strict budgets**: writes 120, reads 240, mixed kind isolation, platform pool across 3 apps, admin 60, retry_after, window reset, DO atomicity + peek-no-consume |
| `test/api.test.ts` | full-stack via `app.fetch`: isolation 403, idempotency, 409/413/401, table create, cross-app table checks |
| `test/admin.test.ts` | password + GitHub OAuth (mocked fetch incl. User-Agent regression), admin CRUD, suspend, soft delete, view-key window, **change-password round-trip**, **usage endpoint (counters without consuming)**, delete alias, descriptions |

## Live verification runbook (after any deploy)

1. `curl https://<gateway>/v1/health` → `ok:true`
2. Login (password) → session; `/v1/admin/me` → authenticated
3. Fabricate an app → key is `rok_…`, shown once; `key_recoverable_until` set
4. `POST /v1/admin/apps/:id/view-key` → returns the same raw key (inside 48 h)
5. Create table → put/get/update/query/delete with `X-App-Id` + `X-Api-Key`
6. Cross-app isolation: second app on first app's table → 403
7. Rate limit: fire 121 rapid writes → exactly 120 pass, 121st is 429 naming
   the budget with `retry_after`
8. `GET /v1/admin/apps/:id/usage` → counters match the traffic just fired
9. Soft delete → status `deleting` + `purge_at` → recover → active
10. Change-password round-trip (temp → verify → restore) if touching auth

## Local preview with the real gateway

```bash
cd dashboard && VITE_GATEWAY_URL="" npm run build   # same-origin /v1 (proxied)
npx vite preview --port 4174 --host                 # preview server
cloudflared tunnel --url http://localhost:4174      # shareable preview URL
```

The preview proxies `/v1/*` to the production gateway (Origin stripped), so
login and the console work from the tunnel. GitHub OAuth from a tunnel lands
on the real dashboard (callback is fixed to `DASHBOARD_ORIGIN`).
