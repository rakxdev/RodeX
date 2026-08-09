/**
 * index.ts — RodeX gateway v1.
 * App API: /v1/item/*, /v1/query, /v1/table/*, /v1/tables
 * Admin API: /v1/admin/* (password or GitHub OAuth session — T6)
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { registerAdminRoutes } from "./admin";
import { HttpError, gatewayError } from "./errors";
import type { Env } from "./env";
import { dashboardOrigin, sessionSecret } from "./env";
import { completeGitHubOAuth, startGitHubOAuth } from "./oauth";
import { authenticateApp, purgeDue } from "./registry";
import { createStorage } from "./storage";
import {
  handleDelete,
  handleGet,
  handlePut,
  handleQuery,
  handleUpdate,
  parseBody,
  type AppContext,
} from "./items";
import { handleCreateTable, handleListTables } from "./tables";

const app = new Hono<{ Bindings: Env }>();

// ── CORS (dashboard lives on another origin) ────────────────────────────────
app.use("*", async (c, next) => {
  await next();
  const origin = dashboardOrigin(c.env);
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, X-App-Id, X-Api-Key, X-Request-Id, Authorization",
  );
  c.header("Vary", "Origin");
});

app.options("*", (c) => c.body(null, 204));

// ── strict JSON bodies on POST (415 otherwise) ───────────────────────────────
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const ct = (c.req.header("content-type") || "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      throw new HttpError(415, "Content-Type must be application/json");
    }
  }
  await next();
});

// ── public ───────────────────────────────────────────────────────────────────
app.get("/v1/health", (c) => c.json({ ok: true, service: "rodex-gateway", version: 1 }));

// ── admin auth (GitHub OAuth + password) ────────────────────────────────────
app.get("/v1/auth/github/start", (c) => startGitHubOAuth(c));
app.get("/v1/auth/github/callback", async (c) => completeGitHubOAuth(c));
registerAdminRoutes(app);

// ── app API ──────────────────────────────────────────────────────────────────
async function appCtx(c: Context<{ Bindings: Env }>): Promise<AppContext> {
  const env = c.env;
  const storage = createStorage(env);
  const row = await authenticateApp(storage, sessionSecret(env), c.req.header("X-App-Id"), c.req.header("X-Api-Key"));
  return { env, appId: row.appId, storage, ownedTables: new Set(row.tables) };
}

app.post("/v1/item/put", async (c) => {
  const ctx = await appCtx(c);
  const { body, replay } = await handlePut(ctx, await parseBody(c));
  return c.newResponse(body, 200, { "Content-Type": "application/json", ...(replay ? { "X-Idempotent-Replay": "true" } : {}) });
});

app.post("/v1/item/get", async (c) => {
  const ctx = await appCtx(c);
  return c.json(await handleGet(ctx, await parseBody(c)));
});

app.post("/v1/item/update", async (c) => {
  const ctx = await appCtx(c);
  const { body, replay } = await handleUpdate(ctx, await parseBody(c));
  return c.newResponse(body, 200, { "Content-Type": "application/json", ...(replay ? { "X-Idempotent-Replay": "true" } : {}) });
});

app.post("/v1/item/delete", async (c) => {
  const ctx = await appCtx(c);
  const { body, replay } = await handleDelete(ctx, await parseBody(c));
  return c.newResponse(body, 200, { "Content-Type": "application/json", ...(replay ? { "X-Idempotent-Replay": "true" } : {}) });
});

app.post("/v1/query", async (c) => {
  const ctx = await appCtx(c);
  return c.json(await handleQuery(ctx, await parseBody(c)));
});

app.post("/v1/table/create", async (c) => {
  const ctx = await appCtx(c);
  const { body, replay } = await handleCreateTable(ctx, await parseBody(c));
  return c.newResponse(body, 200, { "Content-Type": "application/json", ...(replay ? { "X-Idempotent-Replay": "true" } : {}) });
});

app.get("/v1/tables", async (c) => {
  const ctx = await appCtx(c);
  return c.json(await handleListTables(ctx));
});

// ── error handling ───────────────────────────────────────────────────────────
app.notFound((c) => c.json({ ok: false, error: { code: 404, message: "Not found" } }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.toJson(), err.status as 400);
  }
  console.error("unhandled error", err);
  return c.json(gatewayError().toJson(), 502);
});

// ── cron: finalize scheduled deletions ───────────────────────────────────────
export async function runPurge(env: Env): Promise<number> {
  const storage = createStorage(env);
  return purgeDue(storage, Math.floor(Date.now() / 1000), 5);
}

export default {
  fetch: app.fetch,
  async scheduled(_ctrl: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const purged = await runPurge(env);
    if (purged > 0) console.log(`rodex purge: finalized ${purged} app(s)`);
  },
} satisfies ExportedHandler<Env>;