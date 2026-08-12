# Spec + Plan — v0.5.0: Dual capacity modes (NORMAL / PERFORMANCE), zero-error model

Gated by spec-driven-development. Research base (this session, official AWS
sources): item hard limit 400 KB · on-demand pricing $0.625/M WRU + $0.125/M
RRU (Nov-2024 cut) · switching rules (4×/24h to on-demand per table, back
anytime, minutes-long transition, ≥4 000 WCU/s headroom) · free tier is
provisioned-only · on-demand max-throughput guardrail exists.

## ASSUMPTIONS (correct me if wrong — otherwise I proceed)

- A1: Platform-wide switch (all apps/tables), one master toggle — confirmed.
- A2: NORMAL mode budgets = generous, wall-free for realistic use:
  writes 800 units/min · reads 800/min · total 2 000/min ·
  platform 2 400/min (MCP same). 429 only at genuinely absurd rates.
- A3: PERFORMANCE mode = guardrails only: writes 100 000/min · reads
  400 000/min · total 500 000/min · platform 2 000 000/min (under AWS
  4 000 WCU/s / 12 000 RCU/s per-table headroom).
- A4: Item cap = **400 000 bytes in BOTH modes** (DynamoDB hard 400 KB incl.
  keys; we keep ~9 KB margin). 20 KB stays a documented cost recommendation,
  not a wall. Reads are NEVER size-gated in any mode.
- A5: Batch byte cap 400 000 total (allows any max row; units reserved
  upfront). all_ok/validation/idempotency rules unchanged.
- A6: Switch-back to provisioned = 5 WCU/5 RCU per table (free-tier $0).
  New tables created while PERFORMANCE = on-demand directly.
- A7: Mode persists in platform settings (`capacity_mode`), worker-side 30 s
  cache; switchable only via admin REST + MCP (confirmation-gated).
- A8: No auto-switch-back timer (not requested).
- A9: Dashboard toggle lives on the AppsPage (platform strip).

## Objective

"Never blocked, never stranded": mode changes throughput/cost ONLY — data
rules (sizes, shapes, validation, per-item results) are identical in both
modes, so switching can never break reading/writing existing rows.

## Design

1. limits.ts: MAX_ITEM_BYTES 20 000 → 400 000; BATCH_MAX_BYTES = 400 000.
2. rate.ts: two profiles (NORMAL/PERFORMANCE above); capacityMode(env) reads
   setting `capacity_mode` with 30 s cache; gateAppRequest/gateMCPRequest pick
   the profile; admin gate unchanged (60).
3. storage: `setTableCapacity(physical, "on-demand"|"provisioned")` +
   `tableCapacityMode(physical)` (mock: no-op records); ensureTable accepts an
   optional billing mode for new tables (on-demand in performance).
4. Admin REST: `GET /v1/admin/capacity` (mode + per-table BillingMode) ·
   `POST /v1/admin/capacity {mode}` (switch every table sequentially,
   per-table results, AWS 4×/24h errors surfaced; persists the setting).
5. MCP: `get_platform_capacity` (read) · `set_platform_capacity` (mutate,
   confirmed) — 26 tools; manual updated.
6. Dashboard: AppsPage platform strip — mode chip, toggle with red/gold
   confirm modal, SWITCHING… state, poll until ACTIVE.
7. Docs: new docs/capacity.md (matrix + cost table + switching facts + "reads
   never size-gated"), api.md, mcp.md, rate-limits.md rewrite, faq.md,
   README, CHANGELOG [Unreleased] v0.5.0, testing.md, DocsPage.

## Tasks

- [ ] T1: limits + rate profiles + mode cache + tests
- [ ] T2: storage setTableCapacity/tableMode/ensureTable-mode (mock+aws)
- [ ] T3: admin capacity endpoints + routes
- [ ] T4: MCP tools + manual (26)
- [ ] T5: dashboard AppsPage strip
- [ ] T6: tests rework (old 120-budget tests → 2 000) + new coverage
- [ ] T7: docs sweep
- [ ] T8: verify (vitest/tsc/eslint/bundles/dashboard build) → deploy →
      live-verify (perf switch, 400 KB write+read round-trip, budget math,
      switch-back) → cleanup → commit locally (NO PUSH)

## Success criteria

- 400 000-byte item: put + get returns full payload; 400 001 → 413
- Batch total ≤ 400 000 ok; > cap → 413, nothing written
- NORMAL budgets: 100×4 KB rows (400 units) ok → 429 once > 800 units in a minute
- Performance mode: same 101st write OK (guardrails only)
- POST capacity switches all tables + persists; GET reports per-table state
- MCP: 26 tools; set_platform_capacity gated
- Docs/FAQ matrix accurate; no push; live verified
