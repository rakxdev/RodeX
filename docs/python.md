# RodexDB Python Client

Zero-dependency Python 3 client for the gateway REST API — the module the
tstbk-crawler uses in production. Copy `RodexClient` into your project (or
`import` this file) and you have full CRUD, batch writes, and the sharded
full-table scan recipe.

## The client (no dependencies — stdlib only)

```python
"""rodex_client.py — minimal RodexDB client (stdlib only)."""
import hashlib, json, time, urllib.request, urllib.error


class RodexError(Exception):
    def __init__(self, code, message, retry_after=None):
        super().__init__(f"[{code}] {message}")
        self.code, self.retry_after = code, retry_after


class RodexClient:
    def __init__(self, base_url, app_id, api_key, timeout=15):
        self.base = base_url.rstrip("/")
        self.app_id, self.api_key, self.timeout = app_id, api_key, timeout

    def _call(self, path, body=None, retries=3):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method="POST" if body is not None else "GET")
        req.add_header("Content-Type", "application/json")
        req.add_header("X-App-Id", self.app_id)
        req.add_header("X-Api-Key", self.api_key)
        for attempt in range(retries):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                err = json.loads(e.read() or b"{}").get("error", {})
                if e.code == 429 and attempt + 1 < retries:  # budget named, wait & retry
                    time.sleep(err.get("retry_after", 1))
                    continue
                raise RodexError(e.code, err.get("message", e.reason), err.get("retry_after"))
        raise RodexError(0, "unreachable")

    def put(self, table, pk, sk, payload, overwrite=False, request_id=None, ttl=None):
        """Envelope shape — canonical; stores payload FLAT under data. ttl = unix seconds to auto-expire."""
        item = {"pk": pk, "sk": sk, "data": payload}
        if ttl is not None: item["ttl"] = ttl
        return self._call("/v1/item/put", {"table": table, "item": item,
                                           "overwrite": overwrite, **({"request_id": request_id} if request_id else {})})

    def batch_put(self, table, items, overwrite=False, request_id=None):
        """items: list of (pk, sk, payload) triples — up to 50 items / 20 KB total.
        ALL_OR_NOTHING RULE: check result['all_ok'] — a 200 is not success.
        Retry failed sk's individually with backoff."""
        body = {"table": table, "items": [{"pk": p, "sk": s, "data": d} for p, s, d in items],
                "overwrite": overwrite, **({"request_id": request_id} if request_id else {})}
        res = self._call("/v1/batch/put", body)["result"]
        assert res["all_ok"], f"batch partial: {res['written']}/{res['requested']} written — retry items with ok:false"
        return res

    def get(self, table, pk, sk="~", strong=False):
        return self._call("/v1/item/get", {"table": table, "pk": pk, "sk": sk, "strong": strong})

    def query(self, table, pk, sk_prefix=None, limit=100, start_key=None):
        body = {"table": table, "pk": pk, "limit": limit}
        if sk_prefix is not None: body["sk_prefix"] = sk_prefix
        if start_key is not None: body["start_key"] = start_key
        return self._call("/v1/query", body)

    def get_many(self, table, keys, strong=False):
        """keys: list of (pk, sk) — up to 50, one round-trip. Returns (found, missing)."""
        res = self._call("/v1/batch/get", {"table": table, "keys": [{"pk": p, "sk": s} for p, s in keys], "strong": strong})["result"]
        return res["found"], res["missing"]

    def increment(self, table, pk, sk, by=1):
        """Atomic counter — one write, race-free. Returns the new value."""
        return self._call("/v1/item/increment", {"table": table, "pk": pk, "sk": sk, "by": by})["result"]["counter"]

    def delete(self, table, pk, sk, expected_version=None):
        body = {"table": table, "pk": pk, "sk": sk}
        if expected_version is not None: body["expected_version"] = expected_version
        return self._call("/v1/item/delete", body)


def shard_of(key, shards=100):
    """The documented sharding recipe — pk = SHARD#<md5 % N> for full-table scans."""
    return f"SHARD#{int(hashlib.md5(key.encode()).hexdigest(), 16) % shards}"


def scan_all(client, table, shards=100, limit=100):
    """Enumerate an ENTIRE table: query every shard with pagination."""
    rows = []
    for i in range(shards):
        start_key, more = None, True
        while more:
            r = client.query(table, f"SHARD#{i}", limit=limit, start_key=start_key)["result"]
            rows.extend(r["items"])
            start_key, more = r.get("next_start_key"), r.get("has_more", False)
    return rows
```

## Usage

```python
from rodex_client import RodexClient, scan_all, shard_of

db = RodexClient("https://rodex-gateway.rakxdev.workers.dev", "app_…", "rok_…")

# hot path: 1 read + 1 write per item (the crawler pattern)
if db.get("crawled_tests", shard_of(test_id)).get("ok"):
    pass  # already crawled — skip
db.put("crawled_tests", shard_of(test_id), test_id, {"s3_key": k, "has_answers": True},
       ttl=int(time.time()) + 86400)   # optional: row auto-expires in 24 h

# even hotter: check 50 rows in ONE call (crawler dedupe; sk = test_id)
found, missing = db.get_many("crawled_tests", [(shard_of(t), t) for t in batch])
todo = [m["sk"] for m in missing]   # test ids not yet crawled

# counters: zero reads, race-free
views = db.increment("pages", "PAGE#7", "views")

# bulk: 50 rows per call, one HTTP round-trip (no client pacing needed)
db.batch_put("crawled_tests", [(shard_of(t), t, row) for t, row in batch])

# occasional full enumeration
all_rows = scan_all(db, "crawled_tests")
```

## Rules of the road

- **Never trust status alone on writes** — the response echoes the stored row;
  assert `result["data"] == payload` when the write matters (the platform now
  also rejects wrong shapes with 400, so a silent drop is impossible).
- `429` answers name their budget and carry `retry_after` — the client above
  sleeps and retries writes automatically.
- A batch of N rows consumes `sum(max(1, ceil(bytes/1024)))` write-units —
  rows ≤ 1 KB cost 1 unit each against the app's 800 write-units/min in NORMAL.
  Keep batch TOTAL bytes ≤ 400 KB; smaller rows are more cost-friendly.
- Rows cap at 400 KB; `query` limit ≤ 100; batch ≤ 50 items.
