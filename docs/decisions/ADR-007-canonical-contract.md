# ADR-007: Canonical public contract — one source, generated everywhere

## Status
Accepted

## Date
2026-08-12

## Context

Every public limit and capacity value was duplicated across the gateway
(`limits.ts`), the dashboard (`/usage`, `/docs` CELL 09, `/mcp`, `/apps`,
landing), README, several Markdown references, the MCP manual, and OpenAPI
metadata. A limit change required editing the same number in many places, and
the manual sweep that followed v0.5.0 proved the edits could silently miss
surfaces (the `/usage` statistic cards were stale after a full-sweep commit).
The failure was structural, not a one-off mistake: there was no single source
of truth and no automated way to prove the surfaces agree.

## Decision

- **One canonical machine-readable file**: `contract/rodex-contract.json`
  holds ALL public policy values (NORMAL/PERFORMANCE profiles, item/batch/query
  caps, admin + storage + MCP values). It is validated structurally and by
  invariant (`scripts/validate-contract.mjs`).
- **Deterministic generator** (`scripts/generate-contract.mjs`) writes:
  - `gateway/src/generated/contract.ts` and `dashboard/src/generated/contract.ts`
    (typed modules) — the runtime/UI consumers
  - generated tables in docs/capacity.md, docs/rate-limits.md, docs/mcp.md,
    README.md and OpenAPI `x-rodex-capacity` metadata (marked regions, so
    surrounding human prose stays hand-authored)
  - `docs/generated/*.md` reference fragments
- **Drift guardrails** run in CI (`npm run contract:check`):
  - regenerate-and-compare (fails when generated output is stale)
  - stale active-text scan (fails when old public numbers appear in active
    docs/pages; historical reviews, CHANGELOG, ADRs, and test profiles are
    explicitly allowed by policy)
  - contract-parity tests (`gateway/test/contract.test.ts`) that prove the
    runtime equals the generated contract and that `TEST_PROFILE` stays
    separate.
- **One constraint that prevented the sweep bug**: the dashboard and gateway
  import generated values directly — the repeated public numbers no longer
  exist as literals in page source.

## Alternatives Considered

- **OpenAPI as the single source**: OpenAPI remains the endpoint contract but
  does not naturally express capacity-mode policy, billing modes, or MCP
  confirmation semantics; extending it as the source would make it carry
  non-schema logic.
- **A shared npm package for the contract**: rejected for v0.5.1 — generated
  modules avoid packaging/workspace risk; reconsider only if a third consumer
  appears.
- **Generate entire Markdown pages**: rejected — loses readability; only
  marked table regions are generated, explanations stay human-authored.

## Consequences

- A public limit change is now: edit `contract/rodex-contract.json` → run
  `npm run contract:generate` → review the one diff (source + generated outputs
  + tests) → CI proves freshness. No page-by-page editing.
- Historical changelog/review values are preserved and excluded from the scan
  by explicit policy — they document what shipped then.
- Internal engineering constants (test profile, window size, purge batch) are
  intentionally NOT part of the public contract.
- Rollback is a plain Git revert; no database or AWS capacity mutation is
  involved.