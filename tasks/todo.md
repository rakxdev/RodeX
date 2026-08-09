# RodeX v1 — Task List

Status: DRAFT · One task per step, ordered by dependency. Each task ≤ ~5 files.

- [x] T1 Scaffold repo: package.json, tsconfig (strict), vitest, wrangler.toml
      (mock default, secrets list, ratelimits, cron), gateway/ + dashboard/ + docs/
      - Acceptance: `npm test` runs (1 trivial test), `npm run typecheck` passes
      - Verify: `npm test && npm run typecheck`
      - Files: root package.json, tsconfig, vitest.config, gateway/wrangler.toml, README stub

- [x] T2 Core libs: `limits.ts`, `auth.ts` (HMAC-SHA256, salt, constant-time),
      `HttpError` + central error mapping (400/401/403/404/409/413/429/502)
      - Acceptance: unit tests cover caps + hashing + compare
      - Verify: `npm test`
      - Files: gateway/src/{limits,auth,errors}.ts + tests

- [x] T3 Storage interface + mock adapter + aws adapter (aws4fetch, SigV4,
      throttle → 429 mapping)
      - Acceptance: mock passes interface contract tests; aws adapter builds
      - Verify: `npm test` (mock); `npm run typecheck` (aws)
      - Files: gateway/src/storage*.ts + tests

- [x] T4 Registry + soft-delete state machine: create/list/get/rotate/revoke,
      delete → purge_at (+5 min), recover, force-delete, purge.ts cron handler
      - Acceptance: lifecycle tests incl. window edge cases
      - Verify: `npm test`
      - Files: gateway/src/{registry,purge}.ts + tests

- [x] T5 Items + tables API: put/get/update/delete/query, `app_<id>_` prefix,
      idempotency (meta, TTL 24 h), conditional version writes
      - Acceptance: mandatory tests #1–6 (SPEC §9) green
      - Verify: `npm test` + curl flow on `npm run dev` (mock)
      - Files: gateway/src/{items,tables,idempotency}.ts + tests

- [x] T6 Admin auth: GitHub OAuth (start/callback, state, allowed users) +
      password fallback, HMAC session cookie (12 h)
      - Acceptance: mocked OAuth flow tests; password path tests
      - Verify: `npm test`
      - Files: gateway/src/{oauth,env}.ts + tests

- [x] T7 Rate limiting: [[ratelimits]] bindings + `rate.ts` envelope
      (per-app total/writes/reads, platform, admin) + throttle mapping
      - Acceptance: envelope unit tests; wrangler.toml config reviewed
      - Verify: `npm test`; live check documented in docs/testing.md
      - Files: gateway/wrangler.toml, gateway/src/rate.ts + tests

- [x] T8 Dashboard (Pages): login (GitHub + password), apps list/create,
      app detail (key once, tables, prefilled curl), docs page
      - Acceptance: click-through works against `wrangler dev` (mock)
      - Verify: manual + curl of the generated sample
      - Files: dashboard/*

- [x] T9 Docs: api.md (endpoints, errors, retry helper), testing.md
      (local + live runbook), research-validation.md (official sources used)
      - Acceptance: docs match implemented behavior (examples reused in tests)
      - Verify: review pass
      - Files: docs/*

- [x] T10 Final: all SPEC §11 criteria, README (how to run/deploy), commit,
      push to github.com/rakxdev/RodeX
      - Acceptance: 12/12 success criteria
      - Verify: `npm test`, full local curl script, `git push`
      - Files: repo-wide
