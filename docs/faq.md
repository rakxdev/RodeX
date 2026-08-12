# RodexDB FAQ

Plain-language answers to the questions that actually come up. Newest first.

## 1. "My storage meter shows 0 B / 0 items — but I'm storing data!"

**Short answer:** your data is fine — the meter is a slow snapshot, not a lie.

The storage numbers (bytes/items) come from AWS's built-in table counter
(`DescribeTable`), which AWS refreshes only **roughly every 6 hours**.
A brand-new table shows **0 until its first sweep** — even while rows are
readable and your app is writing to it every minute.

How to verify your data is really there, right now:

```bash
# the sharded scan recipe — exact, on demand (see docs/python.md for the
# zero-dependency scan_all() function)
python3 -c "
from rodex_client import RodexClient, scan_all
db = RodexClient('https://your-gateway.workers.dev', 'app_…', 'rok_…')
print(len(scan_all(db, 'crawled_tests')), 'rows')
"
```

**Why don't we make it real-time?** Honest engineering trade-off:

| Idea | Why it's a no |
|---|---|
| Count by reading all rows on every refresh | Burns the free read budget — the meter would throttle your own app |
| Maintain a live counter on writes/deletes | TTL rows delete themselves at AWS with no signal to us → the counter drifts → it would **lie** |
| AWS event streams | Real infrastructure (consumer, state, failure modes) for a number nobody needs at 30 s precision |

**What IS real-time:** the request meters (used / remaining for total, writes,
reads) — those are genuinely live, second by second. Only the storage
bytes/items snapshot lags, and it self-corrects within a few hours of a
table's creation. The console labels it honestly: **"REQUESTS LIVE · STORAGE
AWS-SAMPLED"**.

## 2. "What are the limits? Can I write big rows? Why did my 20 KB row start working?"

Item cap: **400 KB in both capacity modes** (DynamoDB's hard limit) — the old
20 KB was a free-tier cost optimization, now just a recommendation (1 write
unit per KB). NORMAL mode budgets: 2 000 write-units/min per app, 40 000
reads/min; PERFORMANCE mode (on-demand billing): guardrails only. Reads are
**never size-gated** — a 400 KB row returns fully in ONE get. Switching modes
never breaks existing rows (same caps both modes); see docs/capacity.md.

## 3. "Why did my batch partially fail? The response said 200!"

A 200 means *the request was processed* — **`all_ok` is the success signal.**
Batch responses contain `all_ok: true/false` and per-item `items[]` results;
a row can fail individually (e.g., DynamoDB throttling burst, duplicate row
without `overwrite`). Check `all_ok` (or per-item `ok`) and retry failed
items one by one with backoff — the same discipline Elasticsearch (`errors`
flag), DynamoDB (`UnprocessedItems`) and BigQuery (`insertErrors`) require.
`request_id` makes whole-batch retries safe. Also: a batch's TOTAL bytes must
fit 20 KB (big ~18 KB rows = 1 row per call).

## 4. "Why do I get 429 rate limits? I barely did anything."

Budgets are strict by design (ADR-003) so the free tier is never exceeded:
**per app** 50 000 requests / **2 000 write-units** / 40 000 reads per
minute (NORMAL mode; PERFORMANCE raises these to guardrails only);
**platform-wide** 100 000/min. Every row costs `max(1, ceil(bytes/1024))`
write-units (≤ 1 KB = 1 unit — DynamoDB's own rule), so an 18 KB row costs
18 units. A batch-get of N keys counts as **N reads**. 429s name their budget
and carry `retry_after` seconds — treat the 429 as the meter and back off
exactly that long. Writes sent with `request_id` are safe to retry.

## 5. "I set a TTL — when is the row actually gone?"

From your app's point of view: **instantly** — the gateway never returns an
expired row (404 on get, excluded from query/batch-get). Physically, AWS
deletes it for free within ~48 hours of expiry (background sweep). You never
pay for the delete.

## 6. "Do I need the SDK to use the API?"

No. The REST API (docs/api.md) and the MCP interface (docs/mcp.md) are the
contract; the SDK is a thin typed wrapper. Python users can copy the
zero-dependency client from docs/python.md.

## 7. "Can I use the live instance for production?"

For evaluation, yes. For real use, deploy your own gateway — same code, one
command, your own domain and keys (docs/aws-setup.md, docs/env.md).

## 8. "Is there a scan-all / full-table enumeration?"

No scan endpoint (it would wreck the budget math), but the **sharded scan
recipe** is the documented pattern: `pk = SHARD#<md5(key) % 100>`, then query
all 100 shards with pagination. Working code: `scan_all()` in
[docs/python.md](python.md).

## 9. "What's this 'commercial use forbidden' about?"

RodexDB is free for personal/educational use; **commercial use is strictly
forbidden** by the license (LICENSE). That's the founder's call, not a
limitation of the software.
