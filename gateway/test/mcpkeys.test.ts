/**
 * mcpkeys.test.ts — MCP master keys: storage contract + admin CRUD
 * (create once / list metadata / view ANYTIME / delete, no rotation),
 * plus POST /v1/table/delete (the gateway surface MCP needs for full access).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { resetMockStorage } from "../src/storage-mock";
import { resetRateCounters } from "../src/rate";
import { generateApiKey, hashKey, encryptKey } from "../src/auth";
import handler from "../src/index";

const SECRET = "test-secret-0123456789abcdef";
const ADMIN_PW = "super-secret-password";

function env(): Env {
  return {
    STORAGE: "mock",
    DASHBOARD_ORIGIN: "https://rodexdb.pages.dev",
    GITHUB_ALLOWED_USERS: "rakxdev",
    SESSION_SECRET: SECRET,
    ADMIN_PASSWORD: ADMIN_PW,
  } as Env;
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await handler.fetch(
    new Request(`https://gw.example.com${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    env(),
    {} as ExecutionContext,
  );
  return res;
}

function cookieOf(res: Response): string {
  const c = res.headers.get("set-cookie");
  return c ? c.split(";")[0] : "";
}

let adminCookie = "";

beforeEach(async () => {
  resetMockStorage();
  resetRateCounters();
  const login = await call("POST", "/v1/admin/login", { password: ADMIN_PW });
  adminCookie = cookieOf(login);
});

afterEach(() => {
  resetMockStorage();
  resetRateCounters();
});

// ── storage contract (mock) ─────────────────────────────────────────────────

describe("MCP key storage contract", () => {
  it("create → get → findByHash → list → delete round-trip", async () => {
    const { createStorage } = await import("../src/storage");
    const storage = createStorage(env());
    const raw = generateApiKey("rok_mcp_");
    expect(raw.startsWith("rok_mcp_")).toBe(true);
    const row = {
      keyId: "mcpk_abc",
      name: "claude",
      description: "main agent",
      keyHash: await hashKey(SECRET, raw),
      keyCipher: (await encryptKey(SECRET, raw)) ?? undefined,
      createdAt: 1234,
    };
    await storage.mcpKeyCreate(row);
    const got = await storage.mcpKeyGet("mcpk_abc");
    expect(got?.name).toBe("claude");
    expect(got?.keyHash).not.toContain(raw); // hash-only at rest
    expect((await storage.mcpKeyFindByHash(row.keyHash))?.keyId).toBe("mcpk_abc");
    expect((await storage.mcpKeyFindByHash("nope"))).toBeNull();
    expect((await storage.mcpKeyList()).length).toBe(1);
    await storage.mcpKeyDelete("mcpk_abc");
    expect(await storage.mcpKeyGet("mcpk_abc")).toBeNull();
    await expect(storage.mcpKeyDelete("mcpk_abc")).rejects.toMatchObject({ status: 404 });
  });

  it("create rejects duplicate keyId (409)", async () => {
    const { createStorage } = await import("../src/storage");
    const storage = createStorage(env());
    const row = { keyId: "mcpk_x", name: "dup", keyHash: "h", createdAt: 1 };
    await storage.mcpKeyCreate(row);
    await expect(storage.mcpKeyCreate(row)).rejects.toMatchObject({ status: 409 });
  });
});

// ── admin API ────────────────────────────────────────────────────────────────

describe("POST /v1/admin/mcp/keys", () => {
  it("requires an admin session", async () => {
    const res = await call("POST", "/v1/admin/mcp/keys", { name: "x" });
    expect(res.status).toBe(401);
  });

  it("creates a rok_mcp_ key returned exactly once; stores hash only", async () => {
    const res = await call("POST", "/v1/admin/mcp/keys", { name: "claude", description: "main coding agent" }, { Cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { key_id: string; key: string; name: string; description?: string; created_at: number } };
    const result = body.result;
    expect(result.key_id).toMatch(/^mcpk_[0-9a-f]{32}$/);
    expect(result.key).toMatch(/^rok_mcp_[A-Za-z0-9_-]{43}$/);
    expect(result.name).toBe("claude");
    expect(result.description).toBe("main coding agent");
    expect(result.created_at).toBeGreaterThan(0);
    // no hash/cipher leaks in the response
    expect(JSON.stringify(body)).not.toContain("keyHash");
    expect(JSON.stringify(body)).not.toContain("keyCipher");
  });

  it("name is required and validated (length, control chars)", async () => {
    expect((await call("POST", "/v1/admin/mcp/keys", {}, { Cookie: adminCookie })).status).toBe(400);
    expect((await call("POST", "/v1/admin/mcp/keys", { name: "" }, { Cookie: adminCookie })).status).toBe(400);
    expect((await call("POST", "/v1/admin/mcp/keys", { name: "a".repeat(41) }, { Cookie: adminCookie })).status).toBe(400);
    expect((await call("POST", "/v1/admin/mcp/keys", { name: "bad\u0000name" }, { Cookie: adminCookie })).status).toBe(400);
    expect((await call("POST", "/v1/admin/mcp/keys", { name: "ok", description: "x".repeat(201) }, { Cookie: adminCookie })).status).toBe(400);
  });

  it("description is optional", async () => {
    const res = await call("POST", "/v1/admin/mcp/keys", { name: "bare" }, { Cookie: adminCookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: { description?: string } }).result.description).toBeUndefined();
  });
});

describe("GET /v1/admin/mcp/keys", () => {
  it("lists metadata only (never hashes or raw keys)", async () => {
    await call("POST", "/v1/admin/mcp/keys", { name: "one" }, { Cookie: adminCookie });
    await call("POST", "/v1/admin/mcp/keys", { name: "two", description: "d" }, { Cookie: adminCookie });
    const res = await call("GET", "/v1/admin/mcp/keys", undefined, { Cookie: adminCookie });
    expect(res.status).toBe(200);
    const keys = ((await res.json()) as { result: { keys: Array<{ name: string }> } }).result.keys;
    expect(keys.length).toBe(2);
    const json = JSON.stringify(keys);
    expect(json).not.toContain("keyHash");
    expect(json).not.toContain("keyCipher");
    expect(json).not.toContain("rok_mcp_"); // raw key never in the list
    expect(keys.map((k: { name: string }) => k.name).sort()).toEqual(["one", "two"]);
  });

  it("requires a session", async () => {
    expect((await call("GET", "/v1/admin/mcp/keys")).status).toBe(401);
  });
});

describe("POST /v1/admin/mcp/keys/:id/view", () => {
  it("re-views the raw key ANYTIME (no recovery window)", async () => {
    const created = ((await (await call("POST", "/v1/admin/mcp/keys", { name: "v" }, { Cookie: adminCookie })).json()) as { result: { key_id: string; key: string } }).result;
    const res = await call("POST", `/v1/admin/mcp/keys/${created.key_id}/view`, {}, { Cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { key: string; key_id: string } };
    expect(body.result.key).toBe(created.key);
    expect(body.result.key_id).toBe(created.key_id);
  });

  it("404 for unknown key; 401 without session", async () => {
    const res = await call("POST", "/v1/admin/mcp/keys/mcpk_doesnotexist/view", {}, { Cookie: adminCookie });
    expect(res.status).toBe(404);
    expect((await call("POST", "/v1/admin/mcp/keys/mcpk_doesnotexist/view", {})).status).toBe(401);
  });
});

describe("DELETE /v1/admin/mcp/keys/:id", () => {
  it("deletes a key (instant revocation), then view/list reflect it", async () => {
    const created = ((await (await call("POST", "/v1/admin/mcp/keys", { name: "bye" }, { Cookie: adminCookie })).json()) as { result: { key_id: string } }).result;
    const del = await call("DELETE", `/v1/admin/mcp/keys/${created.key_id}`, undefined, { Cookie: adminCookie });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { result: { deleted: boolean } }).result.deleted).toBe(true);
    expect((await call("POST", `/v1/admin/mcp/keys/${created.key_id}/view`, {}, { Cookie: adminCookie })).status).toBe(404);
    const list = (await (await call("GET", "/v1/admin/mcp/keys", undefined, { Cookie: adminCookie })).json()) as { result: { keys: unknown[] } };
    expect(list.result.keys.length).toBe(0);
  });

  it("404 for unknown key; 401 without session", async () => {
    expect((await call("DELETE", "/v1/admin/mcp/keys/mcpk_none", undefined, { Cookie: adminCookie })).status).toBe(404);
    expect((await call("DELETE", "/v1/admin/mcp/keys/mcpk_none")).status).toBe(401);
  });
});

describe("no rotation (by design)", () => {
  it("POST /v1/admin/mcp/keys/:id/rotate does not exist", async () => {
    const res = await call("POST", "/v1/admin/mcp/keys/mcpk_x/rotate", {}, { Cookie: adminCookie });
    expect(res.status).toBe(404);
  });
});

// ── table delete (needed for MCP full access) ───────────────────────────────

async function makeApp(name = "tapp"): Promise<{ appId: string; key: string }> {
  const res = await call("POST", "/v1/admin/apps", { name }, { Cookie: adminCookie });
  expect(res.status).toBe(200);
  const r = ((await res.json()) as { result: { app_id: string; api_key: string } }).result;
  return { appId: r.app_id, key: r.api_key };
}

function appHeaders(app: { appId: string; key: string }) {
  return { "X-App-Id": app.appId, "X-Api-Key": app.key };
}

describe("POST /v1/table/delete", () => {
  it("deletes an owned table; list shows it gone; data is gone", async () => {
    const app = await makeApp();
    const created = await call("POST", "/v1/table/create", { name: "users" }, appHeaders(app));
    expect(created.status).toBe(200);
    await call("POST", "/v1/item/put", { table: "users", item: { pk: "u1", data: { x: 1 } } }, appHeaders(app));

    const del = await call("POST", "/v1/table/delete", { name: "users" }, appHeaders(app));
    expect(del.status).toBe(200);
    expect(((await del.json()) as { result: { table: string; status: string } }).result).toMatchObject({ table: "users", status: "deleted" });

    const list = (await (await call("GET", "/v1/tables", undefined, appHeaders(app))).json()) as { result: { tables: unknown[] } };
    expect(list.result.tables).toEqual([]);

    const putAgain = await call("POST", "/v1/item/put", { table: "users", item: { pk: "u1", data: { x: 2 } } }, appHeaders(app));
    expect(putAgain.status).toBe(403); // table gone (unowned) — recreate needed
  });

  it("404 when the table is not owned; 400 on bad names", async () => {
    const app = await makeApp();
    expect((await call("POST", "/v1/table/delete", { name: "nope" }, appHeaders(app))).status).toBe(403); // unowned → no existence leak
    expect((await call("POST", "/v1/table/delete", { name: "Bad Name!" }, appHeaders(app))).status).toBe(400);
    expect((await call("POST", "/v1/table/delete", {}, appHeaders(app))).status).toBe(400);
  });

  it("cross-app isolation: cannot delete another app's table (403)", async () => {
    const appA = await makeApp("appa");
    const appB = await makeApp("appb");
    await call("POST", "/v1/table/create", { name: "shared" }, appHeaders(appA));
    const res = await call("POST", "/v1/table/delete", { name: "shared" }, appHeaders(appB));
    expect(res.status).toBe(403); // app B doesn't own "shared" — no existence leak
  });

  it("rejects unauthenticated calls", async () => {
    const res = await call("POST", "/v1/table/delete", { name: "x" }, { "X-App-Id": "app_zzz", "X-Api-Key": "rok_zzz" });
    expect(res.status).toBe(401); // bad credentials → 401 (platform contract)
  });
});
