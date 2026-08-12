/**
 * api.test.ts — full-stack integration via app.fetch() against MockStorage
 * (singleton, reset per test). Covers SPEC §9 mandatory tests #1–6.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/registry";
import { getMockSingleton, resetMockStorage } from "../src/storage-mock";
import { resetRateCounters } from "../src/rate";
import handler from "../src/index";

const SECRET = "test-secret-0123456789abcdef";

function env(): Env {
  return {
    STORAGE: "mock",
    DASHBOARD_ORIGIN: "http://localhost:8787",
    GITHUB_ALLOWED_USERS: "rakxdev,newylbot,luminoxpp",
    SESSION_SECRET: SECRET,
  } as Env;
}

interface Creds {
  app_id: string;
  api_key: string;
}

async function seedApp(name: string, tables: string[]): Promise<Creds> {
  const s = getMockSingleton();
  const { app, api_key } = await createApp(s, SECRET, name);
  for (const t of tables) {
    await s.ensureTable(`app_${app.app_id}_${t}`);
    await s.addTableToApp(app.app_id, t);
  }
  return { app_id: app.app_id, api_key };
}

async function post(path: string, creds: Creds | null, body: unknown, headers: Record<string, string> = {}) {
  return req("POST", path, creds, body, headers);
}

async function get(path: string, creds: Creds | null, headers: Record<string, string> = {}) {
  return req("GET", path, creds, undefined, headers);
}

async function req(method: string, path: string, creds: Creds | null, body: unknown, headers: Record<string, string>) {
  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (creds) {
    h["X-App-Id"] = creds.app_id;
    h["X-Api-Key"] = creds.api_key;
  }
  const res = await handler.fetch(
    new Request(`http://localhost${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    env(),
    {} as ExecutionContext,
  );
  return { status: res.status, json: (await res.json()) as any, headers: res.headers };
}

let A: Creds;
let B: Creds;

beforeEach(async () => {
  resetMockStorage();
  resetRateCounters();
  A = await seedApp("botA", ["users"]);
  B = await seedApp("botB", ["orders"]);
});

describe("auth & isolation", () => {
  it("health is public", async () => {
    const r = await get("/v1/health", null);
    expect(r.status).toBe(200);
  });

  it("non-JSON body → 415", async () => {
    const res = await handler.fetch(
      new Request("http://localhost/v1/query", {
        method: "POST",
        headers: { "X-App-Id": A.app_id, "X-Api-Key": A.api_key },
        body: "plain text, not json",
      }),
      env(),
      {} as ExecutionContext,
    );
    expect(res.status).toBe(415);
  });

  it("security headers present on every response", async () => {
    // https request → full header set incl. HSTS
    const res = await handler.fetch(new Request("https://localhost/v1/health"), env(), {} as ExecutionContext);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("strict-transport-security")).toBe("max-age=15552000");
    // http request → same headers except HSTS (correct behavior)
    const httpRes = await handler.fetch(new Request("http://localhost/v1/health"), env(), {} as ExecutionContext);
    expect(httpRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(httpRes.headers.get("strict-transport-security")).toBeNull();
  });

  it("CORS preflight allows every console method incl. DELETE (regression: console delete was blocked)", async () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      const res = await handler.fetch(
        new Request("https://localhost/v1/admin/apps/app_x", {
          method: "OPTIONS",
          headers: {
            Origin: "https://rodexdb.pages.dev",
            "Access-Control-Request-Method": method,
          },
        }),
        env(),
        {} as ExecutionContext,
      );
      const allow = res.headers.get("access-control-allow-methods") ?? "";
      expect(allow).toContain(method);
      expect(allow).toContain("OPTIONS");
      expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:8787"); // env DASHBOARD_ORIGIN
    }
  });

  it("admin routes reject foreign Origin (CSRF depth)", async () => {
    const evil = await handler.fetch(
      new Request("http://localhost/v1/admin/me", { headers: { Origin: "https://evil.example.com" } }),
      env(),
      {} as ExecutionContext,
    );
    expect(evil.status).toBe(403);
    const good = await handler.fetch(
      new Request("http://localhost/v1/admin/me", { headers: { Origin: "http://localhost:8787" } }),
      env(),
      {} as ExecutionContext,
    );
    expect(good.status).toBe(200); // origin matches DASHBOARD_ORIGIN in test env
    const noOrigin = await handler.fetch(new Request("http://localhost/v1/admin/me"), env(), {} as ExecutionContext);
    expect(noOrigin.status).toBe(200); // curl/CLI: no Origin header → allowed
  });

  it("missing/wrong key → 401", async () => {
    const r1 = await post("/v1/query", null, {});
    expect(r1.status).toBe(401);
    const r2 = await post("/v1/query", { app_id: A.app_id, api_key: "wrong-key" }, {});
    expect(r2.status).toBe(401);
  });

  it("App B cannot touch App A's table → 403 (mandatory test #1)", async () => {
    const r = await post("/v1/query", B, { table: "users", pk: "U#1" });
    expect(r.status).toBe(403);
    expect(r.json.ok).toBe(false);
  });

  it("unregistered table → 403 (no existence leak)", async () => {
    const r = await post("/v1/query", A, { table: "ghost", pk: "U#1" });
    expect(r.status).toBe(403);
  });
});

describe("items CRUD", () => {
  it("put → get → update → delete full lifecycle", async () => {
    const put = await post("/v1/item/put", A, { table: "users", item: { pk: "U#1", sk: "PROFILE", name: "Rakesh" } });
    expect(put.status).toBe(200);
    expect(put.json.result.version).toBe(1);

    const get = await post("/v1/item/get", A, { table: "users", pk: "U#1", sk: "PROFILE" });
    expect(get.json.result.data).toEqual({ name: "Rakesh" });

    const upd = await post("/v1/item/update", A, { table: "users", pk: "U#1", sk: "PROFILE", data: { name: "R" }, expected_version: 1 });
    expect(upd.json.result.version).toBe(2);

    const del = await post("/v1/item/delete", A, { table: "users", pk: "U#1", sk: "PROFILE", expected_version: 2 });
    expect(del.json.result.deleted).toBe(true);

    const gone = await post("/v1/item/get", A, { table: "users", pk: "U#1", sk: "PROFILE" });
    expect(gone.status).toBe(404);
  });

  it("envelope put (item.data) stores flat — canonical shape everywhere", async () => {
    const put = await post("/v1/item/put", A, { table: "users", item: { pk: "ENV#1", sk: "S", data: { name: "Env", ok: true } } });
    expect(put.status).toBe(200);
    // the echo shows the FLAT payload — the verification contract
    expect(put.json.result.data).toEqual({ name: "Env", ok: true });

    const get = await post("/v1/item/get", A, { table: "users", pk: "ENV#1", sk: "S" });
    expect(get.json.result.data).toEqual({ name: "Env", ok: true });
  });

  it("top-level data on put → 400 (silent-drop trap is dead)", async () => {
    const res = await post("/v1/item/put", A, { table: "users", item: { pk: "TRAP#1", sk: "S" }, data: { name: "x" } });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toContain("Unknown field(s): data");
    // nothing was stored
    const get = await post("/v1/item/get", A, { table: "users", pk: "TRAP#1", sk: "S" });
    expect(get.status).toBe(404);
  });

  it("envelope mixed with flat fields → 400", async () => {
    const res = await post("/v1/item/put", A, { table: "users", item: { pk: "MIX#1", sk: "S", data: { a: 1 }, extra: 2 } });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toContain("cannot be mixed");
  });

  it("unknown top-level keys on every item endpoint → 400", async () => {
    const cases = [
      ["/v1/item/get", { table: "users", pk: "x", bogus: 1 }],
      ["/v1/item/update", { table: "users", pk: "x", sk: "s", data: {}, bogus: 1 }],
      ["/v1/item/delete", { table: "users", pk: "x", sk: "s", bogus: 1 }],
      ["/v1/query", { table: "users", pk: "x", bogus: 1 }],
    ] as const;
    for (const [path, body] of cases) {
      const res = await post(path, A, body as unknown);
      expect(res.status).toBe(400);
      expect(res.json.error.message).toContain("Unknown field(s)");
    }
  });

  it("stale version update → 409 (mandatory test #3)", async () => {
    await post("/v1/item/put", A, { table: "users", item: { pk: "U#2", sk: "S", x: 1 } });
    const bad = await post("/v1/item/update", A, { table: "users", pk: "U#2", sk: "S", data: { x: 2 }, expected_version: 99 });
    expect(bad.status).toBe(409);
  });

  it("duplicate put → 409; overwrite works", async () => {
    await post("/v1/item/put", A, { table: "users", item: { pk: "U#3", sk: "S" } });
    const dup = await post("/v1/item/put", A, { table: "users", item: { pk: "U#3", sk: "S" } });
    expect(dup.status).toBe(409);
    const ow = await post("/v1/item/put", A, { table: "users", item: { pk: "U#3", sk: "S", fresh: true }, overwrite: true });
    expect(ow.json.result.data.fresh).toBe(true);
  });

  it("payload > 400 KB → 413; near-cap payload accepted (mandatory test #4)", async () => {
    const over = { pk: "U#big", sk: "S", blob: "x".repeat(401 * 1024) };
    const r = await post("/v1/item/put", A, { table: "users", item: over });
    expect(r.status).toBe(413);
    const near = { pk: "U#big2", sk: "S", blob: "x".repeat(390 * 1024) };
    const ok = await post("/v1/item/put", A, { table: "users", item: near });
    expect(ok.status).toBe(200);
    // the ENTIRE payload returns in one read (reads are never size-gated)
    const get = await post("/v1/item/get", A, { table: "users", pk: "U#big2", sk: "S" });
    expect((get.json.result.data as { blob: string }).blob.length).toBe(390 * 1024);
  });

  it("query with prefix + limit + pagination flag", async () => {
    for (let i = 0; i < 5; i++) {
      await post("/v1/item/put", A, { table: "users", item: { pk: "U#q", sk: `MSG#${i}`, i } });
    }
    const q = await post("/v1/query", A, { table: "users", pk: "U#q", sk_prefix: "MSG#", limit: 2 });
    expect(q.json.result.items.length).toBe(2);
    expect(q.json.result.has_more).toBe(true);
    expect(q.json.result.items[0].sk).toBe("MSG#0");
  });

  it("sk defaults to sentinel when omitted", async () => {
    await post("/v1/item/put", A, { table: "users", item: { pk: "SETTING", value: 1 } });
    const got = await post("/v1/item/get", A, { table: "users", pk: "SETTING", sk: "~" });
    expect(got.status).toBe(200);
    expect(got.json.result.data.value).toBe(1);
  });
});

describe("idempotency (mandatory test #2)", () => {
  it("replay returns identical response and does not duplicate", async () => {
    const body = { table: "users", item: { pk: "U#idem", sk: "S", n: 1 }, request_id: "req-001" };
    const r1 = await post("/v1/item/put", A, body);
    const r2 = await post("/v1/item/put", A, body);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.headers.get("x-idempotent-replay")).toBe("true");
    expect(JSON.stringify(r1.json)).toBe(JSON.stringify(r2.json));

    const q = await post("/v1/query", A, { table: "users", pk: "U#idem", limit: 100 });
    expect(q.json.result.items.length).toBe(1); // no duplicate row
  });
});

describe("batch put", () => {
  it("writes multiple items in one call with per-item results (flat data)", async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ pk: `B#${i}`, sk: "s", data: { i } }));
    const res = await post("/v1/batch/put", A, { table: "users", items });
    expect(res.status).toBe(200);
    expect(res.json.result.written).toBe(3);
    expect(res.json.result.items.every((it: { ok: boolean }) => it.ok)).toBe(true);
    expect(res.json.result.items[0].item.data).toEqual({ i: 0 }); // stored FLAT
    const q = await post("/v1/query", A, { table: "users", pk: "B#0", limit: 10 });
    expect(q.json.result.items.length).toBe(1);
    expect(q.json.result.items[0].data).toEqual({ i: 0 });
  });

  it("flat items also work inside a batch (backward compatible)", async () => {
    const res = await post("/v1/batch/put", A, { table: "users", items: [{ pk: "BF#1", sk: "s", name: "Flat" }] });
    expect(res.json.result.written).toBe(1);
    const get = await post("/v1/item/get", A, { table: "users", pk: "BF#1", sk: "s" });
    expect(get.json.result.data).toEqual({ name: "Flat" });
  });

  it("> 50 items → 400, nothing written", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ pk: `Z#${i}`, sk: "s", data: {} }));
    const res = await post("/v1/batch/put", A, { table: "users", items });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toContain("max 50");
    const q = await post("/v1/query", A, { table: "users", pk: "Z#", limit: 100 });
    expect(q.json.result.items.length).toBe(0);
  });

  it("one invalid item rejects the WHOLE batch (nothing written)", async () => {
    const res = await post("/v1/batch/put", A, {
      table: "users",
      items: [{ pk: "OK#1", sk: "s", data: { a: 1 } }, { sk: "no-pk" }],
    });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toContain("items[1]");
    const q = await post("/v1/query", A, { table: "users", pk: "OK#", limit: 10 });
    expect(q.json.result.items.length).toBe(0);
  });

  it("oversized item in a batch keeps 413 semantics", async () => {
    const big = "x".repeat(401 * 1024);
    const res = await post("/v1/batch/put", A, { table: "users", items: [{ pk: "BIG#1", sk: "s", data: { blob: big } }] });
    expect(res.status).toBe(413);
  });

  it("batch with request_id replays identically", async () => {
    const body = { table: "users", items: [{ pk: "ID#1", sk: "s", data: { v: 1 } }], request_id: "batch-req-0001" };
    const a = await post("/v1/batch/put", A, body);
    const b = await post("/v1/batch/put", A, body);
    expect(a.json).toEqual(b.json);
    expect(b.headers.get("x-idempotent-replay")).toBe("true");
  });

  it("batch units add up: 20 × (5 × 20-unit rows) = 2000 → 21st batch → 429", async () => {
    const row20 = "x".repeat(19 * 1024); // ~19 KB → 20 units
    const batch = { table: "users", items: Array.from({ length: 5 }, (_, i) => ({ pk: `W#${i}`, sk: "s", data: { blob: row20 } })) };
    for (let i = 0; i < 20; i++) {
      expect((await post("/v1/batch/put", A, batch)).status).toBe(200);
    }
    expect((await post("/v1/batch/put", A, batch)).status).toBe(429);
  });
});


describe("batch get", () => {
  it("fetches multiple keys in one call; missing keys listed, not errors", async () => {
    await post("/v1/batch/put", A, { table: "users", items: [
      { pk: "G#1", sk: "s", data: { n: 1 } },
      { pk: "G#2", sk: "s", data: { n: 2 } },
      { pk: "G#3", data: { n: 3 } }, // sk defaults to ~
    ] });
    const res = await post("/v1/batch/get", A, { table: "users", keys: [
      { pk: "G#1", sk: "s" }, { pk: "G#2", sk: "s" }, { pk: "G#4", sk: "s" },
    ] });
    expect(res.status).toBe(200);
    expect(res.json.result.found.length).toBe(2);
    expect(res.json.result.found[0].data).toEqual({ n: 1 });
    expect(res.json.result.missing).toEqual([{ pk: "G#4", sk: "s" }]);
    // sk defaults to ~ in keys too
    const skDef = await post("/v1/batch/get", A, { table: "users", keys: [{ pk: "G#3" }] });
    expect(skDef.json.result.found.length).toBe(1);
  });

  it("> 50 keys → 400; bad key → 400 (nothing returned)", async () => {
    const big = Array.from({ length: 51 }, (_, i) => ({ pk: `Z#${i}` }));
    expect((await post("/v1/batch/get", A, { table: "users", keys: big })).status).toBe(400);
    const bad = await post("/v1/batch/get", A, { table: "users", keys: [{ pk: "G#1", sk: "s" }, { sk: "nopk" }] });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).toContain("keys[1]");
  });

  it("N keys consume N reads: 800 × 50 keys = 40 000 → 801st → 429", async () => {
    const keys50 = Array.from({ length: 50 }, (_, i) => ({ pk: `R#${i}` }));
    for (let i = 0; i < 800; i++) {
      expect((await post("/v1/batch/get", A, { table: "users", keys: keys50 })).status).toBe(200);
    }
    expect((await post("/v1/batch/get", A, { table: "users", keys: keys50 })).status).toBe(429);
  }, 30_000);
});

describe("increment", () => {
  it("creates the counter row and adds atomically", async () => {
    const a = await post("/v1/item/increment", A, { table: "users", pk: "CNT#1", sk: "views" });
    expect(a.status).toBe(200);
    expect(a.json.result.counter).toBe(1);
    expect(a.json.result.incremented_by).toBe(1);
    expect(a.json.result.data).toEqual({});

    const b = await post("/v1/item/increment", A, { table: "users", pk: "CNT#1", sk: "views", by: 5 });
    expect(b.json.result.counter).toBe(6);
    expect(b.json.result.version).toBe(2);
  });

  it("decrements with negative by; sk defaults to ~", async () => {
    await post("/v1/item/increment", A, { table: "users", pk: "CNT#2", by: 10 });
    const d = await post("/v1/item/increment", A, { table: "users", pk: "CNT#2", by: -3 });
    expect(d.json.result.counter).toBe(7);
    const get = await post("/v1/item/get", A, { table: "users", pk: "CNT#2", sk: "~" });
    expect(get.json.result.counter).toBe(7);
    expect(get.json.result.data).toEqual({});
  });

  it("validation: bad by → 400, missing table → 400", async () => {
    expect((await post("/v1/item/increment", A, { table: "users", pk: "X", by: 1.5 })).status).toBe(400);
    expect((await post("/v1/item/increment", A, { table: "users", pk: "X", bogus: 1 })).status).toBe(400);
  });

  it("increment counts against the write budget (1 unit each; 2000 then 429)", async () => {
    for (let i = 0; i < 2_000; i++) {
      expect((await post("/v1/item/increment", A, { table: "users", pk: `W#${i}` })).status).toBe(200);
    }
    expect((await post("/v1/item/increment", A, { table: "users", pk: "W#2000" })).status).toBe(429);
  }, 30_000);
});

describe("bulk-load hardening (WCU-honest writes)", () => {
  it("all_ok=false surfaces per-item failures — a 200 is never a silent success", async () => {
    await post("/v1/item/put", A, { table: "users", item: { pk: "DUP#1", sk: "s", data: { v: 1 } } });
    const res = await post("/v1/batch/put", A, { table: "users", items: [
      { pk: "DUP#2", sk: "s", data: { v: 2 } }, // fresh → ok
      { pk: "DUP#1", sk: "s", data: { v: 9 } }, // exists, no overwrite → per-item 409
    ] });
    expect(res.status).toBe(200);
    expect(res.json.result.all_ok).toBe(false);
    expect(res.json.result.written).toBe(1);
    const bad = res.json.result.items.find((i: { pk: string }) => i.pk === "DUP#1");
    expect(bad.ok).toBe(false);
    expect(String(bad.error)).toContain("Item already exists"); // 409 semantics
    // the good row IS written
    const g = await post("/v1/item/get", A, { table: "users", pk: "DUP#2", sk: "s" });
    expect(g.json.result.data).toEqual({ v: 2 });
  });

  it("all_ok=true on full success; batch responses carry all_ok", async () => {
    const res = await post("/v1/batch/put", A, { table: "users", items: [
      { pk: "OK#10", sk: "s", data: { x: 1 } }, { pk: "OK#11", sk: "s", data: { x: 2 } },
    ] });
    expect(res.json.result.all_ok).toBe(true);
    expect(res.json.result.written).toBe(2);
  });

  it("batch byte cap: total > 400 KB → 413, nothing written (no WCU bursts)", async () => {
    const big = "x".repeat(300 * 1024); // ~300 KB per row
    const res = await post("/v1/batch/put", A, { table: "users", items: [
      { pk: "BC#1", sk: "s", data: { blob: big } },
      { pk: "BC#2", sk: "s", data: { blob: big } },
    ] });
    expect(res.status).toBe(413);
    expect(res.json.error.message).toContain("bytes");
    const q = await post("/v1/query", A, { table: "users", pk: "BC#", limit: 100 });
    expect(q.json.result.items.length).toBe(0);
    // one max-size row fits (≤ 400 KB per row AND per call)
    const single = await post("/v1/batch/put", A, { table: "users", items: [{ pk: "BC#3", sk: "s", data: { blob: big } }] });
    expect(single.status).toBe(200);
  });

  it("every item response echoes its stored bytes (the WCU math is visible)", async () => {
    const put = await post("/v1/item/put", A, { table: "users", item: { pk: "BY#1", sk: "s", data: { a: 1 } } });
    expect(typeof put.json.result.bytes).toBe("number");
    expect(put.json.result.bytes).toBeGreaterThan(0);
    const get = await post("/v1/item/get", A, { table: "users", pk: "BY#1", sk: "s" });
    expect(get.json.result.bytes).toBe(put.json.result.bytes);
    const b = await post("/v1/batch/put", A, { table: "users", items: [{ pk: "BY#2", sk: "s", data: { b: 2 } }] });
    expect(b.json.result.items[0].item.bytes).toBeGreaterThan(0);
  });

  it("write budget is WCU-honest: 20-unit rows hit the 2 000-unit ceiling", async () => {
    const row20 = "y".repeat(19 * 1024); // ~19 KB → 20 units
    for (let i = 0; i < 100; i++) {
      const r = await post("/v1/item/put", A, { table: "users", item: { pk: `U#${i}`, sk: "s", data: { blob: row20 } } });
      expect(r.status).toBe(200);
    }
    expect((await post("/v1/item/put", A, { table: "users", item: { pk: "U#100", sk: "s", data: { blob: row20 } } })).status).toBe(429);
  }, 30_000);
});

describe("row ttl", () => {
  it("future ttl → row readable, ttl echoed", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const put = await post("/v1/item/put", A, { table: "users", item: { pk: "T#1", sk: "s", data: { x: 1 }, ttl: future } });
    expect(put.json.result.ttl).toBe(future);
    const get = await post("/v1/item/get", A, { table: "users", pk: "T#1", sk: "s" });
    expect(get.json.result.ttl).toBe(future);
    expect(get.json.result.data).toEqual({ x: 1 });
  });

  it("past ttl → 404 on get, excluded from query and batch/get", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    await post("/v1/item/put", A, { table: "users", item: { pk: "T#2", sk: "s", data: { x: 2 }, ttl: past } });
    expect((await post("/v1/item/get", A, { table: "users", pk: "T#2", sk: "s" })).status).toBe(404);

    await post("/v1/item/put", A, { table: "users", item: { pk: "T#3", sk: "s", data: { x: 3 }, ttl: past } });
    const q = await post("/v1/query", A, { table: "users", pk: "T#", limit: 100 });
    expect(q.json.result.items.length).toBe(0);

    const bg = await post("/v1/batch/get", A, { table: "users", keys: [{ pk: "T#3", sk: "s" }] });
    expect(bg.json.result.found.length).toBe(0);
    expect(bg.json.result.missing).toEqual([{ pk: "T#3", sk: "s" }]);
  });

  it("ttl works in flat form and in batch items; invalid ttl → 400", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const flat = await post("/v1/item/put", A, { table: "users", item: { pk: "T#4", sk: "s", ttl: future, name: "flat" } });
    expect(flat.json.result.ttl).toBe(future);
    expect(flat.json.result.data).toEqual({ name: "flat" });

    const b = await post("/v1/batch/put", A, { table: "users", items: [{ pk: "T#5", sk: "s", data: { x: 5 }, ttl: future }] });
    expect(b.json.result.items[0].item.ttl).toBe(future);

    expect((await post("/v1/item/put", A, { table: "users", item: { pk: "T#6", ttl: "not-a-number" } })).status).toBe(400);
    expect((await post("/v1/item/put", A, { table: "users", item: { pk: "T#6", ttl: -5 } })).status).toBe(400);
  });
});

describe("table create (mandatory test #6 extension)", () => {
  it("creates with prefix, lists, and dedupes", async () => {
    const c = await post("/v1/table/create", A, { name: "sessions" });
    expect(c.status).toBe(200);
    const list = await get("/v1/tables", A);
    expect(list.status).toBe(200);
    expect(list.json.result.tables.map((t: any) => t.name)).toContain("sessions");

    const dup = await post("/v1/table/create", A, { name: "sessions" });
    expect(dup.status).toBe(409);
  });

  it("invalid name → 400", async () => {
    const r = await post("/v1/table/create", A, { name: "Bad Name!" });
    expect(r.status).toBe(400);
  });
});