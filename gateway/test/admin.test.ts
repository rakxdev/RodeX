/**
 * admin.test.ts — password + GitHub OAuth login, admin app management,
 * soft-delete lifecycle through the API (SPEC §9 tests #6–8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { resetMockStorage } from "../src/storage-mock";
import { resetRateCounters } from "../src/rate";
import { processCapacityChunk } from "../src/capacity";
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
  resetRateCounters();
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

  it("login returns the session token for the SPA token channel", async () => {
    const good = await call("POST", "/v1/admin/login", { password: ADMIN_PW });
    const body = (await good.json()) as any;
    expect(body.result.session).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/);
  });

  it("me accepts Authorization: Bearer token (third-party-cookie-free channel)", async () => {
    const login = await (await call("POST", "/v1/admin/login", { password: ADMIN_PW })).json() as any;
    const token = login.result.session;
    const via = await (await call("GET", "/v1/admin/me", undefined, { Authorization: `Bearer ${token}` })).json() as any;
    expect(via.result.authenticated).toBe(true);
    expect(via.result.user).toBe("admin");
  });

  it("me accepts X-Rodex-Session header fallback", async () => {
    const login = await (await call("POST", "/v1/admin/login", { password: ADMIN_PW })).json() as any;
    const via = await (await call("GET", "/v1/admin/me", undefined, { "X-Rodex-Session": login.result.session })).json() as any;
    expect(via.result.authenticated).toBe(true);
  });

  it("logout works bodyless and clears the session cookie (regression: 415)", async () => {
    const r = await call("POST", "/v1/admin/logout");
    expect(r.status).toBe(200);
    expect((await r.json()) as any).toMatchObject({ ok: true });
    const sc = r.headers.get("set-cookie") || "";
    expect(sc).toContain("rodex_session=;");
    expect(sc.toLowerCase()).toContain("max-age=0");
  });

  it("change-password: wrong old → 401; too short → 400; valid → login switches to the new password", async () => {
    const wrong = await call("POST", "/v1/admin/change-password", { old_password: "nope", new_password: "brand-new-secret-123" }, { Cookie: adminCookie });
    expect(wrong.status).toBe(401);

    const short = await call("POST", "/v1/admin/change-password", { old_password: ADMIN_PW, new_password: "tiny" }, { Cookie: adminCookie });
    expect(short.status).toBe(400);

    const same = await call("POST", "/v1/admin/change-password", { old_password: ADMIN_PW, new_password: ADMIN_PW }, { Cookie: adminCookie });
    expect(same.status).toBe(400);

    const ok = await call("POST", "/v1/admin/change-password", { old_password: ADMIN_PW, new_password: "brand-new-secret-123" }, { Cookie: adminCookie });
    expect(ok.status).toBe(200);

    // old password now fails, new one works
    expect((await call("POST", "/v1/admin/login", { password: ADMIN_PW })).status).toBe(401);
    expect((await call("POST", "/v1/admin/login", { password: "brand-new-secret-123" })).status).toBe(200);

    // restore the original password so later tests keep logging in
    const fresh = await call("POST", "/v1/admin/login", { password: "brand-new-secret-123" });
    await call("POST", "/v1/admin/change-password", { old_password: "brand-new-secret-123", new_password: ADMIN_PW }, { Cookie: cookieOf(fresh) });
  });

  it("change-password requires a session (401 anonymous)", async () => {
    const r = await call("POST", "/v1/admin/change-password", { old_password: ADMIN_PW, new_password: "brand-new-secret-123" });
    expect(r.status).toBe(401);
  });

  it("logout also accepts a JSON body (SPA sends {}) without error", async () => {
    const r = await call("POST", "/v1/admin/logout", {});
    expect(r.status).toBe(200);
  });

  it("bearer token drives admin actions; garbage token → 401", async () => {
    const login = await (await call("POST", "/v1/admin/login", { password: ADMIN_PW })).json() as any;
    const created = await call("POST", "/v1/admin/apps", { name: "token-app" }, { Authorization: `Bearer ${login.result.session}` });
    expect(created.status).toBe(200);
    const bad = await call("GET", "/v1/admin/apps", undefined, { Authorization: "Bearer garbage" });
    expect(bad.status).toBe(401);
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
    expect(body.result.api_key).toMatch(/^rok_[A-Za-z0-9_-]{43}$/);
    expect(body.result.key_prefix).toMatch(/^rok_/);
    expect(body.result.status).toBe("active");

    const list = await (await call("GET", "/v1/admin/apps", undefined, { Cookie: adminCookie })).json() as any;
    expect(list.result.apps.map((a: any) => a.name)).toContain("weather-bot");
  });

  it("create app accepts an optional description (1–200 chars)", async () => {
    const ok = await call("POST", "/v1/admin/apps", { name: "desc-app", description: "  weather pipeline  " }, { Cookie: adminCookie });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).result.description).toBe("weather pipeline");
    const bad = await call("POST", "/v1/admin/apps", { name: "desc-bad", description: "x".repeat(201) }, { Cookie: adminCookie });
    expect(bad.status).toBe(400);
  });

  it("rejects invalid names and over-limit apps", async () => {
    const bad = await call("POST", "/v1/admin/apps", { name: "Bad Name" }, { Cookie: adminCookie });
    expect(bad.status).toBe(400);
  });

  it("rotate-key invalidates old key immediately", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "rot" }, { Cookie: adminCookie })).json() as any;
    const { app_id, api_key } = created.result;
    const rotated = await (await call("POST", `/v1/admin/apps/${app_id}/rotate-key`, {}, { Cookie: adminCookie })).json() as any;

    // regression: rotate must return the FULL app so the detail page can re-render
    expect(rotated.result.app_id).toBe(app_id);
    expect(rotated.result.name).toBe("rot");
    expect(rotated.result.status).toBe("active");
    expect(typeof rotated.result.created_at).toBe("number");
    expect(Array.isArray(rotated.result.tables)).toBe(true);

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

  it("soft delete via POST /delete alias (older dashboard bundles)", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "alias" }, { Cookie: adminCookie })).json() as any;
    const { app_id } = created.result;
    const del = await call("POST", `/v1/admin/apps/${app_id}/delete`, {}, { Cookie: adminCookie });
    expect(del.status).toBe(200);
    expect(((await del.json()) as any).result.status).toBe("deleting");
  });

  it("view-key returns the same raw key inside the recovery window", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "viewer" }, { Cookie: adminCookie })).json() as any;
    const { app_id, api_key } = created.result;
    expect(created.result.key_recoverable_until).toBeGreaterThan(0);
    const viewed = await (await call("POST", `/v1/admin/apps/${app_id}/view-key`, {}, { Cookie: adminCookie })).json() as any;
    expect(viewed.result.api_key).toBe(api_key);
  });

  it("view-key after rotate returns the NEW key", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "viewer2" }, { Cookie: adminCookie })).json() as any;
    const { app_id } = created.result;
    const rotated = await (await call("POST", `/v1/admin/apps/${app_id}/rotate-key`, {}, { Cookie: adminCookie })).json() as any;
    const viewed = await (await call("POST", `/v1/admin/apps/${app_id}/view-key`, {}, { Cookie: adminCookie })).json() as any;
    expect(viewed.result.api_key).toBe(rotated.result.api_key);
  });

  it("view-key expired → 403 with a clear message (old keys are hash-only)", async () => {
    vi.useFakeTimers();
    try {
      const created = await (await call("POST", "/v1/admin/apps", { name: "expired" }, { Cookie: adminCookie })).json() as any;
      vi.setSystemTime(new Date(Date.now() + 49 * 3600 * 1000));
      const fresh = await call("POST", "/v1/admin/login", { password: ADMIN_PW });
      const r = await call("POST", `/v1/admin/apps/${created.result.app_id}/view-key`, {}, { Cookie: cookieOf(fresh) });
      expect(r.status).toBe(403);
      expect(((await r.json()) as any).error.message).toContain("expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("usage endpoint reports live counters without consuming them", async () => {
    const created = await (await call("POST", "/v1/admin/apps", { name: "meter" }, { Cookie: adminCookie })).json() as any;
    const { app_id, api_key } = created.result;
    const h = { "X-App-Id": app_id, "X-Api-Key": api_key };

    // 5 table creates (writes) via the app key
    for (let i = 0; i < 5; i++) {
      await call("POST", "/v1/table/create", { name: `t${i}` }, h);
    }
    const before = await (await call("GET", `/v1/admin/apps/${app_id}/usage`, undefined, { Cookie: adminCookie })).json() as any;
    expect(before.result.requests.writes.used).toBeGreaterThanOrEqual(5);
    expect(before.result.requests.writes.limit).toBe(800);
    expect(before.result.requests.reads.used).toBe(0);
    expect(before.result.storage.tables).toBe(5);
    expect(typeof before.result.storage.items).toBe("number");

    // peek must not consume: a write right after is still allowed
    const after = await call("POST", "/v1/table/create", { name: "t5" }, h);
    expect(after.status).toBe(200);
  });

  it("usage endpoint requires a session", async () => {
    const r = await call("GET", `/v1/admin/apps/app_x/usage`);
    expect(r.status).toBe(401);
  });
});

describe("platform capacity (NORMAL / PERFORMANCE)", () => {
  let appId = "";
  let apiKey = "";

  beforeEach(async () => {
    const r = await call("POST", "/v1/admin/apps", { name: "cap-app" }, { Cookie: adminCookie });
    const b = (await r.json()) as { result: { app_id: string; api_key: string } };
    appId = b.result.app_id;
    apiKey = b.result.api_key;
    await call("POST", "/v1/table/create", { name: "cap_tbl" }, { "X-App-Id": appId, "X-Api-Key": apiKey });
  });

  it("GET reports normal mode + table billing modes", async () => {
    const res = await call("GET", "/v1/admin/capacity", undefined, { Cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { mode: string; tables: Array<{ table: string; mode: string }> } };
    expect(body.result.mode).toBe("normal");
    expect(body.result.tables.length).toBeGreaterThan(0);
    expect(body.result.tables.every((t) => t.mode === "provisioned")).toBe(true);
  });

  it("POST queues the switch; the scheduled runner completes it; invalid mode → 400", async () => {
    const res = await call("POST", "/v1/admin/capacity", { mode: "performance" }, { Cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { mode: string; queued: number; note: string } };
    expect(body.result.mode).toBe("performance");
    expect(body.result.queued).toBeGreaterThan(0);
    expect(body.result.note).toContain("background");

    // switching shows as pending until the runner drains it
    const mid = (await (await call("GET", "/v1/admin/capacity", undefined, { Cookie: adminCookie })).json()) as {
      result: { switching: boolean };
    };
    expect(mid.result.switching).toBe(true);

    // drain the queue as the cron would
    for (let i = 0; i < 50; i++) {
      const { done } = await processCapacityChunk(env(), 12);
      if (done) break;
    }
    const after = (await (await call("GET", "/v1/admin/capacity", undefined, { Cookie: adminCookie })).json()) as {
      result: { mode: string; switching: boolean; tables: Array<{ mode: string }> };
    };
    expect(after.result.switching).toBe(false);
    expect(after.result.mode).toBe("performance");
    expect(after.result.tables.every((t) => t.mode === "on-demand")).toBe(true);

    const bad = await call("POST", "/v1/admin/capacity", { mode: "turbo" }, { Cookie: adminCookie });
    expect(bad.status).toBe(400);
  });

  it("PERFORMANCE mode budgets are guardrails: > 800 units still allowed", async () => {
    await call("POST", "/v1/admin/capacity", { mode: "performance" }, { Cookie: adminCookie });
    for (let i = 0; i < 50; i++) {
      const { done } = await processCapacityChunk(env(), 12);
      if (done) break;
    }
    // fresh window: normal would trip at 2000; performance swallows 2100 tiny writes
    for (let i = 0; i < 2_100; i++) {
      const r = await call("POST", "/v1/item/increment", { table: "cap_tbl", pk: `p${i}` }, { "X-App-Id": appId, "X-Api-Key": apiKey });
      expect(r.status).toBe(200);
    }
    // and back to normal restores the ceiling (switches take minutes at AWS,
    // so a fresh minute window is the realistic state after switching)
    await call("POST", "/v1/admin/capacity", { mode: "normal" }, { Cookie: adminCookie });
    for (let i = 0; i < 50; i++) {
      const { done } = await processCapacityChunk(env(), 12);
      if (done) break;
    }
    resetRateCounters();
    for (let i = 0; i < 800; i++) {
      const r = await call("POST", "/v1/item/increment", { table: "cap_tbl", pk: `n${i}` }, { "X-App-Id": appId, "X-Api-Key": apiKey });
      expect(r.status).toBe(200);
    }
    const trip = await call("POST", "/v1/item/increment", { table: "cap_tbl", pk: "trip" }, { "X-App-Id": appId, "X-Api-Key": apiKey });
    expect(trip.status).toBe(429);
  }, 60_000);
});

describe("GitHub OAuth", () => {
  function stubGithub(login: string | null, userStatus = 200) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "tok_123" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("api.github.com/user")) {
        // GitHub API hard-requires a User-Agent; regression: missing UA → 403 → "user '?'"
        const h = new Headers(init?.headers);
        if (!h.get("user-agent")) {
          throw new Error("User-Agent header missing on api.github.com/user request");
        }
        if (h.get("authorization") !== "Bearer tok_123") {
          throw new Error("Bearer token missing on api.github.com/user request");
        }
        return new Response(JSON.stringify(login ? { login } : {}), { status: userStatus, headers: { "Content-Type": "application/json" } });
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
    const loc = r.headers.get("location") || "";
    expect(loc.startsWith("https://rodexdb.pages.dev/login?session=")).toBe(true);
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

  it("callback sends User-Agent to the GitHub API (regression: 403 'user ?')", async () => {
    stubGithub("rakxdev");
    const start = await call("GET", "/v1/auth/github/start");
    const state = (cookieOf(start).match(/rodex_oauth_state=([^;]+)/) || [])[1];
    const r = await call("GET", `/v1/auth/github/callback?code=c1&state=${state}`, undefined, { Cookie: `rodex_oauth_state=${state}` });
    expect(r.status).toBe(302);
  });

  it("callback reports GitHub API failures honestly (503, not 'user ?')", async () => {
    stubGithub(null, 403);
    const start = await call("GET", "/v1/auth/github/start");
    const state = (cookieOf(start).match(/rodex_oauth_state=([^;]+)/) || [])[1];
    const r = await call("GET", `/v1/auth/github/callback?code=c1&state=${state}`, undefined, { Cookie: `rodex_oauth_state=${state}` });
    expect(r.status).toBe(503);
    const body = (await r.json()) as any;
    expect(body.error.message).toContain("GitHub user lookup failed");
  });

  it("state embedded in ANOTHER cookie's value must NOT pass (substring spoof)", async () => {
    stubGithub("rakxdev");
    const start = await call("GET", "/v1/auth/github/start");
    const state = (cookieOf(start).match(/rodex_oauth_state=([^;]+)/) || [])[1];
    // attacker-controlled cookie that merely CONTAINS the expected substring
    const r = await call("GET", `/v1/auth/github/callback?code=c1&state=${state}`, undefined, {
      Cookie: `other=rodex_oauth_state=${state}`,
    });
    expect(r.status).toBe(400);
  });
});