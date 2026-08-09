/**
 * api.test.ts — full-stack integration via app.fetch() against MockStorage
 * (singleton, reset per test). Covers SPEC §9 mandatory tests #1–6.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/registry";
import { getMockSingleton, resetMockStorage } from "../src/storage-mock";
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
    const res = await handler.fetch(new Request("http://localhost/v1/health"), env(), {} as ExecutionContext);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("strict-transport-security")).toBe("max-age=15552000");
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

  it("payload > 20 KB → 413 (mandatory test #4)", async () => {
    const big = { pk: "U#big", sk: "S", blob: "x".repeat(20_100) };
    const r = await post("/v1/item/put", A, { table: "users", item: big });
    expect(r.status).toBe(413);
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