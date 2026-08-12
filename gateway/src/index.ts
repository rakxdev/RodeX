/**
 * index.ts — RodeX gateway v1.
 * App API: /v1/item/*, /v1/query, /v1/table/*, /v1/tables
 * Admin API: /v1/admin/* (password or GitHub OAuth session — T6)
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { registerAdminRoutes } from "./admin";
import { processCapacityChunk } from "./capacity";
import { registerMcpKeyRoutes } from "./mcpkeys";
import { authMcpKey, createMcpRoute } from "./mcp";
import { gateMCPTotal } from "./rate";
import { HttpError, gatewayError } from "./errors";
import type { Env } from "./env";
import { dashboardOrigin, sessionSecret } from "./env";
import { completeGitHubOAuth, startGitHubOAuth } from "./oauth";
import { authenticateApp, purgeDue } from "./registry";
import { createStorage } from "./storage";
import {
  handleDelete,
  handleGet,
  handleBatchPut,
  handleBatchGet,
  handleIncrement,
  handlePut,
  handleQuery,
  handleUpdate,
  parseBody,
  type AppContext,
} from "./items";
import { handleCreateTable, handleDeleteTable, handleListTables } from "./tables";

const app = new Hono<{ Bindings: Env }>();

// ── CORS (dashboard lives on another origin; /mcp handles its own CORS) ─────
app.use("*", async (c, next) => {
  await next();
  if (new URL(c.req.url).pathname === "/mcp") return; // MCP handler owns CORS
  const origin = dashboardOrigin(c.env);
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, X-App-Id, X-Api-Key, X-Request-Id, Authorization",
  );
  c.header("Vary", "Origin");
});

// ── security headers (every response) ───────────────────────────────────────
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (new URL(c.req.url).protocol === "https:") {
    c.header("Strict-Transport-Security", "max-age=15552000");
  }
});

// ── admin CSRF defense-in-depth: when a browser sends Origin, it must be ours ─
app.use("/v1/admin/*", async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && origin !== dashboardOrigin(c.env)) {
    throw new HttpError(403, "Cross-origin request rejected");
  }
  await next();
});

app.options("*", (c) => c.body(null, 204));

// ── strict JSON bodies on POST (415 otherwise) ───────────────────────────────
// Only enforced when a body is actually present — bodyless POSTs (e.g. logout)
// must not be rejected. Content-Type-missing + body → 415; wrong Content-Type
// → 415; bodyless → pass.
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const ct = (c.req.header("content-type") || "").toLowerCase();
    if (ct) {
      if (!ct.startsWith("application/json")) {
        throw new HttpError(415, "Content-Type must be application/json");
      }
    } else {
      // No content-type header: reject only if there is a real body (some
      // runtimes omit content-length, so peek at a clone without consuming).
      const cl = Number(c.req.header("content-length") || "0");
      let hasBody = cl > 0 || /chunked/i.test(c.req.header("transfer-encoding") || "");
      if (!hasBody) {
        try {
          await c.req.raw.clone().text();
        } catch {
          hasBody = true;
        }
      }
      if (hasBody) throw new HttpError(415, "Content-Type must be application/json");
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
registerMcpKeyRoutes(app);

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

app.post("/v1/batch/put", async (c) => {
  const ctx = await appCtx(c);
  const { body, replay } = await handleBatchPut(ctx, await parseBody(c));
  return c.newResponse(body, 200, { "Content-Type": "application/json", ...(replay ? { "X-Idempotent-Replay": "true" } : {}) });
});

app.post("/v1/batch/get", async (c) => {
  const ctx = await appCtx(c);
  return c.json(await handleBatchGet(ctx, await parseBody(c)));
});

app.post("/v1/item/increment", async (c) => {
  const ctx = await appCtx(c);
  return c.json(await handleIncrement(ctx, await parseBody(c)));
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

app.post("/v1/table/delete", async (c) => {
  const ctx = await appCtx(c);
  const { body, replay } = await handleDeleteTable(ctx, await parseBody(c));
  return c.newResponse(body, 200, { "Content-Type": "application/json", ...(replay ? { "X-Idempotent-Replay": "true" } : {}) });
});

app.get("/v1/tables", async (c) => {
  const ctx = await appCtx(c);
  return c.json(await handleListTables(ctx));
});

// ── MCP (master-key universal interface, Streamable HTTP at /mcp) ───────────
app.all("/mcp", async (c) => {
  const key = await authMcpKey(c.env, c.req.raw);
  if (!key) {
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized — send Authorization: Bearer rok_mcp_<key>" } },
      401,
    );
  }
  try {
    await gateMCPTotal(c.env);
  } catch (e) {
    // speak JSON-RPC at the MCP door (the REST error shape would confuse clients)
    const err = e as { toJson?: () => { error?: { code: number; message: string; retry_after?: number } } };
    const j = err.toJson?.();
    if (j?.error?.code === 429) {
      const retry = j.error.retry_after ?? 1;
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32000, message: j.error.message } },
        429,
        { "Retry-After": String(retry) },
      );
    }
    throw e;
  }
  const handler = createMcpRoute(c.env);
  return handler(c.req.raw, c.env, c.executionCtx as unknown as Parameters<typeof handler>[2]);
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

// Durable Object required by the strict rate limiter (wrangler [[durable_objects.bindings]])
export { RateLimiterDO } from "./rate-do";

export default {
  fetch: app.fetch,
  async scheduled(_ctrl: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const purged = await runPurge(env);
    if (purged > 0) console.log(`rodex purge: finalized ${purged} app(s)`);
    // capacity-mode switches run chunk by chunk (per-request subrequest ceiling)
    const cap = await processCapacityChunk(env, 12);
    if (cap.processed > 0 && !cap.done) console.log(`rodex capacity: switched ${cap.processed} table(s), continuing`);
    if (cap.done && cap.processed > 0) console.log("rodex capacity: switch complete");
  },
} satisfies ExportedHandler<Env>;