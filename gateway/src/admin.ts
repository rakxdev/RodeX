/**
 * admin.ts — dashboard-facing API. Two auth paths:
 *   1. password login (ADMIN_PASSWORD) — constant-time compare
 *   2. GitHub OAuth session cookie (oauth.ts)
 * Sessions: HMAC-signed HttpOnly cookie, 12 h TTL.
 */
import type { Hono } from "hono";
import { constantTimeEqual, createSessionCookie, requireSession } from "./auth";
import { allowedUsers, sessionSecret, type Env } from "./env";
import { badRequest, forbidden, serviceUnavailable, unauthorized } from "./errors";
import { APP_NAME_PATTERN, MAX_APPS } from "./limits";
import { gateAdminRequest } from "./rate";
import { createApp, forceDelete, getApp, purgeDue, recover, rotateKey, setStatus, softDelete, toPublic } from "./registry";
import { createStorage } from "./storage";

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  // ── auth ────────────────────────────────────────────────────────────────────

  app.post("/v1/admin/login", async (c) => {
    await gateAdminRequest(c.env);
    const secret = c.env.ADMIN_PASSWORD;
    if (!secret || secret.length < 12) throw serviceUnavailable("ADMIN_PASSWORD not set (min 12 chars)");
    const body = (await c.req.json().catch(() => null)) as { password?: string } | null;
    if (!body?.password) throw badRequest("password is required");
    if (!constantTimeEqual(body.password, secret)) throw unauthorized("Wrong password");
    const secure = new URL(c.req.url).protocol === "https:";
    const session = await createSessionCookie(sessionSecret(c.env));
    c.header("Set-Cookie", `rodex_session=${session}; Path=/; HttpOnly; Max-Age=43200; SameSite=${secure ? "None" : "Lax"}${secure ? "; Secure" : ""}`);
    return c.json({ ok: true, result: { user: "admin", login_method: "password" } });
  });

  app.post("/v1/admin/logout", async (c) => {
    c.header("Set-Cookie", "rodex_session=; Path=/; HttpOnly; Max-Age=0");
    return c.json({ ok: true, result: { logged_out: true } });
  });

  app.get("/v1/admin/me", async (c) => {
    const session = await verifySessionLoose(c);
    if (!session) return c.json({ ok: true, result: { authenticated: false } });
    return c.json({ ok: true, result: { authenticated: true, user: session.sub, allowed_users: [...allowedUsers(c.env)] } });
  });

  // ── apps management ─────────────────────────────────────────────────────────

  app.post("/v1/admin/apps", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const storage = createStorage(c.env);
    const body = (await c.req.json().catch(() => null)) as { name?: string } | null;
    const name = body?.name;
    if (!name || !APP_NAME_PATTERN.test(name)) throw badRequest("name must match ^[a-z0-9][a-z0-9_-]{0,39}$");
    if ((await storage.listApps()).length >= MAX_APPS) throw forbidden(`Max ${MAX_APPS} apps (free-tier guard)`);
    const { app, api_key } = await createApp(storage, sessionSecret(c.env), name);
    return c.json({ ok: true, result: { ...app, api_key } }); // key shown ONCE
  });

  app.get("/v1/admin/apps", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const storage = createStorage(c.env);
    const rows = await storage.listApps();
    return c.json({ ok: true, result: { apps: rows.map(toPublic) } });
  });

  app.get("/v1/admin/apps/:id", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const row = await getApp(createStorage(c.env), c.req.param("id"));
    return c.json({ ok: true, result: toPublic(row) });
  });

  app.post("/v1/admin/apps/:id/rotate-key", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const storage = createStorage(c.env);
    const { api_key, key_prefix } = await rotateKey(storage, sessionSecret(c.env), c.req.param("id"));
    return c.json({ ok: true, result: { api_key, key_prefix } }); // shown once
  });

  app.post("/v1/admin/apps/:id/suspend", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const app = await setStatus(createStorage(c.env), c.req.param("id"), "suspended");
    return c.json({ ok: true, result: app });
  });

  app.post("/v1/admin/apps/:id/resume", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const app = await setStatus(createStorage(c.env), c.req.param("id"), "active");
    return c.json({ ok: true, result: app });
  });

  app.delete("/v1/admin/apps/:id", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const app = await softDelete(createStorage(c.env), c.req.param("id"));
    return c.json({ ok: true, result: app });
  });

  app.post("/v1/admin/apps/:id/recover", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const app = await recover(createStorage(c.env), c.req.param("id"));
    return c.json({ ok: true, result: app });
  });

  app.post("/v1/admin/apps/:id/force-delete", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const storage = createStorage(c.env);
    const id = c.req.param("id");
    await forceDelete(storage, id);
    return c.json({ ok: true, result: { deleted: true } });
  });

  // lazy purge on admin list (belt-and-suspenders to the cron trigger)
  app.get("/v1/admin/purge/run", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), cookieOf(c));
    const n = await purgeDue(createStorage(c.env), Math.floor(Date.now() / 1000), 5);
    return c.json({ ok: true, result: { finalized: n } });
  });
}

function cookieOf(c: { req: { header(name: string): string | undefined } }): string | undefined {
  const raw = c.req.header("cookie") || "";
  const m = /rodex_session=([^;]+)/.exec(raw);
  return m ? m[1] : undefined; // bare token (no name= prefix)
}

async function verifySessionLoose(c: { env: Env; req: { header(name: string): string | undefined } }) {
  const token = cookieOf(c);
  if (!token) return null;
  return requireSession(sessionSecret(c.env), token).catch(() => null);
}