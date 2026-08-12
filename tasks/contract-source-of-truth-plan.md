# Implementation Plan: RodeX Canonical Contract and Generated Documentation

## Overview

Introduce a single canonical public contract for limits and capacity modes, generate typed/runtime and documentation outputs from it, and add drift/parity checks. This is a no-behavior-change architecture improvement. The existing v0.5.0 contract remains the baseline.

## Dependency Graph

```text
Canonical contract schema + source
        │
        ├── deterministic generator
        │       ├── gateway generated values
        │       ├── dashboard generated values
        │       ├── Markdown generated tables
        │       └── OpenAPI generated metadata
        │
        ├── contract validation tests
        ├── runtime parity tests
        └── CI drift check
```

The dashboard and gateway consumers must not be switched until generated artifacts and parity tests are working.

## Architecture Decisions

1. **One canonical JSON source, not one giant documentation file.** JSON is easy to validate, generate, diff, and consume from TypeScript and scripts.
2. **Generated outputs are committed.** This keeps deployments self-contained and makes changes visible in code review. CI proves they are fresh.
3. **Human documentation remains human-authored around generated tables.** This preserves readability and supports tutorials, how-to guides, reference, and explanation formats.
4. **No new package is required initially.** Use a root generator and generated TypeScript modules to minimize dependency and workspace risk.
5. **OpenAPI remains the endpoint contract.** The canonical RodeX contract supplies policy values and generated metadata; it does not replace endpoint schemas.
6. **TEST_PROFILE remains separate.** It is intentionally smaller and exists only to test rejection behavior.
7. **First release is behavior-preserving.** No production limit, endpoint, data, or capacity-setting change is allowed in this implementation.

## Phase 1: Foundation

### Task 1: Add canonical contract source and validator

- **Description:** Create `contract/rodex-contract.json` containing current public values and `scripts/validate-contract.mjs` with structural and invariant checks.
- **Acceptance:** All current NORMAL/PERFORMANCE/common/MCP values exist once in the source; malformed or contradictory values fail validation.
- **Verify:** `node scripts/validate-contract.mjs` passes; negative fixture tests fail as expected.
- **Files:** `contract/rodex-contract.json`, `scripts/validate-contract.mjs`, focused test.
- **Dependencies:** None.
- **Scope:** Small.

### Task 2: Build deterministic generator

- **Description:** Generate typed gateway/dashboard modules and Markdown fragments from the canonical source.
- **Acceptance:** Repeated generation produces byte-identical output; generated files include source headers; no timestamps or environment-specific output.
- **Verify:** Run generation twice and compare hashes; `git diff --check` passes.
- **Files:** `scripts/generate-contract.mjs`, generated output directories, package scripts.
- **Dependencies:** Task 1.
- **Scope:** Medium.

### Checkpoint: Foundation

- Contract validates.
- Generator is deterministic.
- No runtime consumer has changed yet.
- Existing tests remain green.

## Phase 2: Runtime and UI Consumers

### Task 3: Switch gateway public profiles to generated values

- **Description:** Make `gateway/src/limits.ts` consume generated public values while preserving the explicit `TEST_PROFILE`.
- **Acceptance:** NORMAL and PERFORMANCE exports equal generated values; TEST_PROFILE remains unchanged; no API behavior changes.
- **Verify:** Gateway typecheck and focused rate/item boundary tests; compare snapshots to current v0.5.0 values.
- **Files:** `gateway/src/limits.ts`, generated gateway module, rate/profile tests.
- **Dependencies:** Tasks 1–2.
- **Scope:** Small.

### Task 4: Switch dashboard public pages to generated values

- **Description:** Replace hardcoded public limit values in Usage, Docs/CELL 09, MCP, Apps, and Landing pages with generated contract data.
- **Acceptance:** `/usage`, `/docs`, `/mcp`, `/apps`, and `/` render current values from the generated module; explanatory prose remains readable.
- **Verify:** Dashboard typecheck/build and real-browser DOM assertions for all pages.
- **Files:** Generated dashboard module and affected page files.
- **Dependencies:** Tasks 1–2.
- **Scope:** Medium.

### Checkpoint: Consumers

- Gateway and dashboard compile.
- Runtime profiles are unchanged.
- Browser pages show the same values as before centralization.

## Phase 3: Documentation and API Artifacts

### Task 5: Generate Markdown reference sections

- **Description:** Add marked generated sections for README, rate-limit/capacity reference, MCP capacity, and API policy tables. Keep explanations outside generated blocks.
- **Acceptance:** Every active public limit table is generated from the canonical source; historical documents are not rewritten.
- **Verify:** Generate, inspect diff, run stale-string scanner with explicit historical/test allowlist.
- **Files:** `README.md`, `docs/*.md`, generated Markdown fragments, generator templates.
- **Dependencies:** Tasks 1–2.
- **Scope:** Medium.

### Task 6: Add OpenAPI policy metadata generation and linting

- **Description:** Generate a clearly marked `x-rodex-capacity` metadata section in `docs/openapi.yaml`, without changing endpoint schemas, and add OpenAPI validation.
- **Acceptance:** OpenAPI remains valid; policy metadata equals the canonical source; endpoint paths and schemas are unchanged.
- **Verify:** OpenAPI linter and a path/schema snapshot comparison.
- **Files:** `docs/openapi.yaml`, generator, package scripts, CI config if approved.
- **Dependencies:** Tasks 1–2.
- **Scope:** Small/Medium.

### Task 7: Generate MCP manual capacity text

- **Description:** Make the MCP operating manual use generated capacity values and keep its confirmation/security prose human-authored.
- **Acceptance:** Live/manual output matches the canonical source for both modes; no duplicate public budget literals remain in the manual source.
- **Verify:** MCP unit tests and manual snapshot/parity test.
- **Files:** `gateway/src/mcp.ts`, generated gateway module, MCP tests.
- **Dependencies:** Tasks 1–3.
- **Scope:** Small.

## Phase 4: Protection and Release

### Task 8: Add parity and drift tests

- **Description:** Add contract validation, runtime parity, generated-output drift, stale active-doc scan, and TEST_PROFILE protection.
- **Acceptance:** Changing a canonical value without regeneration fails; changing generated output manually fails; historical/test allowlisted values do not fail the scan.
- **Verify:** Run positive and negative fixtures plus full test suite.
- **Files:** `scripts/check-contract.mjs`, contract tests, CI workflow.
- **Dependencies:** Tasks 1–7.
- **Scope:** Medium.

### Task 9: Documentation structure and maintenance guide

- **Description:** Add a short contributor guide explaining where to change a value, how to regenerate, what is generated, what remains human-authored, and how historical docs are handled.
- **Acceptance:** A future maintainer can make one limit change using documented commands without manually editing six pages.
- **Verify:** Follow the guide from a clean checkout; generated diff and checks pass.
- **Files:** `docs/contract-maintenance.md`, README command section, ADR.
- **Dependencies:** Tasks 1–8.
- **Scope:** Small.

### Checkpoint: Complete

- All contract, runtime, docs, and UI checks pass.
- Full gateway tests pass.
- Dashboard build passes.
- OpenAPI validates.
- Browser pages show generated values.
- No active stale public limit strings remain.
- Rollback requires only Git revert.
- No database or production capacity mutation occurred.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Generated module import breaks Worker/Vite bundling | High | Generate simple ESM TypeScript with no Node-only runtime dependencies; typecheck both consumers before switch |
| Public values accidentally change | High | Snapshot current values and compare in parity tests before deployment |
| Test profile is overwritten | High | Keep TEST_PROFILE outside canonical public source and assert exact test-only values |
| Markdown generation damages prose | Medium | Generate only marked tables/fragments; preview diff and browser pages |
| OpenAPI metadata invalidates YAML | Medium | Lint OpenAPI and compare paths/schemas before/after |
| CI drift check is too strict | Medium | Allow explicit historical/test files; deterministic generation and targeted markers |
| Gateway/dashboard versions briefly disagree | Medium | Backward-compatible generated values, deploy gateway first, verify dashboard afterward |
| Future maintainer edits generated output | Medium | Generated header, maintenance guide, and CI drift failure |

## Parallelization

- Tasks 1–2 must be sequential.
- Tasks 3 and 4 can be developed in parallel after Task 2, but should be integrated sequentially because both consume generated output.
- Tasks 5–7 can be parallel after the generator exists, with one integrator reviewing all generated diffs.
- Tasks 8–9 must follow all consumer changes.

## Rollback

- Stop before deployment if any parity or build check fails.
- Revert the implementation commit if already committed.
- If deployed, redeploy the previous gateway/dashboard versions.
- No database migration or capacity switch is part of this feature, so rollback does not touch data or AWS table state.
