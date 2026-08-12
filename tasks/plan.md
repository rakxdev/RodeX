# Plan — v0.4.0 round: CORS fix + bulk-load hardening (universal write safety)

Sources: docs/REAL_USER_REVIEW.md (v0.2.2), docs/BULKLOAD_REVIEW.md (this round),
deep research (ES bulk `errors`, DynamoDB `UnprocessedItems`/WCU rounding,
BigQuery `insertErrors`, OpenAI TPM) — design validated against industry patterns.

## 1. CORS fix (day-one bug, already written in tree)
`Access-Control-Allow-Methods` → `GET, POST, DELETE, OPTIONS` + regression test.

## 2. Universal write safety (BULKLOAD P0/P1)
1. **all_ok flag** — `batch/put` (and MCP batch) responses gain
   `all_ok: boolean` (true only when every item wrote). Industry = ES `errors`.
2. **Batch byte cap** — total serialized item bytes ≤ 20 000 per call, checked
   BEFORE any write → 413 with a clear message. A 50×18KB burst becomes
   structurally impossible (industry = DynamoDB 16MB/call cap, tightened).
3. **WCU-unit write budget** — 120 write-units/min where every row costs
   `max(1, ceil(bytes/1024))` (the exact DynamoDB rounding rule). ≤1KB rows
   cost 1 unit → identical to today; 18KB rows cost 18. 429s name the budget.
   RateLimiterDO weights already support this.
4. **bytes echo** — every item response (`put`/`update`/`get`/`query`/batch)
   includes `bytes` (full stored representation) so consumers see the WCU math.
5. **delete_table pacing** — AWS drain chunks by write-units (≤24/call) with
   429 retry+backoff (bounded), so big-row tables never fail mid-drain.

## 3. Docs (everywhere)
api.md (byte cap, all_ok, bytes, retry guidance), rate-limits.md (units math
table), mcp.md (batch tool notes), python.md (all_ok + byte-smart batches),
faq.md (new Q: "Why did my batch partially fail?"), testing.md, CHANGELOG
[0.4.0], README badge/counts, dashboard DocsPage examples. CORS notes.

## 4. Tasks
- [ ] T1: limits.ts `wcuUnits` + items.ts (parse→gate order, weights, byte cap,
      all_ok, bytes echo) + tests
- [ ] T2: storage-aws dropTable pacing chunks + retry + helper test
- [ ] T3: docs sweep + CHANGELOG + FAQ + dashboard DocsPage
- [ ] T4: full verify (vitest, tsc, eslint, bundles, dashboard build)
- [ ] T5: deploy gateway+dashboard; live-verify (CORS preflight DELETE, byte
      cap, all_ok, unit budget with big rows, delete_table); cleanup; commit
      locally (NO PUSH until user orders)

## Success criteria
- Preflight allows DELETE from console origin
- Batch of 2×18KB rows → 413, nothing written; single 18KB row → OK
- all_ok=false surfaces per-item failures (duplicate-row test)
- ~18KB row = 18 units: 6 rows ok, 7th → 429 "writes budget"
- Items echo `bytes`; docs/FAQ teach the all_ok rule
- dropTable drains a big-row mock table without unhandled throttle
- 183 + new tests green; live verified; no push