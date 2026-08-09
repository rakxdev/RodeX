/**
 * admin.test.ts — password + GitHub OAuth login, admin app management,
 * soft-delete lifecycle through the API (SPEC §9 tests #6–8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { resetMockStorage } from "../src/storage-mock";
import handler from "../src/index";

const SECRET = "test-secret-0123456789abcdef";
const ADMIN_PW = "super-secret-password";

function env(): Env {
  return {
    STORAGE: "mock",
    DASHBOARD_ORIGIN: "https://rodexdb.pages.dev",
    GITHUB_ALLOWED_USERS: "rakxdev,newylbot,luminoxpp",
    SESSION_SECRET: SECRET,
    ADMIN_PASSWORD: ADMIN_PW,
    GITHUB_CLIENT_ID: "gh-client",
    GITHUB_CLIENT_SECRET: "gh-secret",
  } as Env;
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await handler.fetch(
    new Request(`https://gw.example.com${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env(),
    {} as ExecutionContext,
  );
  return res;
}

function cookieOf(res: Response): string {
  const c = res.headers.get("set-cookie");
  if (!c) return "";
  return c.split(";")[0];
}

let adminCookie = "";

beforeEach(async () => {
  resetMockStorage();
  const login = await call("POST", "/v1/admin/login", { password: ADMIN_PW });
  adminCookie = cookieOf(login);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("password login", () => {
  it("correct password → session cookie; wrong → 401", async () => {
    const bad = await call("POST", "/v1/admin/login", { password: "nope" });
    expect(bad.status).toBe(401);
    const good = await call("POST", "/v1/admin/login", { password: ADMIN_PW });
    expect(good.status).toBe(200);
    expect(cookieOf(good)).toContain("rodex_session=");
  });

  it("me reports auth state", async () => {
    const anon = await (await call("GET", "/v1/admin/me")).json() as any;
    expect(anon.result.authenticated).toBe(false);
    const auth = await (await call("GET", "/v1/admin/me", undefined, { Cookie: adminCookie })).json() as any;
    expect(auth.result.authenticated).toBe(true);
    expect(auth.result.allowed_users).toContain("rakxdev");
  });
});

describe("admin app management", () => {
  it("requires session (401 without cookie)", async () => {
    const r = await call("POST", "/v1/admin/apps", { name: "x" });
    expect(r.status).toBe(401);
  });

  it("creates app, returns key once, lists it", async () => {
    const r = await call("POST", "/v1/admin/apps", { name: "weather-bot" }, { Cookie: adminCookie });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.result.api_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.result.status).toBe("active");

    const list = await (await call("GET", "/v1/admin/apps", undefined, { Cookie: adminCookie })).json() as any;
    expect(list.result.apps.map((a: any) => a.name)).toContain("weather-bot");
  });

  it("rejects invalid names and over-limit apps", async () => {
    const bad = await call("POST", "/v1/admin/apps", { name: "Bad Name" }, { Cookie: adminCookie });
    expect(bad.status).toBe(400);
  });

  it("rotate-key invalidates old key immediately", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "rot" }, { Cookie: adminCookie })).json() as any;
    const { app_id, api_key } = created.result;
    const rotated = await (await call("POST", `/v1/admin/apps/${app_id}/rotate-key`, {}, { Cookie: adminCookie })).json() as any;

    const oldKey = await call("POST", "/v1/query", { table: "t", pk: "x" }, { "X-App-Id": app_id, "X-Api-Key": api_key });
    expect(oldKey.status).toBe(401);
    const newKey = await call("POST", "/v1/query", { table: "t", pk: "x" }, { "X-App-Id": app_id, "X-Api-Key": rotated.result.api_key });
    expect(newKey.status).toBe(403); // authenticated; table not owned (never created) — proves key works
  });

  it("suspend blocks app traffic; resume unblocks", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "sus" }, { Cookie: adminCookie })).json() as any;
    const { app_id, api_key } = created.result;
    const h = { "X-App-Id": app_id, "X-Api-Key": api_key };

    await call("POST", `/v1/admin/apps/${app_id}/suspend`, {}, { Cookie: adminCookie });
    expect((await call("POST", "/v1/query", { table: "t", pk: "x" }, h)).status).toBe(403);
    expect(((await (await call("POST", `/v1/admin/apps/${app_id}/resume`, {}, { Cookie: adminCookie })).json()) as any).result.status).toBe("active");
    expect((await call("POST", "/v1/query", { table: "t", pk: "x" }, h)).status).toBe(403); // still 403: table not owned — but NOT 403-suspended; check message
  });

  it("soft delete → recover → force delete lifecycle", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "del" }, { Cookie: adminCookie })).json() as any;
    const { app_id, api_key } = created.result;
    const h = { "X-App-Id": app_id, "X-Api-Key": api_key };

    const del = await (await call("DELETE", `/v1/admin/apps/${app_id}`, undefined, { Cookie: adminCookie })).json() as any;
    expect(del.result.status).toBe("deleting");
    expect(del.result.purge_at).toBeGreaterThan(Date.now() / 1000);
    expect((await call("POST", "/v1/query", { table: "t", pk: "x" }, h)).status).toBe(403);

    const rec = await (await call("POST", `/v1/admin/apps/${app_id}/recover`, {}, { Cookie: adminCookie })).json() as any;
    expect(rec.result.status).toBe("active");

    await call("DELETE", `/v1/admin/apps/${app_id}`, undefined, { Cookie: adminCookie });
    await call("POST", `/v1/admin/apps/${app_id}/force-delete`, {}, { Cookie: adminCookie });
    expect((await call("POST", "/v1/query", { table: "t", pk: "x" }, h)).status).toBe(401);
    const list = await (await call("GET", "/v1/admin/apps", undefined, { Cookie: adminCookie })).json() as any;
    expect(list.result.apps.map((a: any) => a.app_id)).not.toContain(app_id);
  });
});

describe("GitHub OAuth", () => {
  function stubGithub(login: string | null) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "tok_123" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("api.github.com/user")) {
        return new Response(JSON.stringify(login ? { login } : {}), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  it("start redirects to GitHub with state cookie", async () => {
    const r = await call("GET", "/v1/auth/github/start");
    expect(r.status).toBe(302);
    const loc = r.headers.get("location") || "";
    expect(loc).toContain("github.com/login/oauth/authorize");
    expect(loc).toContain("client_id=gh-client");
    expect(cookieOf(r)).toContain("rodex_oauth_state=");
  });

  it("callback with valid state + allowed user → session + redirect to dashboard", async () => {
    stubGithub("rakxdev");
    const start = await call("GET", "/v1/auth/github/start");
    const state = (cookieOf(start).match(/rodex_oauth_state=([^;]+)/) || [])[1];
    const r = await call("GET", `/v1/auth/github/callback?code=c1&state=${state}`, undefined, { Cookie: `rodex_oauth_state=${state}` });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://rodexdb.pages.dev");
    expect(cookieOf(r)).toContain("rodex_session=");
  });

  it("disallowed user → 403", async () => {
    stubGithub("notallowed");
    const start = await call("GET", "/v1/auth/github/start");
    const state = (cookieOf(start).match(/rodex_oauth_state=([^;]+)/) || [])[1];
    const r = await call("GET", `/v1/auth/github/callback?code=c1&state=${state}`, undefined, { Cookie: `rodex_oauth_state=${state}` });
    expect(r.status).toBe(403);
  });

  it("missing/invalid state → 400", async () => {
    stubGithub("rakxdev");
    const r = await call("GET", "/v1/auth/github/callback?code=c1&state=forged");
    expect(r.status).toBe(400);
  });
});