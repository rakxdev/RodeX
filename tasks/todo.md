# Todo — v0.5.0 round (dual capacity modes) — ALL DONE, deployed, NOT pushed

- [x] T1: limits + NORMAL/PERFORMANCE/TEST profiles + mode cache (rate.ts) + tests
- [x] T2: storage setTableCapacity/tableCapacityMode + on-demand table creation (mock+aws)
- [x] T3: admin GET/POST /v1/admin/capacity — QUEUED background switching (per-request
      subrequest ceiling: full switch can't fit one request) via scheduled cron chunks
      (parallel per-table, retry ≤5, explicit-table plan immune to list churn)
- [x] T4: MCP get_platform_capacity + set_platform_capacity (gated) — 26 tools
- [x] T5: dashboard AppsPage CapacityStrip (mode chip, toggle, confirm modal, SWITCHING…)
- [x] T6: tests (177 gateway + 14 packages) — capacity suite, TEST profile burst,
      400 KB round-trip, on-demand upgrade-skip regression
- [x] T7: docs (capacity.md NEW, api/mcp/rate-limits/faq/README/CHANGELOG/DocsPage)
- [x] T8: deployed + LIVE-VERIFIED end-to-end: queue→cron drain (45 tables flipped in
      ~3 min), writes on on-demand AND provisioned tables, 400 KB row written in
      PERFORMANCE read fully in NORMAL (zero-error guarantee), switch-back to $0,
      26 MCP tools, gate refusal, cleanup, prod healthy
- [x] FIXED during live verify: on-demand tables broke writes (ensureTable throughput
      upgrade) + mass-switch hit per-request subrequest ceiling → queued cron switching

NOTE: 21 stale registry entries (tables listed but physically missing — old test
residue). Harmless; capacity runner gives up after 5 retries. Cleanup = delete those
test apps. NOT pushed.
