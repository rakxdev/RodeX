# Todo — Real-user review fixes  (ALL DONE — committed locally, deployed live, NOT pushed)

- [x] T1: rate weight support (rate.ts, rate-do.ts, localCheck) + tests
- [x] T2: strict body validation + envelope unwrap in items.ts + tests
- [x] T3: `/v1/batch/put` endpoint + tests
- [x] T4: MCP `batch_put_item` + contract test + tests
- [x] T5: docs (api, mcp, rate-limits, python.md, testing, CHANGELOG, README, review status)
- [x] T6: dashboard (DocsPage, UsageMeters copy)
- [x] T7: full verification (vitest 170, tsc, eslint, bundle, dashboard build)
- [x] T8: deploy + live-verify + local commits (NO PUSH)

Live-verified 2026-08-12 against production: trap → 400 · envelope stored flat ·
MCP≡REST flat · batch 3/51/invalid · MCP gate · 22 tools · cleanup done · prod healthy.
