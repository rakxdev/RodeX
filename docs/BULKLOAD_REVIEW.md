# RodeX DB — Bulk-Load Review: The DynamoDB WCU Wall & Silent Partial Writes

> **Consumer:** tstbk-crawler (RodeX app `tstbk-crawler`, table `test_manifests`)
> **Date:** 2026-08-12 · **Type:** Post-incident review of a 55,416-row backfill
> **Result:** 12,043 entries silently missing after the first run → root cause found → fixed → full cleanup done.

---

## 1. Executive summary

The backfill (S3 → rodexdb manifests, Idea 1: 100 tests per ~18KB row) initially appeared to
**succeed entirely** — then verification revealed **~12,000 entries missing** across 17 series,
with zero errors in the client log. The root cause was a **two-limit mismatch**:

- The gateway limits traffic by **requests/min (120 writes/min)** — count-based, size-blind.
- DynamoDB underneath limits by **write units/sec (25 WCU/s)** — size-sensitive (1 WCU per 1KB).

An 18KB row = ~18 WCU. A 50-row batch = **~900 WCU in one instant → DynamoDB throttles most
items**. The gateway wraps this as **HTTP 200 with per-item failures** — and the client ignored
the per-item results, moving on as if everything wrote.

**Bottom line:** the platform's request budget and the platform's *actual* write cost are two
different numbers, and nothing on the gateway side reconciles them. This is a product-level
gap, not just a consumer bug.

---

## 2. What I was doing

Backfilling the full S3 corpus (55,416 test files) into a chunked-manifest index:

```
S3 file (JSON) → extract test_id + has_answers → pack 100 tests per row (~18KB)
→ write to test_manifests via POST /v1/batch/put (≤50 items per call)
```

Pacing was tuned to the *documented* contract only: ≤50 items/call, ≤119 writes/min,
61s pause between minute windows (probe-verified earlier).

---

## 3. The issue — timeline of discovery

### 3.1 First symptom: rows rejected as too big (413)

| Attempt | Result |
|---|---|
| Chunk of 100 tests with titles | HTTP 413 — row > 20,000 bytes |
| Chunk of 100 tests without titles | HTTP 413 — STILL too big |
| Exact-size measurement incl. `pk/sk/data` wrapper, cap 18,000 B | Rows ~17,900 B → accepted... **sometimes** |

First fix: exact-size chunking (measure the full stored item, not an estimate).

### 3.2 Second symptom: run "succeeds" but series are partial

Final run log said `tests indexed: 50136`, `manifest rows written: 501`, no errors.
Verification against S3 showed **42,559 tests in DB vs 55,416 files** — and per-series:

```
SSC_GD_Constable_2026_Mock_Test_Series: 2,964 files → 735 indexed (7 of 31 chunks)
17 series affected, 12,043 entries missing total
```

### 3.3 Root cause found: per-item failures hiding inside HTTP 200

Reproducing with the exact same payload and reading **per-item results**:

```
status: 200
requested: 31 | written: 7
FAILED sk=.../Series#7  → "DynamoDB capacity reached — retry shortly"
FAILED sk=.../Series#8  → "DynamoDB capacity reached — retry shortly"
... (24 failed, 7 ok)
```

The math:
```
1 row ≈ 18KB  ≈ 18 WCU        (DynamoDB: 1 WCU per 1KB)
Batch of 50    ≈ 900 WCU burst
Free tier      ≈ 25 WCU / SECOND
→ throttled per-item, but the HTTP response is still 200
```

The gateway's write-budget reservation (120/min) counts *requests*, not *capacity* — a
single call can silently cost 20× the safe write capacity.

### 3.4 Contributing fault: client ignored per-item results

The backfill writer only read `result.written` and moved on. The gateway *did* report each
failed item with an error string — the client just never checked. (The crawler's own
`batch_put` in `index_store.py` DID retry per-item failures — the backfill script
introduced a separate, weaker writer. Inconsistency across consumers.)

### 3.5 Contributing fault: too-weak resume check

`_series_done` skipped any series that had **at least one** manifest row → partially-written
series were never re-completed by later runs. A completeness threshold (chunk count ==
expected) would have caught it.

### 3.6 Bonus finding: cleanup hit the same wall

Deleting an 18KB row also costs ~18 WCU. Deleting ~560 rows with no pacing → repeated
429 "DynamoDB capacity reached", including on `delete_table` itself (which appears to
drain items before dropping the table — `crawled_tests` with tiny rows deleted instantly,
`test_manifests` with big rows throttled for minutes).

---

## 4. Why this matters for the product (not just this consumer)

1. **A 200 response can mean partial success.** Any automated consumer that checks only
   status codes sees a lie. This is the same class of issue as the earlier silent-empty-write
   incident: **the surface says OK; the storage didn't happen.**
2. **The documented limits are request-based and size-blind.** 120 writes/min tells a
   consumer nothing about the 25 WCU/s reality. A 200-byte row and an 18KB row are the same
   "1 write" to the limiter but 1 WCU vs 18 WCU to DynamoDB.
3. **The docs' claim "the gateway never asks DynamoDB for more than the free tier gives" is
   false for large batches.** A burst of big rows does exactly that — and DynamoDB answers
   with throttling, which the gateway forwards item-by-item.

## 5. What I did to fix it (consumer side)

| Fix | What | Result |
|---|---|---|
| Exact-size chunking | Measure the full stored item (`pk/sk/data` + JSON quoting) vs the 20,000 B cap | No more 413s |
| Byte-budget batching | Group items per call by **total bytes ≤ ~20KB** (≈1 big row per call) instead of ≤50 items | 5/5 rows written in live test, zero throttling |
| Pace to WCU, not requests | ~1 big row per second (≈18 WCU/s < 25 ceiling) | Sustained clean writes |
| Per-item failure handling | Parse `result.items[]`, retry failed `sk`s individually with backoff | No more silent partial batches |
| Completeness-aware resume | (recommended) require expected chunk count, not ≥1 row | Prevents permanent partials |

## 6. Recommendations for RodeX DB (the product fix)

| Priority | Change | Why |
|---|---|---|
| **P0** | Server-side byte-budgeting on `/v1/batch/put`: split or reject batches whose **total serialized bytes** exceed ~20KB (~1-2 big rows), or process them serially with WCU pacing | Makes a 200 response truthful again; no batch can exceed capacity silently |
| **P0** | Document per-item failures prominently: "HTTP 200 may contain `items[].ok=false` — consumers MUST check per-item results" (and echo an overall `all_ok` flag) | Prevents the next silent-partial consumer |
| **P1** | Expose per-table row **sizes / WCU cost** (`get_app_usage` could estimate `bytes/1024` per write) | Lets consumers size rows against the real budget |
| **P1** | `delete_table` on tables with large rows should pace or warn (it currently throttles mid-operation) | Cleanup shouldn't require client-side pacing |
| **P2** | Consider WCU-aware accounting in rate limits (e.g., budget = `sum(bytes)/1024` per minute, not item count) | Aligns the visible contract with the real one |

## 7. Verification evidence

- Per-item failure reproduction: **requested 31 → written 7 → 24× "DynamoDB capacity reached"**, all inside HTTP 200.
- WCU math confirmed: row sizes 17,836–17,934 B → ~18 WCU each; batch of 4 → only 2 written.
- Byte-budgeted writer live test: **5/5 rows written**, single-row calls, ~1.1s pacing.
- Final cleanup: paced item-deletes emptied `test_manifests` (cursor aborted after completion verified: 0 rows), `crawled_tests` table deleted successfully.
- App state after cleanup: `test_manifests` exists but empty (0 rows, 0 tests); `crawled_tests` removed.

---

*Written 2026-08-12 from live run logs, REST probes, per-item batch responses, and DB audits.*