/**
 * items.ts — /v1/item/* and /v1/query for authenticated apps.
 * All writes are idempotency-safe when `request_id` is supplied.
 */
import type { Context } from "hono";
import { badRequest, forbidden, notFound } from "./errors";
import type { Env } from "./env";
import { assertItemSize, IDEMPOTENCY_TTL_SECONDS, PK_MAX_CHARS, SK_MAX_CHARS } from "./limits";
import { gateAppRequest } from "./rate";
import { physicalName } from "./registry";
import type { Storage, StoredItem } from "./storage";

export interface AppContext {
  env: Env;
  appId: string;
  storage: Storage;
  /** logical tables this app owns (registry snapshot at auth time) */
  ownedTables: Set<string>;
}

/** Isolation invariant: 403 before any storage call when the app doesn't own the table. */
export function assertOwned(ctx: AppContext, logical: string): void {
  if (!ctx.ownedTables.has(logical)) {
    throw forbidden(`App does not own table '${logical}'`);
  }
}

/** Parse JSON body with a sane size cap. */
export async function parseBody(c: Context<{ Bindings: Env }>): Promise<Record<string, unknown>> {
  const len = Number(c.req.header("content-length") || 0);
  if (len > 1_000_000) throw badRequest("Request body too large (max 1 MB)");
  let raw: string;
  try {
    raw = await c.req.text();
  } catch {
    throw badRequest("Could not read request body");
  }
  if (raw.length > 1_000_000) throw badRequest("Request body too large (max 1 MB)");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw badRequest("Body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function reqString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || v.length === 0) throw badRequest(`Field '${key}' is required (non-empty string)`);
  return v;
}

function reqNumber(body: Record<string, unknown>, key: string): number | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) throw badRequest(`Field '${key}' must be an integer`);
  return v;
}

export interface ParsedItem {
  pk: string;
  sk: string;
  data: string;
}

/** Split app payload into {pk, sk, data}. sk defaults to the "~" sentinel. */
export function parseItem(item: unknown): ParsedItem {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw badRequest("Field 'item' must be an object with at least a 'pk'");
  }
  const it = item as Record<string, unknown>;
  const pk = it["pk"];
  if (typeof pk !== "string" || pk.length === 0) throw badRequest("item.pk is required (non-empty string)");
  if (pk.length > PK_MAX_CHARS) throw badRequest(`item.pk too long (max ${PK_MAX_CHARS} chars)`);
  const skRaw = it["sk"];
  const sk = skRaw === undefined ? "~" : skRaw;
  if (typeof sk !== "string" || sk.length === 0) throw badRequest("item.sk must be a non-empty string");
  if (sk.length > SK_MAX_CHARS) throw badRequest(`item.sk too long (max ${SK_MAX_CHARS} chars)`);
  const { pk: _p, sk: _s, ...rest } = it;
  const data = JSON.stringify(rest);
  return { pk, sk, data };
}

function itemToJson(it: StoredItem): Record<string, unknown> {
  return { pk: it.pk, sk: it.sk, data: JSON.parse(it.data), version: it.v, created: it.created, updated: it.updated };
}

/** Idempotency wrapper: replay returns the stored response body. */
export async function withIdem<T extends { ok: true; result: unknown }>(
  storage: Storage,
  requestId: string | undefined,
  fn: () => Promise<T>,
): Promise<{ body: string; replay: boolean }> {
  if (requestId) {
    const prev = await storage.idemGet(requestId);
    if (prev) return { body: prev, replay: true };
  }
  const result = await fn(); // throws on failure → nothing stored → retry re-executes
  const body = JSON.stringify(result);
  if (requestId) {
    const created = await storage.idemPut(requestId, body, IDEMPOTENCY_TTL_SECONDS);
    if (!created) {
      const prev = await storage.idemGet(requestId);
      if (prev) return { body: prev, replay: true };
    }
  }
  return { body, replay: false };
}

// ── route handlers ───────────────────────────────────────────────────────────

export async function handlePut(ctx: AppContext, body: Record<string, unknown>) {
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  await gateAppRequest(ctx.env, ctx.appId, "write");
  const requestId = body["request_id"] as string | undefined;
  const item = parseItem(body["item"]);
  assertItemSize(JSON.parse(item.data));
  const overwrite = body["overwrite"] === true;
  const physical = physicalName(ctx.appId, table);
  return withIdem(ctx.storage, requestId, async () => {
    await ctx.storage.ensureTable(physical); // no-op if exists
    const stored = await ctx.storage.putItem(physical, item, { overwrite });
    return { ok: true as const, result: { ...itemToJson(stored), table } };
  });
}

export async function handleGet(ctx: AppContext, body: Record<string, unknown>) {
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  await gateAppRequest(ctx.env, ctx.appId, "read");
  const pk = reqString(body, "pk");
  // sk is optional and defaults to the same "~" sentinel put uses
  const raw = body["sk"];
  const sk = raw === undefined || raw === null ? "~" : reqString(body, "sk");
  const strong = body["strong"] === true;
  const item = await ctx.storage.getItem(physicalName(ctx.appId, table), pk, sk, strong);
  if (!item) throw notFound("Item not found");
  return { ok: true as const, result: itemToJson(item) };
}

export async function handleUpdate(ctx: AppContext, body: Record<string, unknown>) {
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  await gateAppRequest(ctx.env, ctx.appId, "write");
  const requestId = body["request_id"] as string | undefined;
  const pk = reqString(body, "pk");
  const sk = reqString(body, "sk");
  const data = body["data"];
  assertItemSize(data);
  const expectedVersion = reqNumber(body, "expected_version");
  const physical = physicalName(ctx.appId, table);
  return withIdem(ctx.storage, requestId, async () => {
    await ctx.storage.ensureTable(physical);
    const updated = await ctx.storage.updateItem(physical, pk, sk, JSON.stringify(data), expectedVersion);
    return { ok: true as const, result: itemToJson(updated) };
  });
}

export async function handleDelete(ctx: AppContext, body: Record<string, unknown>) {
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  await gateAppRequest(ctx.env, ctx.appId, "write");
  const requestId = body["request_id"] as string | undefined;
  const pk = reqString(body, "pk");
  const sk = reqString(body, "sk");
  const expectedVersion = reqNumber(body, "expected_version");
  const physical = physicalName(ctx.appId, table);
  return withIdem(ctx.storage, requestId, async () => {
    await ctx.storage.ensureTable(physical);
    await ctx.storage.deleteItem(physical, pk, sk, expectedVersion);
    return { ok: true as const, result: { deleted: true } };
  });
}

export async function handleQuery(ctx: AppContext, body: Record<string, unknown>) {
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  await gateAppRequest(ctx.env, ctx.appId, "read");
  const pk = reqString(body, "pk");
  const skPrefix = body["sk_prefix"];
  if (skPrefix !== undefined && typeof skPrefix !== "string") throw badRequest("sk_prefix must be a string");
  const limit = reqNumber(body, "limit") ?? 100;
  if (limit < 1 || limit > 100) throw badRequest("limit must be between 1 and 100");
  const startKey = body["start_key"] as string | undefined;
  const out = await ctx.storage.queryItems(physicalName(ctx.appId, table), pk, skPrefix, limit, startKey);
  return {
    ok: true as const,
    result: {
      items: out.items.map(itemToJson),
      has_more: out.hasMore,
      ...(out.startKey ? { next_start_key: out.startKey } : {}),
    },
  };
}