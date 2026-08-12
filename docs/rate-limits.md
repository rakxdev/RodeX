# RodeX v1 — Rate Limit & Capacity Math (why every number is what it is)

> Version 1 · Verified against official AWS + Cloudflare docs, May 2026.

## 1. The free pools we must never exceed

| Pool | Amount | Applies to | Source |
|---|---|---|---|
| DynamoDB writes | **25 WCU** (provisioned, Standard class) | ALL tables in the AWS account in **ap-southeast-1** combined | aws.amazon.com/dynamodb/pricing |
| DynamoDB reads | **25 RCU** (provisioned) | same | same |
| DynamoDB storage | **25 GB** | same | same |
| Cloudflare Workers | **100 000 requests/day** (all our Workers combined) | gateway + admin + cron | developers.cloudflare.com/workers/platform/limits |
| Cloudflare CPU | **10 ms per invocation** (free) | gateway | same |
| Cloudflare subrequests | **50 external per invocation** (free) | each DynamoDB call = 1 | same |
| KV (if used later) | 100k reads / 1k writes / day | cache only (not in v1 core) | workers/platform/pricing |

Free tier is **per account per region** and is measured in **capacity-unit-hours**:
25 WCU × 730 h/month = 18 250 WCU-hours/month — i.e. we may run 25 WCU
constantly and still pay $0.

## 2. The item-size constraint people always miss

A write costs `ceil(item_bytes / 1024)` WCU **in that single second**.

| Item size written | WCU needed | Verdict on 25-WCU pool |
|---|---|---|
| 1 KB | 1 | ✅ fine |
| 400 KB | 400 | ✅ hard DynamoDB item limit (NORMAL writes pace by units) |
| 24.5 KB | 25 | ⚠️ uses the ENTIRE pool for one write |
| 100 KB | 100 | ❌ throttled (ProvisionedThroughputExceeded) |
| 400 KB (DynamoDB's own max) | 400 | ❌❌ throttled hard |

**Conclusion:** DynamoDB's "400 KB per item" limit is useless on the free pool.
The hard item cap is **400 KB** in both modes. NORMAL mode charges write-units
by size and enforces 800 units/min per app; PERFORMANCE mode is on-demand with
guardrails only. A 20 KB row remains the recommended cost-friendly shape.

Reads: 1 RRU = one strongly-consistent read of ≤ 4 KB (eventual = half, min 0.5).
A 400 KB item = 100 RRU strong / 50 RRU eventual → we default to **eventual
consistency** for get/query (option `strong: true` for the rare strict case).

## 3. Per-app and platform limits (why these numbers)

Writes are charged in **WCU units** — the same unit DynamoDB charges the free
tier: every row costs `max(1, ceil(bytes/1024))` (each row rounds UP to whole
KB, exactly like DynamoDB's own sizing). Small rows are unchanged (≤ 1 KB =
1 unit); big rows honestly cost more.

| Row size | Write cost | Rows/min at 800 units (NORMAL) | Good for |
|---|---|---|---|
| ≤ 1 KB | 1 unit | 800/min | keys, flags, sessions |
| ~2 KB | 2 units | 400/min | small records |
| ~10 KB | 10 units | 80/min | manifest chunks, blobs |
| ~18 KB | 18 units | ~44/min | big rows (1 per batch call) |

The budget depends on the platform capacity mode (docs/capacity.md):

- **NORMAL** (provisioned, $0): **800 write-units/min per app** (~13/s, half
  the 25 WCU/s account pool with margin), reads 800/min, total 2 000/min,
  platform 2 400/min — the free tier made honest; 429s name the budget.
- **PERFORMANCE** (on-demand): guardrails only — writes 100 000 units/min,
  reads 400 000/min — never a wall; runaway-script protection only.

Reads: 1 unit per 4 KB at AWS (eventual reads cost half). Table ceiling in
NORMAL: 5 WCU/5 RCU each per second (free pool 25+25 account-wide — that is
WHY NORMAL budgets are 800, not thousands: the pool is the wall).

Worst-case math with our caps:

- 1 write op ≤ 400 KB = ≤ 400 WCU. NORMAL allows **800 write-units/min/app ≈ 13/s — half the 25 WCU/s pool**, with DynamoDB burst credit for spikes (PERFORMANCE = guardrails only).
  Ten active apps at full tilt = 20/s → **≤ 20 WCU/s** ✔ (pool 25).
- 1 read op ≤ 400 KB = 50 RRU eventual. NORMAL allows **800 reads/min/app**; PERFORMANCE is guardrails-only.
  Ten apps = 40/s × 2.5 RCU = 25 RCU/s ✔ (pool 25, exactly).
- Meta/idempotency writes (≈1–2 per request) reserve the remaining 5 WCU.

| Limit | Value | Why |
|---|---|---|
| Per app, total | 2 000 / min NORMAL | generous, physics-honest |
| Per app, writes | 800 write-units / min NORMAL | half the 25 WCU/s pool with margin |
| Per app, reads | 800 / min NORMAL | half the 25 RCU/s pool with margin |
| Platform (all apps) | 2 400 / min NORMAL | shared free-tier safety net |
| Admin endpoints | 60 / min | human-only |
| Cron purge | 1 / min | free plan allows 5 cron triggers |

Workers free = 100k requests/day for ALL our endpoints combined. Even if every
limit above were hit constantly, that's ~1.4M/day theoretical — so the **daily
request budget is the real ceiling**, and it's per-day, not per-minute. Our
actual traffic (Rakesh's bots/dev servers) is a tiny fraction; the 100k/day
number is documented so nobody is surprised.

## 4. Enforcement model (v2 — STRICT, since Aug 2026)

All budgets are counted by a **single-point Durable Object** (`RateLimiterDO`,
free plan, SQLite-backed): one shared, single-threaded counter owner, so the
numbers the docs promise are the numbers enforced — **no edge lag, no burst
tolerance, no per-location drift**. Every request consumes ALL of its budgets
atomically (per-app total, per-app kind, platform pool) in one DO call; the
first exhausted budget answers with `429` naming it:

```json
{"ok":false,"error":{"code":429,"message":"Rate limit exceeded — writes budget, retry in 59s","retry_after":59}}
```

The 429 names its budget (total / writes / reads / platform / admin) so a
client always knows which ceiling it hit. A rare DO restart merely starts a
fresh window (over-allow of at most one minute, never a lock-out).

**Batch accounting:** `POST /v1/batch/put` (≤ 50 items) consumes **N write
units** from the app's 800 write-units/min (NORMAL) — the whole batch is checked against the
budget BEFORE anything is written, so a batch that would blow the budget
answers 429 with nothing stored. One HTTP round-trip, same budget math as N
single puts.

**Batch & multi-read accounting:** `POST /v1/batch/put` consumes N writes
(as documented); `POST /v1/batch/get` consumes **N reads** (N keys); both are
reserved BEFORE the call so a batch that would blow the budget answers 429
with nothing executed. `POST /v1/item/increment` is exactly **one write**
(atomic `ADD` — no hidden read).

**Row TTL:** rows written with `ttl` expire and are deleted by DynamoDB for
**free** (0 WCU). Physical deletion can lag up to ~48 h after expiry; the
gateway filters expired rows on every read path, so clients never see them.

**Meter honesty:** the usage meters distinguish two sources — request counters
(used/limit/remaining) are LIVE (peeked from the limiter DO, zero
consumption); storage bytes/items come from DynamoDB `DescribeTable`, which
AWS samples **roughly every 6 hours**, so a fresh table can report 0 items for
a while even though rows are readable. `sampled_at` marks the snapshot time.

Real-time item counts are deliberately NOT built: a live counter drifts (TTL
rows delete at AWS with no signal back), and full scans on refresh would burn
the free read budget. Exact counts on demand = the sharded scan recipe
([docs/python.md](python.md)). Full rationale: [docs/faq.md](faq.md).

## 5. Per-table provisioned capacity (the second ceiling)

Every app data table provisions **5 WCU + 5 RCU** (free pool is 25+25
account-wide → up to 5 tables at 5/5 stay free; legacy 1/1 tables are
auto-upgraded on their next touch). Sustained throughput per table:

| Load | Per table | Verdict |
|---|---|---|
| NORMAL writes ≤ 800 units/min | ≤ 25 WCU/s account pool | ✅ with margin + burst credit |
| NORMAL reads ≤ 800/min eventual | ≤ 25 RCU/s account pool | ✅ with margin + eventual reads |
| Fresh-table burst | ~35 units of credit, refills at provisioned rate | ⚠️ drains in seconds |

An artificial 1 000-request single-minute burst on 5 tables can brush the
fresh-table credit and throttle at DynamoDB (mapped to 429 "DynamoDB capacity
reached"). Real apps pacing at the documented budgets never see it.

## 6. What happens on every failure path

| Situation | Client sees | Internal |
|---|---|---|
| Over per-app limit | 429 naming the budget | single-point DO rejects before DynamoDB |
| Over platform pool | 429 "platform budget" | same |
| Over admin surface | 429 "admin budget" | same |
| DynamoDB throttle | 429 + Retry-After: 1 | logged, no crash |
| Item > 400 KB | 413 | rejected before signing |
| Unknown key / wrong app | 401 | logged (no key material) |
| Table not owned | 403 | registry check |
| Stale version | 409 | conditional write |
| Network/AWS outage | 502 (retryable) | logged with request_id |
| Purge in progress | 409 "app is being deleted" | state machine |

**Guarantee:** no path leaks a 500 with internal detail, no path writes
unintended data, every path is idempotency-safe.

## 7. Stress-test evidence (2026-08-09, live production gateway)

| Scenario | Sent | Allowed | Denied | Verdict |
|---|---|---|---|---|
| NORMAL write-units burst (active budget) | capacity-profile test | 800 units/min | 429 names budget | ✅ exact profile enforcement |
| NORMAL reads burst (active budget) | capacity-profile test | 800/min | 429 names budget | ✅ exact profile enforcement |
| Admin burst 70 (budget 60/min) | 70 | 59 + 1 login | 11 × 429 | ✅ exact |
| Mixed isolation (app A saturated, app B) | capacity-profile test | independent per-app buckets | — | ✅ apps fully isolated |
| 100 rapid writes, fresh 5-WCU table | 100 | 100 | 0 | ✅ no DB throttle (was ~36 at 1 WCU) |
| 100 reads, 2-way, long-used table | 100 | 100 | 0 | ✅ |
| Platform pool (2 400/min) | unit-tested | ~2 400 | — | ✅ same DO code path as the exact per-app results |

Every 429 carried `retry_after`; the 429 message names its budget ("writes
budget, retry in 59s"). All tests ran through the gateway — Cloudflare edge +
worker + DynamoDB — against a live app.

## 8. Capacity planning notes (v2+)

- Storage: 25 GB free — text data only (400 KB hard cap; 20 KB recommended) → **millions of records**.
- If > 25 GB ever needed: second AWS account (separate free pool) or R2 (10 GB
  free, $0 egress) for blobs — decided later, never silently.
- On-demand mode: **never** — it has no free tier (AWS re:Post confirmed).
