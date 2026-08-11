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

    def put(self, table, pk, sk, payload, overwrite=False, request_id=None):
        """Envelope shape — canonical; stores payload FLAT under data."""
        return self._call("/v1/item/put", {"table": table, "item": {"pk": pk, "sk": sk, "data": payload},
                                           "overwrite": overwrite, **({"request_id": request_id} if request_id else {})})

    def batch_put(self, table, items, overwrite=False, request_id=None):
        """items: list of (pk, sk, payload) triples — up to 50, one round-trip."""
        body = {"table": table, "items": [{"pk": p, "sk": s, "data": d} for p, s, d in items],
                "overwrite": overwrite, **({"request_id": request_id} if request_id else {})}
        return self._call("/v1/batch/put", body)

    def get(self, table, pk, sk="~", strong=False):
        return self._call("/v1/item/get", {"table": table, "pk": pk, "sk": sk, "strong": strong})

    def query(self, table, pk, sk_prefix=None, limit=100, start_key=None):
        body = {"table": table, "pk": pk, "limit": limit}
        if sk_prefix is not None: body["sk_prefix"] = sk_prefix
        if start_key is not None: body["start_key"] = start_key
        return self._call("/v1/query", body)

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
db.put("crawled_tests", shard_of(test_id), test_id, {"s3_key": k, "has_answers": True})

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
- A batch of N consumes N of the app's 120 writes/min — batch size × rate
  must fit the budget.
- Rows cap at 20 KB; `query` limit ≤ 100; batch ≤ 50 items.
