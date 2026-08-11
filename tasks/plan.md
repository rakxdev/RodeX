# Plan — Real-user review fixes (Round: correctness + batch)

Source: `docs/REAL_USER_REVIEW.md` (tstbk-crawler consumer, 2026-08-12) —
every factual claim was independently verified live by the founder's agent.
This plan fixes the accepted items only. **No push** — commits stay local;
deploys happen manually after verification.

## Scope decision (approved by founder)

| Item | Verdict |
|---|---|
| P0 silent empty writes (accept → 400) | ✅ FIX |
| P0 one canonical write shape (MCP ≡ REST) | ✅ FIX (envelope-in-item unwrap; backward compatible) |
| P0 echo documented as verification contract | ✅ FIX (docs) |
| P1 contract test MCP ≡ REST | ✅ FIX (test) |
| P2 `/v1/batch/put` + MCP `batch_put_item` | ✅ FIX (per-item rate weight, ≤50) |
| P2 sharding recipe in docs | ✅ FIX (docs) |
| P2 storage meter honest labeling | ✅ FIX (docs + dashboard copy; AWS ~6h ItemCount lag) |
| P3 Python client snippet | ✅ FIX (docs) |
| P2 row TTL | ❌ SKIP (low value, delayed deletes) |
| P3 row-count endpoint | ❌ SKIP (no cheap truthful source) |

## Design decisions

1. **`put` dual shapes, strict everywhere** — `item: {pk, sk, ...fields}` (flat,
   unchanged) OR `item: {pk, sk, data: {...}}` (envelope). A `data` key inside
   `item` selects the envelope; mixing envelope + extra fields → 400. All
   `/v1/item/*` + `/v1/query` bodies reject unknown TOP-LEVEL keys → 400 with
   the allowed list. Never accept-and-drop again.
2. **MCP put_item already sends `item:{pk,sk,data}`** → envelope unwrap makes
   MCP rows flat automatically; no MCP code change needed for put_item.
3. **Rate weights** — `gateAppRequest(env, appId, kind, weight)` and the
   RateLimiterDO check accept `weight` (default 1, backward compatible).
   A batch of N consumes N writes against 120/min; checked BEFORE writing.
4. **Batch semantics** — validate ALL items first (any invalid → 400, nothing
   written); then write sequentially, per-item result array
   (`{pk, sk, ok, item|error}`); `request_id` idempotent for the whole batch;
   `overwrite` applies to all items.
5. **Meter** — API keeps `sampled_at`; docs + dashboard label item counts as
   AWS-sampled (up to ~6h lag); request meters stay "live".

## Tasks

- [ ] T1: rate weight support (rate.ts, rate-do.ts, localCheck) + tests
- [ ] T2: strict body validation + envelope unwrap in items.ts + tests
- [ ] T3: `/v1/batch/put` endpoint + tests
- [ ] T4: MCP `batch_put_item` + contract test (MCP write ≡ REST write) + tests
- [ ] T5: docs — api.md (dual shapes, 400 rule, echo contract, batch, sharding
        recipe, Python link), mcp.md (batch tool), rate-limits.md (batch
        accounting), docs/python.md (new), docs/testing.md (new tests),
        CHANGELOG.md, README.md, REAL_USER_REVIEW.md status note
- [ ] T6: dashboard — DocsPage put/batch/python/meter additions, UsageMeters
        sampled-label copy
- [ ] T7: full verification: vitest, tsc, eslint, bundle, dashboard build
- [ ] T8: deploy gateway + dashboard, live-verify all fixes, commit locally

## Verification (acceptance)

- Envelope put (`item.data`) → stored flat; echo shows flat payload
- Top-level `data` on put → 400 with clear message (was silent 200 drop)
- Unknown top-level key on any item endpoint → 400
- MCP put_item row ≡ REST flat row (same stored shape)
- batch/put: 50 ok, 51 → 400, invalid item → 400 whole batch, weights count
- Live prod: gateway + dashboard healthy after deploy; meter label updated
- Full test suite green; no push (commits local only)
