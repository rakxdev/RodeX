# RodeX v1 — API Reference

Base URL: your gateway worker URL. All requests/responses JSON.
Auth headers on **every** request: `X-App-Id`, `X-Api-Key`.

Response shape: `{ "ok": true, "result": {...} }` | `{ "ok": false, "error": { "code", "message", "retry_after?" } }`
429 messages name their budget: `"Rate limit exceeded — writes budget, retry in 59s"`.

## App endpoints

### `GET /v1/health`
Public liveness: `{ "ok": true, "service": "rodex-gateway", "version": 1 }`.
No auth, no rate limit.

### `POST /v1/table/create`
```json
{ "name": "users", "request_id": "optional" }
```
Creates physical table `app_<app_id>_users`, registers it. 409 if exists, 400 bad name.
Tables provision **5 WCU + 5 RCU** (free pool 25+25 → up to 5 tables stay free).

### `GET /v1/tables`
Lists the app's tables.

### `POST /v1/table/delete`
```json
{ "name": "users", "request_id": "optional" }
```
Drops the physical table and deregisters it — **all data is gone**. 403 if the
app does not own the table (no existence leak), 400 bad name, 404 unknown app.

### `POST /v1/item/put`

Two item shapes are accepted — both store the payload **flat** under `data`:

```json
{ "table": "users", "item": { "pk": "USER#1", "sk": "PROFILE", "name": "R" },
  "overwrite": false, "request_id": "req-1" }
```

or the canonical **envelope** (identical to what reads return):

```json
{ "table": "users", "item": { "pk": "USER#1", "sk": "PROFILE", "data": { "name": "R" } },
  "overwrite": false, "request_id": "req-1" }
```

- `pk` required (≤ 500 chars); `sk` optional (default `"~"`).
- A `data` key inside `item` selects the envelope; mixing it with flat fields → 400.
- Responses echo the stored row with its **`bytes`** (full representation);
  the write consumes `max(1, ceil(bytes/1024))` units from the active budget
  (NORMAL: 800 write-units/min; PERFORMANCE: 100 000 guardrail; rows ≤ 1 KB = 1 unit).
- Optional `ttl` (integer, unix seconds) — the row **expires after this** and
  deletes itself for free (DynamoDB TTL; physical deletion lags up to ~48 h,
  but the gateway never returns an expired row). `ttl` is echoed in responses.
- **Strict bodies:** unknown TOP-LEVEL keys on any item endpoint are rejected
  with 400 + the allowed list — never silently ignored. (The old `data`-at-top-
  level mistake now fails loudly instead of storing an empty row.)
- **Verification contract:** the response echoes the stored row
  (`result.data` = what was persisted, `result.version`, timestamps). Clients
  that care should assert `result.data` equals what they sent.
- Without `overwrite`, existing row → 409. Payload > 20 KB → 413.

### `POST /v1/batch/put`
```json
{ "table": "users", "items": [
    { "pk": "USER#1", "data": { "name": "R" } },
    { "pk": "USER#2", "sk": "PROFILE", "data": { "name": "S" } }
  ], "overwrite": false, "request_id": "batch-1" }
```
- Up to **50 items** per call; each item takes the same two shapes as `put`
  (envelope or flat), plus optional `ttl`.
- **All-or-nothing validation:** any invalid item (missing pk, bad shape, > 20 KB)
  rejects the WHOLE batch with 400/413 and nothing is written.
- **Budget honesty (WCU units):** every row costs
  `max(1, ceil(bytes/1024))` write-units (DynamoDB's exact rounding rule).
  Rows ≤ 1 KB = 1 unit; an 18 KB row = 18 units. The app's budget is
  **120 write-units/min** (≈ 120 KB/min) — reserved BEFORE any write; 429
  when the batch would exceed it.
- **`all_ok` is the success signal** — `true` only when EVERY item wrote.
  An HTTP 200 can contain per-item failures: `items[]` with
  `{ pk, sk, ok, item }` or `{ pk, sk, ok: false, error }`. **Consumers MUST
  check `all_ok`** (or per-item `ok`) and retry failed items individually —
  same discipline DynamoDB's `UnprocessedItems` and Elasticsearch's bulk
  `errors` flag demand. `request_id` makes the whole batch idempotent.
- **Byte cap:** the batch's TOTAL serialized bytes must be ≤ 20 000 — a
  batch can never burst the WCU ceiling. Large rows (≈18 KB) = 1 row per
  call → 413 with a clear message before anything is written.
- Every stored item echoes its **`bytes`** (full representation) — the
  number write-budget math charges on.

### `POST /v1/batch/get`
```json
{ "table": "users", "keys": [
    { "pk": "USER#1", "sk": "PROFILE" },
    { "pk": "USER#2" }
  ], "strong": false }
```
- Up to **50 keys** per call; `sk` optional (defaults to `"~"`), exactly like
  `put`. All keys validated first — any bad key → 400, nothing returned.
- **Missing keys are NOT errors**: response is
  `{ requested, found: [items…], missing: [{pk, sk}…] }`.
- **Budget honesty:** N keys consume **N reads** from the active mode budget (800/min NORMAL; guardrails in PERFORMANCE)
  (reserved before the call). `strong: true` = consistent reads (2× cost).
- TTL-expired rows are reported as missing.

### `POST /v1/item/increment` — atomic counters
```json
{ "table": "users", "pk": "PAGE#7", "sk": "views", "by": 1 }
```
- Atomic add to the row's counter — **one write, zero reads, race-free**
  (DynamoDB `ADD`). Creates the row if missing; `by` defaults to 1, negative
  decrements. Returns the row with the **new counter value** (`result.counter`)
  plus `incremented_by`.
- Counter rows read back as `{ pk, sk, data: {}, counter, version, … }` and are
  visible to `get` / `query` / `batch/get` like any row.

### `POST /v1/item/get`
```json
{ "table": "users", "pk": "USER#1", "sk": "PROFILE", "strong": false }
```
`sk` optional — defaults to the `"~"` sentinel, same as put. `strong: true` = strongly
consistent read (costs 2×). 404 if missing.

### `POST /v1/item/update`
```json
{ "table": "users", "pk": "USER#1", "sk": "PROFILE",
  "data": { "name": "R2" }, "expected_version": 1, "request_id": "req-2" }
```
- `expected_version` optional; mismatch → 409. Missing row → 404.

### `POST /v1/item/delete`
```json
{ "table": "users", "pk": "USER#1", "sk": "PROFILE", "expected_version": 2 }
```

### `POST /v1/query`
```json
{ "table": "users", "pk": "USER#1", "sk_prefix": "MSG#", "limit": 50, "start_key": "opaque" }
```
Returns `items[]` (each with `data` parsed, `version`, `created`, `updated`),
`has_more`, `next_start_key`.

`pk` is an **exact** match — there is no scan-all operation. To enumerate a
whole table, shard client-side: `pk = SHARD#<md5(key) % 100>`, then query
`SHARD#0 … SHARD#99` with pagination (the recipe used by the tstbk-crawler).
See [docs/python.md](python.md) for a working example.

## Admin endpoints (session cookie or GitHub OAuth)

| Method/Path | Purpose |
|---|---|
| `POST /v1/admin/login` `{password}` | password login → session cookie |
| `GET /v1/auth/github/start` | GitHub OAuth start (302) |
| `GET /v1/auth/github/callback?code&state` | OAuth callback (302 → dashboard) |
| `GET /v1/admin/me` | session state + allowed users |
| `POST /v1/admin/logout` | destroy session |
| `POST /v1/admin/change-password` `{old_password, new_password}` | rotate console password (≥12 chars; hash stored in platform settings) |
| `POST /v1/admin/apps` `{name}` | create app → `api_key` shown ONCE |
| `POST /v1/admin/apps` `{name, description?}` | optional app note (≤200 chars) |
| `GET /v1/admin/apps` | list apps |
| `GET /v1/admin/apps/:id` | app detail |
| `GET /v1/admin/apps/:id/usage` | live meters — limiter counters (peek, no consumption) + storage size (60 s cache; item/byte counts come from AWS DescribeTable and lag up to ~6 h)
| `POST /v1/admin/apps/:id/rotate-key` | new key (old invalid instantly) |
| `POST /v1/admin/apps/:id/view-key` | decrypt + show the raw key inside its 48 h recovery window |
| `POST /v1/admin/apps/:id/suspend` / `resume` | block/unblock traffic |
| `DELETE /v1/admin/apps/:id` | soft delete (5-min recovery window; `POST .../delete` alias exists) |
| `POST /v1/admin/apps/:id/recover` | cancel soft delete |
| `POST /v1/admin/apps/:id/force-delete` | purge all tables + registry now |
| `GET /v1/admin/capacity` | platform capacity mode + every table's billing mode |
| `POST /v1/admin/capacity` `{mode}` | switch ALL tables: `normal` (provisioned 5/5, $0) or `performance` (on-demand) — per-table results; takes minutes at AWS |
| `GET /v1/admin/purge/run` | trigger purge manually (cron also runs it) |
| `POST /v1/admin/mcp/keys` `{name, description?}` | mint a master key → `rok_mcp_…` returned (re-viewable anytime) |
| `GET /v1/admin/mcp/keys` | list master keys (metadata only — never hashes/raw) |
| `POST /v1/admin/mcp/keys/:id/view` | re-view the raw master key — **anytime**, no window |
| `DELETE /v1/admin/mcp/keys/:id` | destroy a master key (instant revocation; no rotation exists) |

> **Meter honesty:** request counters are LIVE (peeked, zero consumption);
> storage bytes/items are AWS-sampled (~6 h lag — fresh tables show 0 until
> the first sweep). Exact counts any time: the sharded scan recipe
> ([docs/python.md](python.md) `scan_all`). See [docs/faq.md](faq.md).

## Keys

- API keys are **branded**: `rok_` + 43 base64url chars (256-bit). Old
  pre-`rok_` keys keep working until rotated.
- Keys are shown ONCE at issue and stored as an HMAC hash only — but a
  short-lived AES-GCM copy keeps them recoverable for **48 hours** after
  creation/rotation (`key_recoverable_until` on the app; `POST .../view-key`).
  After the window, rotation is the only path to a fresh key.

## MCP (`/mcp`)

The gateway serves the Model Context Protocol at `/mcp` (Streamable HTTP,
JSON-RPC) — see [docs/mcp.md](mcp.md). Master keys (`rok_mcp_…`, managed via
the console MCP page and the admin endpoints above) unlock **full platform
access**: 26 tools over every app/table/item (incl. `batch_put_item`,
`set_platform_capacity`). Every mutation requires `confirmed: true` (the
confirmation gate); without it the server refuses with `confirmation_required`.
MCP budgets: NORMAL 2 000 total / 800 write-units / 800 reads per
minute — guardrails only in PERFORMANCE — counted by the same single-point
limiter. See [docs/capacity.md](capacity.md).
MCP writes share ONE wire shape with REST (`{pk, sk?, data}` envelope) — rows
written through either interface are physically identical.

## Error codes

`400` malformed · `401` bad/missing credentials · `403` not your table / suspended ·
`404` missing · `409` conflict (version, duplicate) · `413` too large (row > 20 KB, or batch total > 20 KB) ·
`415` non-JSON body (POST requires `Content-Type: application/json`) ·
`429` rate limit — **names its budget** (e.g. "writes budget, retry in 59s"), with `retry_after` ·
`502/503` retryable infrastructure.

## Retry guidance

On `429`/`502`/`503`: wait `retry_after` seconds (default 1) and retry.
Writes sent with `request_id` are safe to retry — the gateway dedupes for 24 h.
