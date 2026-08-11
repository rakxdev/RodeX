# Todo — Serverless-data trio (batch/get + increment + TTL) — ALL DONE

- [x] T1: storage (mock + aws): getItems, increment, ttl — unit tests
- [x] T2: items.ts: ttl parse/echo, handleBatchGet, handleIncrement + routes — api tests
- [x] T3: mcp.ts: batch_get_item + increment_item + manual — mcp tests
- [x] T4: docs (api, mcp, rate-limits, python, testing, CHANGELOG, README) + dashboard DocsPage
- [x] T5: full verify (vitest 182, tsc, eslint, bundles, dashboard build)
- [x] T6: deploy + live-verify + cleanup + local commits (NO PUSH)

Live-verified 2026-08-12 against production: batch/get found+missing · increment 1→6→4 ·
TTL future-readable/past-404/query-excluded · MCP batch_get_item (ungated) + increment_item (gated) ·
24 tools · cleanup done · prod healthy.
