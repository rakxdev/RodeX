/**
 * SDK tests — run against a local stub gateway (no network, CI-safe).
 * The stub records the exact requests the SDK sends and serves contract
 * responses, so these tests prove: auth headers, body shapes, error
 * mapping, 404→null, and the full CRUD surface.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { RodexDB, RodexError } from "../src/index.js";

let server: Server;
let base = "";
const seen: Array<{ method: string; path: string; headers: Record<string, string | undefined>; body: unknown }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({
        method: req.method ?? "",
        path: req.url ?? "",
        headers: {
          "content-type": req.headers["content-type"],
          "x-app-id": req.headers["x-app-id"],
          "x-api-key": req.headers["x-api-key"],
        },
        body: raw ? JSON.parse(raw) : null,
      });
      if (req.url === "/v1/item/get" && JSON.parse(raw).pk === "missing") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: { code: 404, message: "Item not found" } }));
        return;
      }
      if (req.url === "/v1/item/put" && (JSON.parse(raw).item as { pk: string }).pk === "conflict") {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: { code: 409, message: "Condition not met" } }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { echoed: true, path: req.url, body: raw ? JSON.parse(raw) : null } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const db = () =>
  new RodexDB({
    url: base,
    appId: "app_test123",
    apiKey: "rok_testkey0000000000000000000000000000000000000",
  });

describe("auth & transport", () => {
  it("sends X-App-Id / X-Api-Key and JSON on every request", async () => {
    seen.length = 0;
    await db().listTables();
    const call = seen[0];
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/v1/tables");
    expect(call.headers["x-app-id"]).toBe("app_test123");
    expect(call.headers["x-api-key"]).toBe("rok_testkey0000000000000000000000000000000000000");
  });

  it("joins the base URL without trailing-slash issues", async () => {
    seen.length = 0;
    const dbSlash = new RodexDB({ url: `${base}/`, appId: "a", apiKey: "k" });
    await dbSlash.listTables();
    expect(seen[0].path).toBe("/v1/tables");
  });
});

describe("items", () => {
  it("put sends { table, item, request_id?, overwrite? }", async () => {
    seen.length = 0;
    await db().put("users", { pk: "u1", name: "Ada" }, { requestId: "req-123", overwrite: true });
    const body = seen[0].body as { table: string; item: { pk: string }; request_id: string; overwrite: boolean };
    expect(body.table).toBe("users");
    expect(body.item).toEqual({ pk: "u1", name: "Ada" });
    expect(body.request_id).toBe("req-123");
    expect(body.overwrite).toBe(true);
  });

  it("get returns null on 404, data on 200", async () => {
    seen.length = 0;
    const missing = await db().get("users", "missing");
    expect(missing).toBeNull();
    const found = await db().get("users", "u1", "~");
    expect(found).not.toBeNull();
    expect((seen[1].body as { sk: string }).sk).toBe("~");
  });

  it("maps errors to RodexError with status + code", async () => {
    await expect(db().put("users", { pk: "conflict" })).rejects.toMatchObject({
      name: "RodexError",
      status: 409,
      code: 409,
    });
  });

  it("update / delete / query send their contract bodies", async () => {
    seen.length = 0;
    await db().update("users", "u1", "~", { name: "Grace" }, 2, "req-9");
    await db().delete("users", "u1", "~", 2);
    await db().query("users", "u1", { skPrefix: "m", limit: 5, startKey: "tok" });
    expect(seen[0].body).toMatchObject({ table: "users", pk: "u1", sk: "~", expected_version: 2, request_id: "req-9" });
    expect(seen[1].body).toMatchObject({ table: "users", pk: "u1", sk: "~", expected_version: 2 });
    expect(seen[2].body).toMatchObject({ table: "users", pk: "u1", sk_prefix: "m", limit: 5, start_key: "tok" });
  });
});

describe("tables", () => {
  it("createTable / deleteTable send the name", async () => {
    seen.length = 0;
    await db().createTable("logs", "req-t");
    await db().deleteTable("logs");
    expect((seen[0].body as { name: string; request_id: string }).name).toBe("logs");
    expect((seen[0].body as { request_id: string }).request_id).toBe("req-t");
    expect((seen[1].body as { name: string }).name).toBe("logs");
  });
});

describe("config validation", () => {
  it("throws on missing appId/apiKey", () => {
    expect(() => new RodexDB({ url: base, appId: "", apiKey: "k" })).toThrow(RodexError);
  });
});
