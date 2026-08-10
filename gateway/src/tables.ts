/**
 * tables.ts — /v1/table/* and /v1/tables for authenticated apps.
 * Isolation invariant: physical table names are ALWAYS app_<appId>_<logical>;
 * the app never supplies raw table names.
 */
import { badRequest, forbidden } from "./errors";
import { TABLE_NAME_PATTERN } from "./limits";
import { gateAppRequest } from "./rate";
import { getApp, physicalName } from "./registry";
import { withIdem } from "./items";
import type { AppContext } from "./items";

export async function handleCreateTable(ctx: AppContext, body: Record<string, unknown>) {
  await gateAppRequest(ctx.env, ctx.appId, "write");
  const requestId = body["request_id"] as string | undefined;
  const name = body["name"];
  if (typeof name !== "string" || !TABLE_NAME_PATTERN.test(name)) {
    throw badRequest("Table name must match ^[a-z0-9][a-z0-9_-]{0,41}$");
  }
  const physical = physicalName(ctx.appId, name);
  return withIdem(ctx.storage, requestId, async () => {
    await ctx.storage.ensureTable(physical); // 409 if already exists (from AWS) or creates
    try {
      await ctx.storage.addTableToApp(ctx.appId, name);
    } catch (e) {
      // rollback the physical table so registry and storage stay consistent
      try {
        await ctx.storage.dropTable(physical);
      } catch {
        /* best effort */
      }
      throw e;
    }
    return { ok: true as const, result: { table: name, status: "ready" } };
  });
}

export async function handleListTables(ctx: AppContext) {
  await gateAppRequest(ctx.env, ctx.appId, "read");
  const row = await getApp(ctx.storage, ctx.appId);
  return { ok: true as const, result: { tables: row.tables.map((t) => ({ name: t })) } };
}

/**
 * POST /v1/table/delete — drop one owned table (data is GONE).
 * Exact retries are idempotent via request_id (withIdem replays the stored
 * response); a fresh call after deletion returns 404 — treat as already gone.
 */
export async function handleDeleteTable(ctx: AppContext, body: Record<string, unknown>) {
  await gateAppRequest(ctx.env, ctx.appId, "write");
  const requestId = body["request_id"] as string | undefined;
  const name = body["name"];
  if (typeof name !== "string" || !TABLE_NAME_PATTERN.test(name)) {
    throw badRequest("Table name must match ^[a-z0-9][a-z0-9_-]{0,41}$");
  }
  const physical = physicalName(ctx.appId, name);
  return withIdem(ctx.storage, requestId, async () => {
    if (!ctx.ownedTables.has(name)) {
      throw forbidden(`App does not own table (${name})`); // no existence leak
    }
    // drop the physical table first (tolerate already-gone), then fix registry
    try {
      await ctx.storage.dropTable(physical);
    } catch (e) {
      const err = e as { status?: number };
      if (err.status !== 404) throw e; // already deleted → still clean registry below
    }
    await ctx.storage.removeTableFromApp(ctx.appId, name);
    return { ok: true as const, result: { table: name, status: "deleted" } };
  });
}