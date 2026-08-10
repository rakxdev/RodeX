/**
 * admin.ts — dashboard-facing API. Two auth paths:
 *   1. password login (ADMIN_PASSWORD) — constant-time compare
 *   2. GitHub OAuth session cookie (oauth.ts)
 * Sessions: HMAC-signed token, 12 h TTL. Delivered two ways:
 *   - HttpOnly cookie (browsers that accept cross-site cookies)
 *   - returned in login JSON / OAuth redirect; SPA stores it and sends
 *     `Authorization: Bearer <token>` (browsers that block third-party cookies)
 */
import type { Hono } from "hono";
import { constantTimeEqual, createSessionCookie, decryptKey, hashKey, requireSession } from "./auth";
import { allowedUsers, sessionSecret, type Env } from "./env";
import { badRequest, forbidden, serviceUnavailable, unauthorized } from "./errors";
import { APP_NAME_PATTERN, MAX_APPS } from "./limits";
import { gateAdminRequest } from "./rate";
import { createApp, forceDelete, getApp, purgeDue, recover, rotateKey, setStatus, softDelete, toPublic } from "./registry";
import { createStorage } from "./storage";
import { peekUsage } from "./rate";
import { RATE_PLATFORM, RATE_READS_PER_APP, RATE_TOTAL_PER_APP, RATE_WRITES_PER_APP } from "./limits";
import { physicalName } from "./registry";

const SETTING_ADMIN_HASH = "admin_password_hash";

// storage size snapshot cache (60 s — DescribeTable is control-plane, but no
// need to hammer it; ItemCount itself lags ~6 h on DynamoDB's side)
const storageCache = new Map<string, { at: number; data: { bytes: number; items: number } }>();
const STORAGE_CACHE_TTL_MS = 60_000;

export function resetStorageCache(): void {
  storageCache.clear();
}

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  // ── auth ────────────────────────────────────────────────────────────────────

  app.post("/v1/admin/login", async (c) => {
    await gateAdminRequest(c.env);
    const secret = c.env.ADMIN_PASSWORD;
    if (!secret || secret.length < 12) throw serviceUnavailable("ADMIN_PASSWORD not set (min 12 chars)");
    const body = (await c.req.json().catch(() => null)) as { password?: string } | null;
    if (!body?.password) throw badRequest("password is required");
    const storage = createStorage(c.env);
    const storedHash = await storage.getSetting(SETTING_ADMIN_HASH).catch(() => null);
    const passwordOk = storedHash
      ? constantTimeEqual(await hashKey(sessionSecret(c.env), body.password), storedHash)
      : constantTimeEqual(body.password, secret);
    if (!passwordOk) throw unauthorized("Wrong password");
    const secure = new URL(c.req.url).protocol === "https:";
    const session = await createSessionCookie(sessionSecret(c.env));
    c.header("Set-Cookie", `rodex_session=${session}; Path=/; HttpOnly; Max-Age=43200; SameSite=${secure ? "None" : "Lax"}${secure ? "; Secure" : ""}`);
    return c.json({ ok: true, result: { user: "admin", login_method: "password", session } });
  });

  app.post("/v1/admin/change-password", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const body = (await c.req.json().catch(() => null)) as { old_password?: string; new_password?: string } | null;
    const oldPassword = body?.old_password ?? "";
    const newPassword = body?.new_password ?? "";
    if (newPassword.length < 12) throw badRequest("New password must be at least 12 characters");
    if (newPassword.length > 200) throw badRequest("New password too long");
    const storage = createStorage(c.env);
    const storedHash = await storage.getSetting(SETTING_ADMIN_HASH).catch(() => null);
    const current = c.env.ADMIN_PASSWORD;
    const oldOk = storedHash
      ? constantTimeEqual(await hashKey(sessionSecret(c.env), oldPassword), storedHash)
      : !!current && constantTimeEqual(oldPassword, current);
    if (!oldOk) throw unauthorized("Old password is wrong");
    if (oldPassword === newPassword) throw badRequest("New password must differ from the old one");
    await storage.putSetting(SETTING_ADMIN_HASH, await hashKey(sessionSecret(c.env), newPassword));
    return c.json({ ok: true, result: { changed: true } });
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
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const storage = createStorage(c.env);
    const body = (await c.req.json().catch(() => null)) as { name?: string; description?: string } | null;
    const name = body?.name;
    if (!name || !APP_NAME_PATTERN.test(name)) throw badRequest("name must match ^[a-z0-9][a-z0-9_-]{0,39}$");
    const description = body?.description?.trim();
    if (description !== undefined && (description.length > 200 || description.length < 1)) {
      throw badRequest("description must be 1–200 characters");
    }
    if ((await storage.listApps()).length >= MAX_APPS) throw forbidden(`Max ${MAX_APPS} apps (free-tier guard)`);
    const { app, api_key } = await createApp(storage, sessionSecret(c.env), name, description || undefined);
    return c.json({ ok: true, result: { ...app, api_key } }); // key shown ONCE
  });

  app.get("/v1/admin/apps", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const storage = createStorage(c.env);
    const rows = await storage.listApps();
    return c.json({ ok: true, result: { apps: rows.map(toPublic) } });
  });

  app.get("/v1/admin/apps/:id", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const row = await getApp(createStorage(c.env), c.req.param("id"));
    return c.json({ ok: true, result: toPublic(row) });
  });

  app.post("/v1/admin/apps/:id/rotate-key", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const storage = createStorage(c.env);
    // returns the new key (shown once) + the full app so the detail page re-renders
    const rotated = await rotateKey(storage, sessionSecret(c.env), c.req.param("id"));
    return c.json({ ok: true, result: rotated });
  });

  app.post("/v1/admin/apps/:id/suspend", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const app = await setStatus(createStorage(c.env), c.req.param("id"), "suspended");
    return c.json({ ok: true, result: app });
  });

  app.post("/v1/admin/apps/:id/resume", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const app = await setStatus(createStorage(c.env), c.req.param("id"), "active");
    return c.json({ ok: true, result: app });
  });

  app.delete("/v1/admin/apps/:id", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const app = await softDelete(createStorage(c.env), c.req.param("id"));
    return c.json({ ok: true, result: app });
  });

  // alias for dashboard bundles that POST to /delete (soft delete, same contract)
  app.post("/v1/admin/apps/:id/delete", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const app = await softDelete(createStorage(c.env), c.req.param("id"));
    return c.json({ ok: true, result: app });
  });

  // live usage: limiter counters (peek, no consumption) + storage sizes
  app.get("/v1/admin/apps/:id/usage", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const storage = createStorage(c.env);
    const row = await getApp(storage, c.req.param("id"));
    const counts = await peekUsage(c.env, row.appId);
    const find = (key: string) => counts.find((x) => x.key === key)?.count ?? 0;
    const limits: Array<{ name: string; used: number; limit: number }> = [
      { name: "total", used: find(row.appId), limit: RATE_TOTAL_PER_APP },
      { name: "writes", used: find(`${row.appId}:write`), limit: RATE_WRITES_PER_APP },
      { name: "reads", used: find(`${row.appId}:read`), limit: RATE_READS_PER_APP },
      { name: "platform", used: find("platform:all"), limit: RATE_PLATFORM },
    ];
    const now = Date.now();
    const sizes: Array<{ bytes: number; items: number }> = [];
    for (const t of row.tables) {
      const physical = physicalName(row.appId, t);
      const cached = storageCache.get(physical);
      let size = cached && now - cached.at < STORAGE_CACHE_TTL_MS ? cached.data : null;
      if (!size) {
        size = await storage.storageSize(physical).catch(() => null);
        if (size) storageCache.set(physical, { at: now, data: size });
      }
      if (size) sizes.push(size);
    }
    return c.json({
      ok: true,
      result: {
        app_id: row.appId,
        window_seconds: 60,
        requests: {
          total: { used: limits[0].used, limit: limits[0].limit, remaining: Math.max(0, limits[0].limit - limits[0].used) },
          writes: { used: limits[1].used, limit: limits[1].limit, remaining: Math.max(0, limits[1].limit - limits[1].used) },
          reads: { used: limits[2].used, limit: limits[2].limit, remaining: Math.max(0, limits[2].limit - limits[2].used) },
          platform: { used: limits[3].used, limit: limits[3].limit, remaining: Math.max(0, limits[3].limit - limits[3].used) },
        },
        storage: {
          bytes: sizes.reduce((a, s) => a + s.bytes, 0),
          items: sizes.reduce((a, s) => a + s.items, 0),
          tables: row.tables.length,
          sampled_at: Math.floor(now / 1000),
        },
      },
    });
  });

  // view the RAW key inside the recovery window (encrypted at rest, hash otherwise)
  app.post("/v1/admin/apps/:id/view-key", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const row = await getApp(createStorage(c.env), c.req.param("id"));
    if (!row.keyCipher || !row.keyCipherUntil || row.keyCipherUntil < Math.floor(Date.now() / 1000)) {
      throw forbidden("Key recovery window expired — rotate to issue a new key");
    }
    const apiKey = await decryptKey(sessionSecret(c.env), row.keyCipher);
    if (!apiKey) throw forbidden("Key recovery failed — rotate to issue a new key");
    return c.json({ ok: true, result: { app_id: row.appId, api_key: apiKey, recoverable_until: row.keyCipherUntil } });
  });

  app.post("/v1/admin/apps/:id/recover", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const app = await recover(createStorage(c.env), c.req.param("id"));
    return c.json({ ok: true, result: app });
  });

  app.post("/v1/admin/apps/:id/force-delete", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const storage = createStorage(c.env);
    const id = c.req.param("id");
    await forceDelete(storage, id);
    return c.json({ ok: true, result: { deleted: true } });
  });

  // lazy purge on admin list (belt-and-suspenders to the cron trigger)
  app.get("/v1/admin/purge/run", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const n = await purgeDue(createStorage(c.env), Math.floor(Date.now() / 1000), 5);
    return c.json({ ok: true, result: { finalized: n } });
  });
}

function sessionTokenOf(c: { req: { header(name: string): string | undefined } }): string | undefined {
  // 1) Authorization: Bearer <token> (SPA token channel — works when third-party cookies are blocked)
  const auth = c.req.header("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer) return bearer[1].trim();
  // 2) X-Rodex-Session header (fallback token channel)
  const x = c.req.header("x-rodex-session");
  if (x) return x.trim();
  // 3) rodex_session cookie
  const raw = c.req.header("cookie") || "";
  const m = /rodex_session=([^;]+)/.exec(raw);
  return m ? m[1] : undefined;
}

async function verifySessionLoose(c: { env: Env; req: { header(name: string): string | undefined } }) {
  const token = sessionTokenOf(c);
  if (!token) return null;
  return requireSession(sessionSecret(c.env), token).catch(() => null);
}