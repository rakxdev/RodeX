# Todo — v0.4.0 round (CORS + universal write safety) — ALL DONE, deployed, NOT pushed

- [x] T1: limits.ts wcuUnits + items.ts (parse→gate order, WCU weights, batch byte cap,
      all_ok flag, bytes echo) + tests
- [x] T2: storage-aws dropTable pacing (≤20/call, 1s gaps, 429 backoff)
- [x] T3: docs sweep (api, rate-limits, mcp, python, faq, testing, README, CHANGELOG) + DocsPage
- [x] T4: full verify (vitest 188, tsc, eslint, bundles, dashboard build)
- [x] T5: deploy gateway 411fbb50 + dashboard; live-verified: CORS DELETE preflight,
      byte cap 413, all_ok+bytes, WCU budget (6×18KB ok → 7th 429), paced drop; cleanup done

Live notes: 413 msg names bytes; 429 names "writes budget" + retry_after; crawl-safe for
≤1KB rows (1 unit). Big-row consumers (18KB) get ~6 rows/min — documented.
