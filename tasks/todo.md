# RodeX — Task List (REV G)

Status: READY-FOR-APPROVAL · Each task ≤ ~5 files · Ordered by dependency.

## Phase 0: Ship the reviewed build (all code already tested & committed)

^- [x] T0 Release branch → PR (quality green) → merge → deploy gateway, then Pages
      - Acceptance: PR merged; both deployments complete; prod smoke passes
      - Verify: `curl /v1/health`; login→fabricate→rok_ key→view-key→rotate→delete→recover→purge
      - Files: none (git/deploy only)
^- [x] T1 Live contract check (incl. appFromItem read-path hotfix): view-key returns raw key ≤48 h; `rodex_idem` TTL ENABLED;
      `rok_` regex on new keys
      - Verify: curl against prod; no code
      - Depends: T0

### Checkpoint Phase 0 — prod fully functional; user reviews prod

## Phase 1: Observability (free meters)

# (next build round, after motion/docs round shipped)
# Phase 1 observation: RATE LIMITING SHIPPED (REV H) — meters next
- [ ] T2 Gateway `GET /v1/admin/apps/:id/usage` — limiter snapshot + DescribeTable sizes,
      cached 60 s; tests for counters + mock sizes
      - Verify: `npm test`; scripted burst moves counters
      - Depends: T0
- [ ] T3 App detail usage panel — WRITES/READS/TOTAL bars + storage readout, 30 s refresh,
      graceful "—" on error
      - Verify: real traffic moves bars; `npm run typecheck` + browser
      - Depends: T2
- [ ] T4 (decision-gated) Public aggregate meters on usage page
      - Depends: T2/T3

### Checkpoint Phase 1 — meters honest vs real traffic; storage matches AWS console

## Phase 2: Hardening & documentation

- [ ] T5 Rotate live credentials (admin password, GitHub secret, AWS keys, CF token —
      some steps are user-executed; instructions in report)
      - Verify: old password fails, new works
- [ ] T6 Sync docs/api.md + docs/openapi.yaml (view-key, description, delete alias, rok_,
      key_recoverable_until, storage note)
      - Verify: consistency grep docs↔openapi
- [ ] T7 CSP tighten: drop 'unsafe-inline' from script-src/style-src; console clean
      - Verify: prod loads with violations=0
- [ ] T8 DESIGN.md via impeccable document; detector clean

### Checkpoint Phase 2 — headers tightened, docs consistent, DESIGN.md committed

## Phase 3: MCP server (decision-gated)

- [ ] T9a MCP scaffold + auth on the gateway worker (streamable HTTP)
- [ ] T9b Tool surface: table list, query, put/update/delete, usage (admin) — same isolation
      - Verify: MCP client connects; isolation tests pass
      - Depends: T9a

### Checkpoint Phase 3 — MCP tools pass the REST isolation suite

## Open questions for human approval
1. Ship Phase 0 now?
2. Allow `rodex-preview.pages.dev` as a gateway origin (multi-origin allowlist)?
3. T4 public aggregate meters — yes/no?
4. MCP scope: admin-only, per-app-key, or both?