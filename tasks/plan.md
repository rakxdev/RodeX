# RodeX — Implementation Plan (REV G)

Status: READY-FOR-APPROVAL · Last plan refresh: current session · Source of truth: SPEC.md, PRODUCT.md

## Overview

The platform (gateway + console) is feature-complete and fully tested (92/92) but the last six
commits are local-only. This plan covers: Phase 0 = ship the reviewed build to production;
Phase 1 = observability (real-time per-app request meters + storage bars, both free per research);
Phase 2 = hardening + docs (credential rotation, API docs sync, CSP tightening, DESIGN.md);
Phase 3 = MCP server on Workers (decision-gated proposal).

## Architecture Decisions

- **Observability = zero-cost by design**: request meters surface the gateway's existing
  in-memory rate-limiter counters (same numbers the limits are enforced with); storage bars use
  `DescribeTable → TableSizeBytes/ItemCount` (free control-plane, per AWS docs). CloudWatch
  `GetMetricData` reads are paid — avoided (verified against AWS pricing page).
- **Deploy order matters**: gateway first (backend contract: view-key, `rok_`, description, TTL,
  delete alias), then Pages dashboard. Both behind the protected-main PR flow with the `quality`
  check; dashboard-only commit history ships separately from gateway history when combined.
- **BREAKING (intended)**: new keys are `rok_`-prefixed (43-char assumption changes). Old keys
  keep working; docs updated in the same ship.
- **No per-app storage caps** (user directive): 25 GB shared account-wide; the 500 MB tags are
  removed. Storage metering is informational only.

## Task List

### Phase 0: Ship the reviewed build

- [ ] T0: Release branch + PR + merge + deploy (gateway, then Pages)
  - Acceptance: quality check green; `wrangler deploy` (gateway) + `deploy:dashboard` both succeed
  - Verify: prod smoke — login, fabricate (with description), `rok_` key shown once,
    view-key within window, rotate → re-seal → toast, delete → recover → purge, docs copy button,
    `_headers` no-store + favicon on prod, `/v1/health`
  - Files: no code changes — git + deploy only
- [ ] T1: Post-deploy contract check (live verification, no code)
  - Acceptance: `POST /v1/admin/apps/:id/view-key` returns the raw key within 48 h;
    `DescribeTimeToLive` on `rodex_idem` reports ENABLED/exp; key regex `^rok_...`
  - Verify: curl against prod gateway with a throwaway app; DynamoDB describe via worker log
  - Files: none

### Checkpoint: Phase 0
- [ ] Prod console fully functional, console clean (browser check)
- [ ] User reviews prod, not just the preview

### Phase 1: Observability (free meters)

- [ ] T2: Gateway `GET /v1/admin/apps/:id/usage`
  - Description: read the rate-limiter counters (total/writes/reads used in current window),
    plus per-table `TableSizeBytes`/`ItemCount` via DescribeTable (bounded, lazy, cached 60 s);
    returns `{ requests: {total, writes, reads}, storage_bytes, item_count }`
  - Acceptance: endpoint returns correct counters vs a scripted burst; no new AWS costs;
    tests cover limiter snapshot + storage mock sizes
  - Dependencies: T0 (contract deploys first)
  - Files: gateway/src/rate.ts (snapshot fn), admin.ts, storage (sizeQuery), tests — M
- [ ] T3: App detail usage panel
  - Description: meters row (WRITES/READS/TOTAL with remaining budget bars) + storage
    readout (MB used / 25 GB account-wide) on AppDetailPage; auto-refresh 30 s; Loader on fetch
  - Acceptance: panel renders real numbers within 30 s of traffic; degrades to "—" on error
  - Dependencies: T2
  - Files: AppDetailPage.tsx, client.ts, maybe meter component — S
- [ ] T4: Public usage page gains live platform totals (optional, decision-gated)
  - Description: if approved, a public lightweight endpoint (no app secrets) showing aggregate
    platform counters; otherwise the static FEATURE SHEET stays
  - Dependencies: T2 → T3
  - Files: TBD — S (only if approved)

### Checkpoint: Phase 1
- [ ] Meters honest against real traffic (write 10 items → writes bar moves)
- [ ] Storage bar matches AWS console TableSizeBytes within a few minutes

### Phase 2: Hardening & documentation

- [ ] T5: Rotate live credentials (secrets exposed earlier in chat)
  - Description: new admin password (wrangler secret + .dev.vars), GitHub OAuth secret refresh,
    AWS access key rotation (user executes in IAM — instructions), Cloudflare API token rotation
    (user executes in dashboard), update /tmp creds files + REPORT only plain-language steps
  - Acceptance: login with old password fails, new works; gateway deploys clean
  - Files: none (secrets only) — S, but requires user actions — mark clearly
- [ ] T6: API docs + OpenAPI sync
  - Description: docs/api.md + docs/openapi.yaml gain view-key, description, delete alias,
    `rok_` format, `key_recoverable_until`, storage note (no per-app cap)
  - Acceptance: every endpoint in the console docs matches the openapi file (consistency grep)
  - Files: docs/api.md, docs/openapi.yaml — S
- [ ] T7: CSP tightening
  - Description: `_headers` script-src drops `'unsafe-inline'` (Vite ships external scripts only);
    style-src drops inline too; verify console clean in all browsers
  - Acceptance: prod pages load with `script-src 'self'` and zero console violations
  - Files: dashboard/public/_headers — XS
- [ ] T8: DESIGN.md (impeccable `document`)
  - Description: capture Instrument-Packet world: tokens, color roles, fold surfaces,
    type scale, motion, component inventory
  - Acceptance: DESIGN.md committed; detector clean on all pages
  - Files: DESIGN.md — XS

### Checkpoint: Phase 2
- [ ] Security headers tightened, docs consistent, DESIGN.md present

### Phase 3: MCP server on Workers (proposal — decision-gated)

- [ ] T9: MCP scaffold + auth (ONLY after scope approval)
  - Description: streamable-HTTP MCP endpoint on the gateway worker; per-app tool access via
    API key or an admin-level tool set; capability list from open questions
  - Acceptance: MCP client (e.g., Claude Desktop) connects and lists tools
  - Files: gateway/src/mcp.ts, wrangler.toml, tests — L — split T9a scaffold / T9b tools after approval
- [ ] T10: Tool surface: query items, put/update/delete, tables list, platform usage (admin)
  - Description: same auth + isolation rules as the REST API (no new trust boundaries)
  - Acceptance: per-tool tests against mock storage; cross-app isolation asserted
  - Dependencies: T9

### Checkpoint: Phase 3
- [ ] MCP tools pass the same isolation suite as REST

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Deploy breaks prod (regression in view-key/rok_) | High | Ship behind PR + quality; post-deploy smoke (T1); rollback = previous worker version |
| Credential rotation locks anyone out | High | Rotate admin password last, verify new login, keep old until verified (12 h) |
| Meters drift from real usage | Med | Single source of truth = the limiter itself; storage from DescribeTable (authoritative) |
| `rok_` format change breaks hardcoded clients | Med | Only newly issued keys; docs announce format; old keys valid until rotation |
| MCP scope creep | Med | Decision gate at T9; split into T9a/T9b |

## Open Questions (need human input)

1. Ship Phase 0 now? (Everything for it is tested and committed.)
2. Add `https://rodex-preview.pages.dev` to the gateway origin allowlist (multi-origin support) so that URL can be used for previews after ship?
3. T4: public aggregate meters on the usage page — yes/no?
4. Phase 3 MCP scope: which tools? Admin-only, per-app-key, or both?