# Tasks: RodeX Canonical Contract and Generated Documentation

> Planning only. Do not mark implementation tasks complete until the founder approves the specification and plan.

## Phase 1 — Foundation

- [ ] Task 1: Add and validate `contract/rodex-contract.json`
  - Acceptance: current public NORMAL/PERFORMANCE/common/MCP values are represented once; invariants are checked.
  - Verify: `node scripts/validate-contract.mjs` and negative fixtures.
  - Files: contract source, validator, focused tests.

- [ ] Task 2: Add deterministic contract generator
  - Acceptance: generated gateway/dashboard TypeScript and Markdown fragments are stable and marked generated.
  - Verify: run generation twice; byte-identical output; `git diff --check`.
  - Files: generator, generated outputs, package scripts.

### Checkpoint 1

- [ ] Contract validates.
- [ ] Generator is deterministic.
- [ ] No runtime consumers changed yet.
- [ ] Existing tests remain green.

## Phase 2 — Consumers

- [ ] Task 3: Switch gateway NORMAL/PERFORMANCE public profiles to generated values
  - Acceptance: runtime values match v0.5.0; `TEST_PROFILE` remains separate and unchanged.
  - Verify: gateway typecheck, rate tests, item boundary tests, profile snapshot.
  - Files: `gateway/src/limits.ts`, generated gateway module, tests.

- [ ] Task 4: Switch dashboard pages to generated contract values
  - Acceptance: Landing, Usage, Docs/CELL 09, MCP, and Apps pages render generated values.
  - Verify: dashboard typecheck/build and browser DOM checks.
  - Files: generated dashboard module and affected pages.

### Checkpoint 2

- [ ] Gateway and dashboard compile.
- [ ] Runtime behavior is unchanged.
- [ ] Browser pages match the existing v0.5.0 contract.

## Phase 3 — Documentation and API artifacts

- [ ] Task 5: Generate README and Markdown reference tables
  - Acceptance: active repeated limit sections come from generated markers; historical docs remain historical.
  - Verify: generated diff and stale active-doc scan.
  - Files: README/docs generated sections, generator templates.

- [ ] Task 6: Generate OpenAPI `x-rodex-capacity` metadata and add OpenAPI lint
  - Acceptance: OpenAPI paths/schemas stay unchanged; metadata matches contract.
  - Verify: linter and schema/path snapshot.
  - Files: `docs/openapi.yaml`, generator, scripts/workflow.

- [ ] Task 7: Generate MCP capacity manual text
  - Acceptance: MCP manual values match both modes from the contract.
  - Verify: MCP unit/manual parity tests.
  - Files: `gateway/src/mcp.ts`, generated gateway module, tests.

## Phase 4 — Protection and maintenance

- [ ] Task 8: Add drift, parity, stale-string, and test-profile protection
  - Acceptance: stale generated output or active old values fail CI; historical/test allowlists are explicit.
  - Verify: positive/negative fixtures and full suite.
  - Files: check scripts, tests, CI.

- [ ] Task 9: Add contract maintenance guide and ADR
  - Acceptance: one documented change path from canonical file to generated outputs and verification.
  - Verify: follow the guide from a clean working tree.
  - Files: `docs/contract-maintenance.md`, README, ADR.

### Final checkpoint

- [ ] `npm run contract:check`
- [ ] `npm run contract:test`
- [ ] `npm run openapi:lint`
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build:dashboard`
- [ ] Browser checks for `/`, `/usage`, `/docs`, `/mcp`, `/apps`
- [ ] No active stale public values
- [ ] No database migration or capacity mutation
- [ ] Review diff and rollback plan
- [ ] Founder approves push/deploy
