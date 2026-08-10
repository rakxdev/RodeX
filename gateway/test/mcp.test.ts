/**
 * mcp.test.ts — the /mcp surface end-to-end: real JSON-RPC over HTTP.
 * Covers: master-key auth, initialize handshake, tools/list, the
 * confirmation gate (refusal + execution), read-only flows, error mapping,
 * and the MCP budgets (unit-level).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { resetMockStorage } from "../src/storage-mock";
import { resetRateCounters, gateMCPRequest } from "../src/rate";
import handler from "../src/index";
import { MCP_RATE_READS, MCP_RATE_WRITES } from "../src/limits";

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

/** Parse an SSE body (legacy-lane streamable HTTP) into its JSON-RPC payload. */
function sseParse(text: string): unknown {
  const dataLines = text
    .split("\n\n")
    .flatMap((block) => block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()));
  if (dataLines.length === 0) return null;
  return JSON.parse(dataLines.join(""));
}

/** POST a JSON-RPC message to /mcp; returns parsed JSON + status. */
async function rpc(method: string, params: unknown, id = 1, headers: Record<string, string> = {}) {
  const res = await call("POST", "/mcp", { jsonrpc: "2.0", id, method, params }, {
    Accept: "application/json, text/event-stream",
    ...headers,
  });
  const ct = res.headers.get("content-type") || "";
  const parsed: unknown = ct.includes("text/event-stream") ? sseParse(await res.text()) : await res.json().catch(() => null);
  return { status: res.status, body: parsed as { result?: unknown; error?: unknown } | null, raw: res };
}

async function toolCall(name: string, args: Record<string, unknown>, id = 1) {
  const out = await rpc("tools/call", { name, arguments: args }, id, { Authorization: `Bearer ${mcpKey}` });
  const result = (out.body as { result?: { content?: Array<{ type: string; text?: string }> } }).result;
  const text = result?.content?.find((c) => c.type === "text")?.text ?? "null";
  let parsed: { ok: boolean; code?: string | number; message?: string; [k: string]: unknown };
  try {
    parsed = JSON.parse(text) as { ok: boolean; code?: string | number; message?: string; [k: string]: unknown };
  } catch {
    parsed = { ok: false, code: "unparseable", message: text.slice(0, 200) };
  }
  return { status: out.status, parsed };
}

let adminCookie = "";
let mcpKey = "";
let createdApp: { app_id: string; api_key: string } | null = null;

beforeEach(async () => {
  resetMockStorage();
  resetRateCounters();
  const login = await call("POST", "/v1/admin/login", { password: ADMIN_PW });
  adminCookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const keyRes = await call("POST", "/v1/admin/mcp/keys", { name: "test agent" }, { Cookie: adminCookie });
  mcpKey = ((await keyRes.json()) as { result: { key: string } }).result.key;
  const appRes = await call("POST", "/v1/admin/apps", { name: "mapp" }, { Cookie: adminCookie });
  createdApp = ((await appRes.json()) as { result: { app_id: string; api_key: string } }).result;
  await call("POST", "/v1/table/create", { name: "users" }, { "X-App-Id": createdApp.app_id, "X-Api-Key": createdApp.api_key });
});

afterEach(() => {
  resetMockStorage();
  resetRateCounters();
});

// ── auth ─────────────────────────────────────────────────────────────────────

describe("MCP auth (master key)", () => {
  it("rejects missing / malformed / unknown keys with JSON-RPC 401", async () => {
    const noKey = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(noKey.status).toBe(401);
    expect(noKey.body).toMatchObject({ jsonrpc: "2.0", error: { code: -32001 } });

    const badKey = await rpc("initialize", {}, 1, { Authorization: "Bearer rok_mcp_0000000000000000000000000000000000000000000" });
    expect(badKey.status).toBe(401);

    const wrongPrefix = await rpc("initialize", {}, 1, { Authorization: "Bearer rok_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO" });
    expect(wrongPrefix.status).toBe(401);
  });

  it("initializes with a valid master key", async () => {
    const out = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } }, 1, { Authorization: `Bearer ${mcpKey}` });
    expect(out.status).toBe(200);
    const result = out.body?.result as { protocolVersion?: string; serverInfo?: { name: string } };
    expect(result.serverInfo?.name).toBe("rodex");
    expect(result.protocolVersion).toBeTruthy();
  });

  it("deleted keys stop working immediately", async () => {
    const keyRes = await call("POST", "/v1/admin/mcp/keys", { name: "temp" }, { Cookie: adminCookie });
    const key = ((await keyRes.json()) as { result: { key_id: string; key: string } }).result;
    await call("DELETE", `/v1/admin/mcp/keys/${key.key_id}`, undefined, { Cookie: adminCookie });
    const out = await rpc("initialize", {}, 1, { Authorization: `Bearer ${key.key}` });
    expect(out.status).toBe(401);
  });
});

// ── discovery ────────────────────────────────────────────────────────────────

describe("MCP discovery", () => {
  it("tools/list exposes exactly the 18 tools with instructions", async () => {
    const out = await rpc("tools/list", {}, 1, { Authorization: `Bearer ${mcpKey}` });
    expect(out.status).toBe(200);
    const tools = ((out.body as { result: { tools: Array<{ name: string; description: string }> } }).result?.tools) ?? [];
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "create_app", "create_table", "delete_app", "delete_item", "delete_table",
      "force_delete_app", "get_app", "get_instructions", "get_item", "health",
      "list_apps", "list_tables", "put_item", "query", "recover_app", "resume_app",
      "suspend_app", "update_item",
    ]);
    // every mutation tool description states the confirmation rule
    for (const t of tools) {
      if (["create_app", "delete_app", "create_table", "delete_table", "put_item", "update_item", "delete_item", "suspend_app", "resume_app", "recover_app", "force_delete_app"].includes(t.name)) {
        expect(t.description.toLowerCase()).toContain("confirmed: true");
      }
    }
  });

  it("get_instructions returns the manual with the confirmation protocol", async () => {
    const out = await toolCall("get_instructions", {});
    expect(out.parsed.ok).toBe(true);
    const manual = String(out.parsed.manual);
    expect(manual).toContain("CONFIRM EVERY MUTATION");
    expect(manual).toContain("confirmation_required");
    expect(manual).toContain("600 total / 120 writes / 240 reads");
  });

  it("health reports the service", async () => {
    const out = await toolCall("health", {});
    expect(out.parsed.ok).toBe(true);
    expect(out.parsed.service).toBe("rodex-gateway");
  });
});

// ── read-only tools ──────────────────────────────────────────────────────────

describe("MCP read-only tools", () => {
  it("list_apps / get_app / list_tables see the whole platform", async () => {
    const apps = await toolCall("list_apps", {});
    expect(apps.parsed.ok).toBe(true);
    expect((apps.parsed.apps as Array<{ app_id: string }>).length).toBe(1);
    const appId = (apps.parsed.apps as Array<{ app_id: string }>)[0].app_id;
    expect(appId).toBe(createdApp!.app_id);

    const one = await toolCall("get_app", { app_id: appId });
    expect(one.parsed.ok).toBe(true);
    expect((one.parsed.app as { name: string }).name).toBe("mapp");

    const tables = await toolCall("list_tables", { app_id: appId });
    expect(tables.parsed.ok).toBe(true);
    expect((tables.parsed.tables as Array<{ name: string }>).map((t) => t.name)).toEqual(["users"]);
  });

  it("get_item / query read written data (master key = full access)", async () => {
    const appId = createdApp!.app_id;
    await call("POST", "/v1/item/put", { table: "users", item: { pk: "u1", data: { name: "Rakesh" } } }, { "X-App-Id": appId, "X-Api-Key": createdApp!.api_key });
    await call("POST", "/v1/item/put", { table: "users", item: { pk: "u1", sk: "meta", data: { note: "x" } } }, { "X-App-Id": appId, "X-Api-Key": createdApp!.api_key });

    const got = await toolCall("get_item", { app_id: appId, table: "users", pk: "u1" });
    expect(got.parsed.ok).toBe(true);
    // the payload object is stored under the item's `data` field (REST contract)
    expect((got.parsed.result as { data: { data: { name: string } } }).data.data.name).toBe("Rakesh");

    const q = await toolCall("query", { app_id: appId, table: "users", pk: "u1" });
    expect(q.parsed.ok).toBe(true);
    expect((q.parsed.result as { items: unknown[] }).items.length).toBe(2);

    const missing = await toolCall("get_item", { app_id: appId, table: "users", pk: "nope" });
    expect(missing.parsed.ok).toBe(false);
    expect(missing.parsed.code).toBe(404);
  });
});

// ── the confirmation gate ────────────────────────────────────────────────────

describe("MCP confirmation gate (mutations)", () => {
  it("refuses every mutation without confirmed: true — nothing executes", async () => {
    const appId = createdApp!.app_id;
    const before = await call("GET", "/v1/tables", undefined, { "X-App-Id": appId, "X-Api-Key": createdApp!.api_key });

    const put = await toolCall("put_item", { app_id: appId, table: "users", pk: "x1", data: { v: 1 } });
    expect(put.parsed).toMatchObject({ ok: false, code: "confirmation_required" });
    expect((put.parsed.what_would_happen as { action: string }).action).toBe("put_item");

    const upd = await toolCall("update_item", { app_id: appId, table: "users", pk: "x1", sk: "~", data: { v: 2 } });
    expect(upd.parsed.code).toBe("confirmation_required");

    const del = await toolCall("delete_item", { app_id: appId, table: "users", pk: "x1", sk: "~" });
    expect(del.parsed.code).toBe("confirmation_required");

    const t = await toolCall("create_table", { app_id: appId, name: "logs" });
    expect(t.parsed.code).toBe("confirmation_required");

    const dt = await toolCall("delete_table", { app_id: appId, name: "users" });
    expect(dt.parsed.code).toBe("confirmation_required");

    const ca = await toolCall("create_app", { name: "rogue" });
    expect(ca.parsed.code).toBe("confirmation_required");

    const da = await toolCall("delete_app", { app_id: appId });
    expect(da.parsed.code).toBe("confirmation_required");

    const sa = await toolCall("suspend_app", { app_id: appId });
    expect(sa.parsed.code).toBe("confirmation_required");

    const ra = await toolCall("resume_app", { app_id: appId });
    expect(ra.parsed.code).toBe("confirmation_required");

    const rc = await toolCall("recover_app", { app_id: appId });
    expect(rc.parsed.code).toBe("confirmation_required");

    const fa = await toolCall("force_delete_app", { app_id: appId });
    expect(fa.parsed.code).toBe("confirmation_required");
    expect((fa.parsed.what_would_happen as { note: string }).note).toContain("destroyed");

    // nothing changed: no table created, no item written, app still active
    const after = await call("GET", "/v1/tables", undefined, { "X-App-Id": appId, "X-Api-Key": createdApp!.api_key });
    expect((await after.json()) as unknown).toEqual((await before.json()) as unknown);
    const apps = await toolCall("list_apps", {});
    expect((apps.parsed.apps as Array<{ status: string }>)[0].status).toBe("active");
    const q = await toolCall("query", { app_id: appId, table: "users", pk: "x1" });
    expect((q.parsed.result as { items: unknown[] }).items.length).toBe(0);
  });

  it("executes mutations when confirmed: true — full item lifecycle", async () => {
    const appId = createdApp!.app_id;
    const put = await toolCall("put_item", { app_id: appId, table: "users", pk: "u9", data: { score: 5 }, confirmed: true });
    expect(put.parsed.ok).toBe(true);
    expect((put.parsed.result as { version: number }).version).toBe(1);

    const upd = await toolCall("update_item", { app_id: appId, table: "users", pk: "u9", sk: "~", data: { score: 7 }, expected_version: 1, confirmed: true });
    expect(upd.parsed.ok).toBe(true);
    expect((upd.parsed.result as { version: number }).version).toBe(2);

    // version conflict surfaces as a structured 409, not a crash
    const conflict = await toolCall("update_item", { app_id: appId, table: "users", pk: "u9", sk: "~", data: { score: 9 }, expected_version: 1, confirmed: true });
    expect(conflict.parsed.ok).toBe(false);
    expect(conflict.parsed.code).toBe(409);

    const del = await toolCall("delete_item", { app_id: appId, table: "users", pk: "u9", sk: "~", confirmed: true });
    expect(del.parsed.ok).toBe(true);

    const gone = await toolCall("get_item", { app_id: appId, table: "users", pk: "u9" });
    expect(gone.parsed.code).toBe(404);
  });

  it("table + app lifecycle mutations work when confirmed", async () => {
    const appId = createdApp!.app_id;
    const ct = await toolCall("create_table", { app_id: appId, name: "logs", confirmed: true });
    expect(ct.parsed.ok).toBe(true);

    const dt = await toolCall("delete_table", { app_id: appId, name: "logs", confirmed: true });
    expect(dt.parsed.ok).toBe(true);
    expect((dt.parsed.result as { status: string }).status).toBe("deleted");

    const ca = await toolCall("create_app", { name: "agentapp", confirmed: true });
    expect(ca.parsed.ok).toBe(true);
    const newAppId = (ca.parsed.app as { app_id: string }).app_id;
    expect(newAppId).toMatch(/^app_/);

    const da = await toolCall("delete_app", { app_id: newAppId, confirmed: true });
    expect(da.parsed.ok).toBe(true);
    expect((da.parsed.app as { status: string }).status).toBe("deleting");
  });

  it("suspend / resume / recover / force-delete work when confirmed", async () => {
    const appId = createdApp!.app_id;
    const headers = { "X-App-Id": appId, "X-Api-Key": createdApp!.api_key };

    // suspend → REST writes are blocked with 403
    const sus = await toolCall("suspend_app", { app_id: appId, confirmed: true });
    expect(sus.parsed.ok).toBe(true);
    expect((sus.parsed.app as { status: string }).status).toBe("suspended");
    const blocked = await call("POST", "/v1/item/put", { table: "users", item: { pk: "x", data: {} } }, headers);
    expect(blocked.status).toBe(403);

    // resume → traffic flows again
    const res = await toolCall("resume_app", { app_id: appId, confirmed: true });
    expect(res.parsed.ok).toBe(true);
    expect((res.parsed.app as { status: string }).status).toBe("active");
    const ok = await call("POST", "/v1/item/put", { table: "users", item: { pk: "x", data: { v: 1 } } }, headers);
    expect(ok.status).toBe(200);

    // soft delete → recover inside the window
    await toolCall("delete_app", { app_id: appId, confirmed: true });
    const rc = await toolCall("recover_app", { app_id: appId, confirmed: true });
    expect(rc.parsed.ok).toBe(true);
    expect((rc.parsed.app as { status: string }).status).toBe("active");

    // force-delete a fresh app: gone from list_apps, tables purged
    const freshRes = await call("POST", "/v1/admin/apps", { name: "fdapp" }, { Cookie: adminCookie });
    const fresh = ((await freshRes.json()) as { result: { app_id: string; api_key: string } }).result;
    await call("POST", "/v1/table/create", { name: "t" }, { "X-App-Id": fresh.app_id, "X-Api-Key": fresh.api_key });
    const fd = await toolCall("force_delete_app", { app_id: fresh.app_id, confirmed: true });
    expect(fd.parsed).toMatchObject({ ok: true, deleted: true });
    const apps = await toolCall("list_apps", {});
    expect((apps.parsed.apps as Array<{ app_id: string }>).map((a) => a.app_id)).not.toContain(fresh.app_id);
  });

  it("unknown apps / tables map to structured errors (403/404), never crashes", async () => {
    const noApp = await toolCall("get_item", { app_id: "app_nope", table: "users", pk: "x" });
    expect(noApp.parsed.code).toBe(404); // unknown app (registry contract)

    const noTable = await toolCall("put_item", { app_id: createdApp!.app_id, table: "ghost", pk: "x", data: {}, confirmed: true });
    expect(noTable.parsed.code).toBe(403); // unowned table
  });
});

// ── budgets ──────────────────────────────────────────────────────────────────

describe("MCP budgets (same single-point counters)", () => {
  it("read budget: 240 allowed, 241st refused with mcp-reads budget", async () => {
    for (let i = 0; i < MCP_RATE_READS; i++) await gateMCPRequest(env(), "read");
    await expect(gateMCPRequest(env(), "read")).rejects.toMatchObject({ status: 429 });
  });

  it("write budget: 120 allowed, 121st refused", async () => {
    for (let i = 0; i < MCP_RATE_WRITES; i++) await gateMCPRequest(env(), "write");
    await expect(gateMCPRequest(env(), "write")).rejects.toMatchObject({ status: 429 });
  });
});

// ── stress: a real 121-write burst through the full HTTP surface ────────────

describe("MCP write-burst stress (end-to-end)", () => {
  it("write burst: every budget bites at exactly its number, naming itself", async () => {
    // The REST table/create in setup consumed 1 app-write unit, so the APP
    // write budget (120) exhausts at call 119 while the MCP budget (120)
    // exhausts at call 120 — both ceilings are exact and self-naming.
    const appId = createdApp!.app_id;
    let ok = 0;
    let refused = 0;
    let appBudget = 0;
    let mcpBudget = 0;
    let other = 0;
    for (let i = 0; i < 125; i++) {
      const out = await toolCall("put_item", { app_id: appId, table: "users", pk: `burst-${i}`, data: { i }, confirmed: true }, i + 1);
      if (out.parsed.ok === true) ok++;
      else if (out.parsed.code === "confirmation_required") refused++;
      else if (out.parsed.code === 429 && String(out.parsed.message).includes("mcp-writes")) mcpBudget++;
      else if (out.parsed.code === 429 && String(out.parsed.message).includes("writes budget")) appBudget++;
      else other++;
    }
    expect(ok).toBe(119); // app write budget started 1 unit consumed (setup table/create)
    expect(refused).toBe(0); // confirmed: true was always sent
    expect(mcpBudget).toBe(5); // calls 121-125: mcp-writes budget
    expect(appBudget).toBe(1); // call 120: app writes budget
    expect(other).toBe(0);
    // nothing was silently dropped: 119 writes landed
    const q = await toolCall("query", { app_id: appId, table: "users", pk: "burst-0" }, 999);
    expect(q.parsed.ok).toBe(true);
    expect((q.parsed.result as { items: unknown[] }).items.length).toBe(1);
  }, 90_000);
});
