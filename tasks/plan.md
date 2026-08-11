# Plan — Serverless-data trio: batch/get + increment + row TTL

Spec (per spec-driven-development). Scope approved by the founder after deep
research: build the standard serverless-data trio that the market leaders
(Serverless Framework, Upstash) ship — on our zero-cost stack. **No push** —
commits local; deploy manual; user orders push/release later.

## Objective

Complete the trio next to `/v1/batch/put` so RodexDB outperforms free-tier
alternatives without over-engineering:

1. `POST /v1/batch/get` — up to 50 keys, one round-trip (the crawler's
   "166 gets" hot path → 4 calls). N keys = N reads (weighted, reserved first).
2. `POST /v1/item/increment` — atomic counters via DynamoDB `UpdateItem ADD`
   (1 write, 0 reads, no races). Auto-creates the row if missing.
3. Row TTL — optional `ttl` (unix seconds) on put/batch items; rows expire and
   delete themselves for free. Gateway filters expired rows on read (never
   lies); AWS deletes physically within ~48 h (documented).

Deliberately NOT building (research verdict): realtime, webhooks, SQL/FTS/
vector, transactions, schema validation, export endpoint.

## Design decisions

1. **Counter storage**: a dedicated top-level numeric attribute `ctr` on the
   physical item (atomic `ADD` needs a real numeric attribute — cannot add
   inside the JSON `data` string). Counter rows read back as
   `{ pk, sk, data: {}, counter, version, created, updated }`; normal rows are
   unchanged. `by` is an integer (negative = decrement), default 1, returned
   as the new counter value.
2. **TTL metadata**: `ttl` is a reserved key inside `item` (like pk/sk), stored
   as the physical `ttl` attribute; tables get DynamoDB TTL enabled on
   `ensureTable` (idempotent). Echo includes `ttl`. Reads (get/query/batch-get)
   filter expired rows server-side. update/delete do not manage ttl.
3. **batch/get**: keys = `[{pk, sk?}]`, sk defaults `"~"`, `strong` optional
   (consistent reads). All keys validated first (any bad → 400, nothing
   returned). Response: `{requested, found: [items], missing: [{pk, sk}]}`.
   Missing keys are NOT errors (batch semantics).
4. **MCP**: `batch_get_item` (read, no gate) + `increment_item` (mutation,
   confirmation-gated) — 24 tools. MCP manual updated.
5. **Budgets**: batch/get N keys = N reads (weighted read gate); increment =
   1 write. Both name their budget on 429 like everything else.

## Tasks

- [ ] T1: storage interface + mock + AWS: `getItems`, `increment`, ttl in
      putItem/getItem/queryItems + ttl on ensureTable (aws) — unit tests
- [ ] T2: items.ts: `ttl` in parseItem + itemToJson, `handleBatchGet`,
      `handleIncrement`; routes in index.ts — api tests
- [ ] T3: mcp.ts: `batch_get_item` + `increment_item` + manual — mcp tests
- [ ] T4: docs: api.md, mcp.md, rate-limits.md, python.md, testing.md,
      CHANGELOG [Unreleased], README badge; dashboard DocsPage
- [ ] T5: full verify (vitest, tsc, eslint, bundles, dashboard build)
- [ ] T6: deploy gateway + dashboard; live-verify all three + 24 tools;
      cleanup; local commits (NO PUSH)

## Success criteria

- batch/get: 50 ok / 51 → 400 / missing listed / weight proof (4×50 reads ok,
  5th 50 → 429)
- increment: creates counter, adds, decrements, echo shows counter, races
  impossible (atomic)
- ttl: future ttl → readable + echoed; past ttl → 404 and excluded from
  query/batch-get; works in batch items
- MCP: 24 tools; batch_get_item read (no gate); increment_item gated
- 170 + new tests green; prod live-verified; no push
