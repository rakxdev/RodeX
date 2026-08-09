# RodeX v1 — Implementation Plan

Status: DRAFT (awaiting human approval) · Source of truth: ../SPEC.md

## Architecture (already validated)

```
Browser (dashboard, Pages) ──→ Gateway Worker (Hono) ──→ DynamoDB ap-southeast-1
Apps (bots/websites)     ──→  (auth → registry → items)   meta + app_<id>_* tables
Cron (1/min) ──→ purge.ts: finalize scheduled deletions
```

## Build order (dependencies first)

1. **Scaffold** — package.json, tsconfig, wrangler.toml, vitest config, dirs.
   Nothing works before this; everything depends on it.
2. **Core libs (no I/O)** — `limits.ts` (caps), `auth.ts` (HMAC hashing,
   constant-time compare), typed `HttpError` + error mapping.
3. **Storage layer** — interface + `storage-mock.ts` (in-memory) FIRST so all
   logic is testable without AWS; `storage-aws.ts` (aws4fetch) second.
4. **Registry + soft-delete state machine** — apps CRUD, key rotate/revoke,
   `deleting → purge_at` flow, recover, force-delete, `purge.ts` cron.
5. **Items + tables endpoints** — put/get/update/delete/query, auto-prefix,
   idempotency (meta TTL), conditional version writes.
6. **Admin + GitHub OAuth** — password fallback, sessions (HMAC cookie),
   OAuth start/callback with state, allowed-usernames check.
7. **Rate limiting** — wrangler `[[ratelimits]]` bindings + envelope wrapper +
   throttle→429 mapping. (Wiring verified live after deploy; logic unit-tested.)
8. **Dashboard (Pages)** — login, apps list, app detail (key shown once,
   tables, curl prefilled), docs page.
9. **Docs** — api.md, testing.md, research-validation.md (partially exists).
10. **Test hardening + deploy runbook** — all mandatory tests green, README,
    push to GitHub.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Free Workers 10 ms CPU | Gateway is thin (auth + 1 DDB call); heavy work avoided; profiled in tests |
| 50 external subrequests/request | 1 DDB call per request by design; query pagination caps (limit ≤ 100) |
| Rate limiter per-location | Documented approximation + throttle→429 mapping (docs/rate-limits.md §4) |
| DynamoDB throttling on bursts | 20 KB write cap + per-app limits + 429 Retry-After |
| GitHub OAuth callback URL | Configured at deploy; exact URL given to Rakesh (SPEC §13) |
| Cron purge CPU 10 ms | Network waits don't count; small tables; lazy purge on admin read as backup |

## Verification checkpoints

- After 2–4: `npm test` green (core libs).
- After 5: curl flow on `wrangler dev` (mock): create app → table → put → get →
  update conflict → query → soft delete → recover.
- After 6: GitHub OAuth flow with real credentials (needs Pages URL) OR mocked.
- After 8: full dashboard click-through.
- After 10: all 12 success criteria of SPEC §11 pass.
