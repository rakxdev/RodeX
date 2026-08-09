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
| 20 KB | 20 | ✅ fine (headroom for meta ops) |
| 24.5 KB | 25 | ⚠️ uses the ENTIRE pool for one write |
| 100 KB | 100 | ❌ throttled (ProvisionedThroughputExceeded) |
| 400 KB (DynamoDB's own max) | 400 | ❌❌ throttled hard |

**Conclusion:** DynamoDB's "400 KB per item" limit is useless on the free pool.
We cap **writes at 20 KB** → one write never needs more than 20 WCU, so the
gateway itself guarantees **zero throttling on writes** (math, not luck).

Reads: 1 RCU = one strongly-consistent read of ≤ 4 KB (eventual = half, min 0.5).
A 20 KB item = 5 RCU strong / 2.5 RCU eventual → we default to **eventual
consistency** for get/query (option `strong: true` for the rare strict case).

## 3. Per-app and platform limits (why these numbers)

Worst-case math with our caps:

- 1 write op ≤ 20 KB = ≤ 20 WCU. We allow **120 writes/min/app = 2/s**.
  Ten active apps at full tilt = 20/s → **≤ 20 WCU/s** ✔ (pool 25).
- 1 read op ≤ 20 KB = 2.5 RCU eventual. We allow **240 reads/min/app = 4/s**.
  Ten apps = 40/s × 2.5 RCU = 25 RCU/s ✔ (pool 25, exactly).
- Meta/idempotency writes (≈1–2 per request) reserve the remaining 5 WCU.

| Limit | Value | Why |
|---|---|---|
| Per app, total | 600 / min | ≈ 10/s — generous, burst-friendly |
| Per app, writes | 120 / min | keeps 10-app worst case ≤ 20 WCU/s |
| Per app, reads | 240 / min | keeps 10-app worst case ≤ 25 RCU/s |
| Platform (all apps, per location) | 1 000 / min | second safety net on the shared pool |
| Admin endpoints | 60 / min | human-only |
| Cron purge | 1 / min | free plan allows 5 cron triggers |

Workers free = 100k requests/day for ALL our endpoints combined. Even if every
limit above were hit constantly, that's ~1.4M/day theoretical — so the **daily
request budget is the real ceiling**, and it's per-day, not per-minute. Our
actual traffic (Rakesh's bots/dev servers) is a tiny fraction; the 100k/day
number is documented so nobody is surprised.

## 4. Two known approximations (documented, not hidden)

1. **The Workers Rate Limiting binding counts per Cloudflare location**, not
   globally. An app hammering from many datacenters could momentarily exceed
   its global intent. Mitigation: our caps are already conservative vs the
   DynamoDB pool, and DynamoDB throttling is still mapped to 429 + Retry-After.
2. **Bursts within one second** can still spike above 25 units even when
   per-minute averages are fine (e.g., 20 writes arrive the same second).
   Mitigation: gateway maps `ProvisionedThroughputExceeded` → `429 Retry-After: 1`;
   our own apps use a tiny retry-with-backoff helper (docs/api.md).

## 5. What happens on every failure path

| Situation | Client sees | Internal |
|---|---|---|
| Over per-app limit | 429 (JSON) | rate limiter rejects before DynamoDB |
| DynamoDB throttle | 429 + Retry-After: 1 | logged, no crash |
| Item > 20 KB | 413 | rejected before signing |
| Unknown key / wrong app | 401 | logged (no key material) |
| Table not owned | 403 | registry check |
| Stale version | 409 | conditional write |
| Network/AWS outage | 502 (retryable) | logged with request_id |
| Purge in progress | 409 "app is being deleted" | state machine |

**Guarantee:** no path leaks a 500 with internal detail, no path writes
unintended data, every path is idempotency-safe.

## 6. Capacity planning notes (v2+)

- Storage: 25 GB free — text data only (20 KB cap) → **millions of records**.
- If > 25 GB ever needed: second AWS account (separate free pool) or R2 (10 GB
  free, $0 egress) for blobs — decided later, never silently.
- On-demand mode: **never** — it has no free tier (AWS re:Post confirmed).
