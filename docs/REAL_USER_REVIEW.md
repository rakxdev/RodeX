# RodeX DB — Real-User Integration Review

> **STATUS (2026-08-12, same day):** every accepted item in this review is
> **fixed and verified** — P0s (silent-drop rejection, one canonical write
> shape, echo-as-contract), P1 contract test, P2 batch writes (+ MCP tool),
> sharding recipe, meter labeling, Python client. See `CHANGELOG.md`
> [Unreleased] and `tasks/plan.md`. Deliberately skipped (with reasons):
> row TTL, per-table row-count endpoint.

> **Who wrote this:** the tstbk-crawler consumer — the first real application to use
> RodeX DB (via the live gateway `rodex-gateway.rakxdev.workers.dev`).
> **When / how:** 2026-08-12 · live usage across MCP tools AND the raw REST gateway.
> **What was done with it:** created an app + table, wrote 166 index rows, read
> them back, enumerated the full table, deleted rows, ran round-trips, and wired
> it as an optional dedupe/rescan index for the Testbook crawler.
> **Bottom line:** the core idea is solid and it worked end-to-end — but real usage
> surfaced **one dangerous trap (silent empty writes)** and **one design
> inconsistency (MCP vs REST write shapes)** that should be fixed before anyone
> else builds on it.

---

## 1. What I used it for (the real workload)

The crawler stores a small metadata index per crawled test:

```
pk = SHARD#<n>        (n = md5(test_id) % 100)
sk = <test_id>
data = { s3_key, has_answers, title, series, crawled_at }   (~200 bytes/row)
```

Workload pattern:
- **Hot path:** 1 read (get) + 1 write (put) per crawled test — 166 tests per crawl batch.
- **Cold path:** occasionally enumerate the ENTIRE table (for rescan-smart skip logic).
- **Budget context:** 120 writes/min · 240 reads/min per app · 20 KB row cap.

---

## 2. What worked well (genuine strengths)

| Area | Verdict |
|---|---|
| **API keys / auth model** | Excellent. Per-app keys, HMAC-hashed storage, instant rotation, 48h re-view window — a real security mindset. |
| **MCP integration** | Excellent. 21 tools, health endpoint, `get_instructions`, structured errors. The `confirmed: true` mutation gate is genuinely good — I respected it and it catches agent mistakes. |
| **Versioned optimistic concurrency** | Good. `expected_version` on update/delete is the right primitive. |
| **Idempotency via request_id** | Good, and rare in small DBs. |
| **Budget transparency** | Best-in-class. Documented buckets (120/240/600/1000), retry_after on 429, "treat 429 as the meter". I never hit a limit once, because the contract was clear. |
| **Pricing honesty** | The free-tier math (25 WCU/RCU) is spelled out. No hidden costs. |
| **Latency** | ~100–200 ms per gateway call. Fine for a metadata index. |
| **Graceful degradation** | The crawler works identically with or without the DB — but that was MY design; your API itself was always reachable and predictable. |

---

## 3. What bit me — incidents with root cause + what should have happened

### INCIDENT 1 — Silent empty writes (P0, the big one)

**What happened:**
My first `put` call sent the payload the way that felt natural — a `data` envelope:

```json
{ "table": "crawled_tests",
  "item": { "pk": "SHARD#48", "sk": "test-id" },
  "data": { "s3_key": "...", "has_answers": true } }
```

The gateway **accepted it with HTTP 200**. But when I read the row back, `data` was
`{}` — *empty*. The payload had been silently dropped. I caught it only because I
happened to read back the row for verification; the crawler's dedupe ("has_answers")
would otherwise have silently started skipping tests as "already crawled" forever.

**Root cause:** the documented REST contract stores item fields **flat** inside
`item` (`{"item": {"pk": "...", "name": "..."}}`) — but the docs for `update`
use a separate `data` envelope, and `get`/`query` RETURN a `data` envelope.
Three different payload conventions in one API, and the server **silently ignores
unknown fields instead of rejecting them.**

**Correction (verified 2026-08-12, second live experiment):** the `put` response
DOES echo the stored row — for the envelope-shaped call the echo showed
`"data": {}`, so a client that reads the response could detect the drop. Detection
was possible but required reading every response; the silent 200 is still a trap
for automated clients that check status only.

**What should have happened:**
- The server should **reject** a `put` whose body doesn't match the contract
  (400 + clear message) — never accept-with-drop.
- The **echo in the put response should be documented as the verification
  contract** (and clients should assert stored payload == sent payload).
- All verb payloads (`put`/`update`) should use **one canonical shape** — ideally
  the same `{pk, sk, data: {...}}` envelope that reads return.

### INCIDENT 2 — MCP write shape ≠ REST write shape (P1)

**What happened:**
The MCP tool `put_item` takes a `data` object and my raw REST `put` (flat fields) —
same logical operation — produced **physically different rows**:
- MCP-written row read back as `{"data": {"data": {s3_key...}}}` (nested).
- REST-written row read back as `{s3_key..., has_answers...}` (flat).

I verified this on the *same pk/sk*: overwriting the row switched its shape.
A client mixing MCP and REST against one table gets inconsistent data.

**Root cause:** the MCP tool passes its `data` argument through as a literal field,
while the REST endpoint stores flat item fields. Two interfaces, two wire shapes,
one storage schema.

**What should have happened:**
- Pick ONE canonical wire shape (recommend `{pk, sk, data}` for both verbs, since
  reads already return `data`), and have the MCP server **translate** to it.
- Add a **contract test** that writes via MCP and via REST and asserts identical
  stored rows.

### INCIDENT 3 — No way to enumerate the whole table (P2)

**What happened:** `query` requires an exact `pk`; there is no "scan all" /
"paginate everything" operation. To load the full index I had to invent a sharding
pattern client-side (pk = `SHARD#0..99`, md5 hashed) and run 100 queries.

**What should have happened:** either
- document the sharding pattern in the API reference as part of the data-modeling
  section (it IS a legit single-table design — just tell people), or
- add `pk_prefix` matching to `query`, or a light `GET /v1/tables/<t>/scan`.

### INCIDENT 4 — No batch writes → client-side pacing (P2)

**What happened:** 166 rows = 166 HTTP calls. To stay under 120 writes/min I had to
build a client-side paced queue (0.8s interval). Works, but it's plumbing that
shouldn't be the consumer's job.

**What should have happened:** a `/v1/batch/put` accepting up to ~50 items in one
request (server paces internally, one HTTP round-trip, same WCU budget). Cuts
request count and simplifies clients on both sides.

### INCIDENT 5 — Cleanup friction (P3)

**What happened:** deleting my test rows required one `delete_item` MCP call per row
(no truncate, no TTL). Fine at this scale; annoying at 55k rows.

**What should have happened:** optional **TTL on rows** (DynamoDB native — free
deletes), or a documented "table has no truncate; drop + recreate" recipe
(already exists via `delete_table` — just surface it).

### MINOR NOTES
- No **Python SDK / client example** in the docs (only TypeScript). This project is
  Python; I wrote ~50 lines of raw HTTP wrapper. A copy-paste Python client module
  in the docs would make adoption near-free.
- No **row-count / table-stats endpoint** (`get_app_usage` shows budgets but not
  per-table row counts). Useful for monitoring and for exactly this kind of review.
- `get_app_usage` returns live meters — great; row counts would complete it.

### FOLLOW-UP FINDING (2026-08-12, second live session)

- **Storage meter vs reality mismatch:** `get_app_usage` reported `storage:
  {bytes: 0, items: 0, tables: 1}` at the exact moment the same table held **44
  readable rows** (verified by querying all 100 shards seconds later). Either the
  storage meter is sampled on a lag, or the item counter is buggy. For a product
  whose docs promise "LIVE PER-APP METERS ... refreshed every 30 s", a meter that
  shows zero items in a non-empty table is a trust issue — verify the counter and
  make the meters honestly reflect the table (row count is cheap to compute
  against DynamoDB DescribeTable).

### CLIENT-SIDE LESSON (my side, for awareness)

- The consumer must not rely on a background daemon writer when the process may
  exit right after the batch (my paced writer drained only 44/166 rows before the
  one-shot driver exited; the always-on bot self-heals). This is a client pattern
  choice, not a gateway bug — but a `/v1/batch/put` endpoint would make the
  client-side paced-queue pattern unnecessary and remove this failure class.

---

## 3b. THE INTERFACES I USED — and how their shapes differ (live-verified)

I touched the platform through **three different surfaces**. Here is exactly what
I used, what the wire format looks like on each, and the discrepancy matrix from
the controlled experiment (2026-08-12).

### Interface A — MCP server (via the 21 MCP tools, called from this coding agent)

Used for: health, app/table lifecycle, one-off puts/gets/deletes, audits.

```
MCP put_item(app_id, table, pk, sk, data: {...})   <- data is a SEPARATE arg
```

The gateway stores the row as:
```json
{ "pk": "SHARD#90", "sk": "SHAPE_A_MCP",
  "data": { "data": { "s3_key": "X/a.json", "has_answers": true } } }   // NESTED
```

### Interface B — REST API, documented flat-item shape (used by my Python client)

```
POST /v1/item/put   { "table": "t", "item": { "pk": "...", "sk": "...", "s3_key": "...", "has_answers": true } }
```

The gateway stores the row as:
```json
{ "pk": "SHARD#90", "sk": "SHAPE_B_REST_FLAT",
  "data": { "s3_key": "X/b.json", "has_answers": true } }               // FLAT
```

### Interface C — REST API, natural "data envelope" shape (my FIRST attempt)

```
POST /v1/item/put   { "table": "t", "item": { "pk": "...", "sk": "..." }, "data": { "s3_key": "...", "has_answers": true } }
```

HTTP **200 OK**, but the stored row is:
```json
{ "pk": "SHARD#90", "sk": "SHAPE_C_REST_ENVELOPE", "data": {} }        // EMPTY — payload dropped
```

### The discrepancy matrix (same logical write, three outcomes)

| Write path | Request shape | Row read back as | Payload survives? |
|---|---|---|---|
| MCP put_item | `data` separate arg | `data: { data: {...} }` (nested) | ✅ but nested |
| REST put | flat fields in `item` | `data: { ... }` (flat) | ✅ |
| REST put | `data` envelope | `data: {}` | ❌ **silently dropped** |

### What this means

1. **MCP and REST produce physically different rows** for the same logical item —
   a consumer mixing interfaces (agents via MCP + apps via REST) must not assume
   rows are interchangeable. My crawler only uses REST, so it is internally
   consistent — but the platform itself should not have two write dialects.
2. **The undocumented shape is accepted, not rejected** — the single most
dangerous behavior for automation.
3. **The `put` response echoes the stored row in `result.data`** — which is what
allowed me to confirm the drop. This echo should be the documented
"verification contract" for all clients.
4. `update` and `get`/`query` in the docs use yet another convention (`data`
envelope) — so a reader of the docs can honestly pick any of three shapes and
only one works.

### Recommended target state (one dialect to rule them all)

```
PUT  { "table": "t", "pk": "...", "sk": "...", "data": { ...payload... } }   // envelope
GET  { "table": "t", "pk": "...", "sk": "..." }                              // returns { data: payload }
QUERY{ "table": "t", "pk": "SHARD#n", "sk_prefix": "..." }                   // returns items[].data
```

- `put` accepts the envelope (as `update` already does), MCP passes `data` through
  (as it already does) — **one shape everywhere**, matching how reads return data.
- Unknown fields inside the payload are fine (they are just stored fields);
  unknown fields at the REQUEST level (e.g. a `data` key inside `item` when the
  contract says flat) must 400.

## 4. What this project EXPECTS from the database (the consumer contract)

For the DB to earn a permanent place here, it must reliably provide:

1. **A truthful "has this already been stored?" answer** — one `get` per test.
   (BROKEN by Incident 1: an empty row answered "yes, has_answers" and would have
   caused skipped crawls. Fixed on my side; must be impossible on yours.)
2. **Small metadata rows only** (~200 B) — comfortably inside the 20 KB cap.
3. **Bounded burst writes** — ~166 rows per crawl run; the 120/min budget fits, but
   only with client pacing unless batch writes exist.
4. **Full-table enumeration** at least occasionally — needs the sharding recipe or a
   scan primitive.
5. **Failure = graceful degradation, never corruption** — the crawler treats DB
   errors as "index unavailable" and falls back to S3. The DB's side of that deal is:
   never store garbage and never lie about what was stored.
6. **Low latency** (✓ ~100–200 ms) and **no hidden cost surprises** (✓ transparent
   budgets).

---

## 5. Verdict

RodeX DB is a genuinely good small database for exactly this kind of job — an
index/state store with simple keys, tight budgets, and agent-driven usage. The
auth model, MCP surface, versioning, idempotency and honest pricing are all
above the bar.

But the **silent-empty-write trap is a trust-killer**: a database that returns 200
and stores nothing is dangerous for real consumers — automated crawlers in
particular, because nobody reads back every row. This is a small fix (validate +
reject + echo stored value) and it converts the product from "clever prototype"
to "something I'd build business logic on".

## 6. Prioritized improvement list

| Priority | Fix | Why |
|---|---|---|
| **P0** | `put` must **reject unknown shapes with 400**; never accept-and-drop | Stops silent data loss (Incident 1) |
| **P0** | One canonical write shape (`{pk, sk, data}`) for **put + update + MCP**; MCP translates, not passes through | Removes MCP/REST divergence (Incident 2 + matrix above) |
| **P0** | Document the `put` response echo as the verification contract | Clients can cheaply assert writes landed |
| **P1** | Contract test: MCP write ≡ REST write on same row | Locks the invariant |
| **P2** | `/v1/batch/put` (≤50 items) | Cuts request count; makes the 120/min budget ergonomic |
| **P2** | Document sharding recipe in data-modeling section (or add `pk_prefix` scan) | Full-table enumeration becomes a solved problem |
| **P2** | Row TTL support | Free cleanup under the always-free tier |
| **P2** | Fix/verify the storage meter (reported 0 items for a 44-row table) | Meters must match reality (Follow-up finding) |
| **P3** | Python client snippet in docs | Removes the only real adoption friction for Python shops |
| **P3** | Table row-count in usage meters | Monitoring + reviews like this one |

---

*Written from live usage logs: 1 app created, 1 table, 166 writes, 3 full-table
enumerations (100 shard queries each), ~20 gets, 7 deletes, 10+ MCP tool calls —
all against the production gateway, 2026-08-12.*