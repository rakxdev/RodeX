/**
 * items.ts — /v1/item/* and /v1/query for authenticated apps.
 * All writes are idempotency-safe when `request_id` is supplied.
 */
import type { Context } from "hono";
import { badRequest, forbidden, notFound, HttpError, payloadTooLarge } from "./errors";
import type { Env } from "./env";
import { assertItemSize, IDEMPOTENCY_TTL_SECONDS, PK_MAX_CHARS, SK_MAX_CHARS, wcuUnits, jsonBytes, MAX_ITEM_BYTES } from "./limits";
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
  /** unix seconds — row auto-expires after this (DynamoDB TTL) */
  ttl?: number;
}

/** Strict request-body validation: unknown top-level keys are rejected (never silently ignored). */
export function rejectUnknown(body: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw badRequest(`Unknown field(s): ${unknown.join(", ")} — allowed: ${allowed.join(", ")}`);
  }
}

/** Split app payload into {pk, sk, data}.
 *
 * Two accepted item shapes (both store the payload FLAT):
 *   A) flat      — item: { pk, sk, ...fields }      (classic, unchanged)
 *   B) envelope  — item: { pk, sk, data: {...} }    (canonical; matches what reads return)
 * A `data` key inside `item` selects the envelope; mixing it with flat fields
 * is rejected. sk defaults to the "~" sentinel in both forms. */
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
  if ("data" in it) {
    // envelope form — the payload is item.data, stored flat
    const extra = Object.keys(it).filter((k) => k !== "pk" && k !== "sk" && k !== "data" && k !== "ttl");
    if (extra.length > 0) {
      throw badRequest(
        `item.data envelope cannot be mixed with flat fields (${extra.join(", ")}) — use either item:{pk,sk,data} or item:{pk,sk,...fields}, not both`,
      );
    }
    const data = it["data"];
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw badRequest("item.data must be an object");
    return { pk, sk, data: JSON.stringify(data), ...ttlOf(it) };
  }
  const { pk: _p, sk: _s, ttl: _t, ...rest } = it;
  const data = JSON.stringify(rest);
  return { pk, sk, data, ...ttlOf(it) };
}

/** Optional `ttl` (unix seconds, integer) — row expires after this. */
function ttlOf(it: Record<string, unknown>): { ttl?: number } {
  const raw = it["ttl"];
  if (raw === undefined) return {};
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw badRequest("item.ttl must be a positive integer (unix seconds)");
  }
  return { ttl: raw };
}

function itemToJson(it: StoredItem): Record<string, unknown> {
  const out: Record<string, unknown> = {
    pk: it.pk,
    sk: it.sk,
    data: JSON.parse(it.data),
    version: it.v,
    created: it.created,
    updated: it.updated,
  };
  if (it.ttl !== undefined) out.ttl = it.ttl;
  if (it.counter !== undefined) out.counter = it.counter;
  // full stored representation incl. keys — the number DynamoDB charges on
  out["bytes"] = itemStoredBytes(it);
  return out;
}

/** Full stored representation size (pk+sk+data wrapper) — DynamoDB sizes the whole item. */
export function itemStoredBytes(it: Pick<StoredItem, "pk" | "sk" | "data">): number {
  return jsonBytes({ pk: it.pk, sk: it.sk, data: JSON.parse(it.data) });
}

/** Write-cost of a parsed item in WCU units (min 1, rounded up per DynamoDB). */
export function itemWcu(it: Pick<StoredItem, "pk" | "sk" | "data">): number {
  return wcuUnits(itemStoredBytes(it));
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

/** Total serialized bytes per batch call — a batch can never burst the WCU ceiling. */
export const BATCH_MAX_BYTES = MAX_ITEM_BYTES;

export async function handlePut(ctx: AppContext, body: Record<string, unknown>) {
  rejectUnknown(body, ["table", "item", "request_id", "overwrite"]);
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  const requestId = body["request_id"] as string | undefined;
  const item = parseItem(body["item"]);
  assertItemSize(JSON.parse(item.data));
  // budget is WCU-honest: this row costs max(1, ceil(bytes/1024)) write-units
  await gateAppRequest(ctx.env, ctx.appId, "write", itemWcu(item));
  const overwrite = body["overwrite"] === true;
  const physical = physicalName(ctx.appId, table);
  return withIdem(ctx.storage, requestId, async () => {
    await ctx.storage.ensureTable(physical); // no-op if exists
    const stored = await ctx.storage.putItem(physical, item, { overwrite });
    return { ok: true as const, result: { ...itemToJson(stored), table } };
  });
}

export async function handleGet(ctx: AppContext, body: Record<string, unknown>) {
  rejectUnknown(body, ["table", "pk", "sk", "strong"]);
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
  rejectUnknown(body, ["table", "pk", "sk", "data", "expected_version", "request_id"]);
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  const requestId = body["request_id"] as string | undefined;
  const pk = reqString(body, "pk");
  const sk = reqString(body, "sk");
  const data = body["data"];
  assertItemSize(data);
  // updates replace the payload — budget by the new row's write cost
  await gateAppRequest(ctx.env, ctx.appId, "write", wcuUnits(jsonBytes({ pk, sk, data })));
  const expectedVersion = reqNumber(body, "expected_version");
  const physical = physicalName(ctx.appId, table);
  return withIdem(ctx.storage, requestId, async () => {
    await ctx.storage.ensureTable(physical);
    const updated = await ctx.storage.updateItem(physical, pk, sk, JSON.stringify(data), expectedVersion);
    return { ok: true as const, result: itemToJson(updated) };
  });
}

export async function handleDelete(ctx: AppContext, body: Record<string, unknown>) {
  rejectUnknown(body, ["table", "pk", "sk", "expected_version", "request_id"]);
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

export const BATCH_MAX_ITEMS = 50;

export async function handleBatchGet(ctx: AppContext, body: Record<string, unknown>) {
  rejectUnknown(body, ["table", "keys", "strong"]);
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  const keysRaw = body["keys"];
  if (!Array.isArray(keysRaw) || keysRaw.length === 0) {
    throw badRequest(`Field 'keys' must be a non-empty array of {pk, sk?} (max ${BATCH_MAX_ITEMS})`);
  }
  if (keysRaw.length > BATCH_MAX_ITEMS) {
    throw badRequest(`Batch too large: ${keysRaw.length} keys (max ${BATCH_MAX_ITEMS}) — split into multiple calls`);
  }
  // validate ALL keys first — any bad key rejects the whole call
  const keys: Array<{ pk: string; sk: string }> = keysRaw.map((raw, i) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw badRequest(`keys[${i}] must be an object {pk, sk?}`);
    const pk = (raw as Record<string, unknown>)["pk"];
    if (typeof pk !== "string" || pk.length === 0) throw badRequest(`keys[${i}].pk is required (non-empty string)`);
    if (pk.length > PK_MAX_CHARS) throw badRequest(`keys[${i}].pk too long (max ${PK_MAX_CHARS} chars)`);
    const skRaw = (raw as Record<string, unknown>)["sk"];
    const sk = skRaw === undefined ? "~" : skRaw;
    if (typeof sk !== "string" || sk.length === 0) throw badRequest(`keys[${i}].sk must be a non-empty string`);
    if (sk.length > SK_MAX_CHARS) throw badRequest(`keys[${i}].sk too long (max ${SK_MAX_CHARS} chars)`);
    return { pk, sk };
  });
  const strong = body["strong"] === true;
  // N keys consume N reads (reserved upfront)
  await gateAppRequest(ctx.env, ctx.appId, "read", keys.length);
  const physical = physicalName(ctx.appId, table);
  const found = await ctx.storage.getItems(physical, keys, strong);
  const missing: Array<{ pk: string; sk: string }> = [];
  const items: Array<Record<string, unknown>> = [];
  keys.forEach((k, i) => {
    const it = found[i];
    if (!it) missing.push(k);
    else items.push(itemToJson(it));
  });
  return { ok: true as const, result: { table, requested: keys.length, found: items, missing } };
}

export async function handleIncrement(ctx: AppContext, body: Record<string, unknown>) {
  rejectUnknown(body, ["table", "pk", "sk", "by"]);
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  const pk = reqString(body, "pk");
  if (pk.length > PK_MAX_CHARS) throw badRequest(`pk too long (max ${PK_MAX_CHARS} chars)`);
  const raw = body["sk"];
  const sk = raw === undefined ? "~" : reqString(body, "sk");
  const byRaw = body["by"];
  const by = byRaw === undefined ? 1 : byRaw;
  if (typeof by !== "number" || !Number.isInteger(by)) throw badRequest("by must be an integer (default 1; negative decrements)");
  await gateAppRequest(ctx.env, ctx.appId, "write");
  const physical = physicalName(ctx.appId, table);
  await ctx.storage.ensureTable(physical);
  const item = await ctx.storage.increment(physical, pk, sk, by);
  return { ok: true as const, result: { ...itemToJson(item), table, incremented_by: by } };
}

export async function handleBatchPut(ctx: AppContext, body: Record<string, unknown>) {
  rejectUnknown(body, ["table", "items", "overwrite", "request_id"]);
  const table = reqString(body, "table");
  assertOwned(ctx, table);
  const itemsRaw = body["items"];
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    throw badRequest(`Field 'items' must be a non-empty array of items (max ${BATCH_MAX_ITEMS})`);
  }
  if (itemsRaw.length > BATCH_MAX_ITEMS) {
    throw badRequest(`Batch too large: ${itemsRaw.length} items (max ${BATCH_MAX_ITEMS}) — split into multiple calls`);
  }
  // Validate ALL items before ANY write: a single bad item rejects the whole batch (nothing written).
  const parsed: ParsedItem[] = itemsRaw.map((it, i) => {
    try {
      const p = parseItem(it);
      assertItemSize(JSON.parse(p.data));
      return p;
    } catch (err) {
      if (err instanceof HttpError) {
        throw new HttpError(err.status, `items[${i}]: ${err.message}`, err.retryAfter);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw badRequest(`items[${i}]: ${msg}`);
    }
  });
  // BYTE CAP: total serialized bytes must fit one call — a batch can never
  // burst the WCU ceiling (≈1 max-size row per call for big rows).
  const totalBytes = parsed.reduce((sum, p) => sum + itemStoredBytes(p), 0);
  if (totalBytes > BATCH_MAX_BYTES) {
    throw payloadTooLarge(
      `Batch too large in bytes: ${totalBytes} B total (max ${BATCH_MAX_BYTES} B) — large rows: 1 row per call. Split into smaller calls`,
    );
  }
  const requestId = body["request_id"] as string | undefined;
  const overwrite = body["overwrite"] === true;
  // Reserve the full write budget upfront: each row costs max(1, ceil(bytes/1024)) units.
  const units = parsed.reduce((sum, p) => sum + itemWcu(p), 0);
  await gateAppRequest(ctx.env, ctx.appId, "write", units);
  const physical = physicalName(ctx.appId, table);
  return withIdem(ctx.storage, requestId, async () => {
    await ctx.storage.ensureTable(physical);
    const items: Array<Record<string, unknown>> = [];
    let written = 0;
    for (const item of parsed) {
      try {
        const stored = await ctx.storage.putItem(physical, item, { overwrite });
        written += 1;
        items.push({ pk: item.pk, sk: item.sk, ok: true, item: { ...itemToJson(stored), table } });
      } catch (err) {
        items.push({
          pk: item.pk,
          sk: item.sk,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const allOk = written === parsed.length;
    return { ok: true as const, result: { table, requested: parsed.length, written, all_ok: allOk, items } };
  });
}

export async function handleQuery(ctx: AppContext, body: Record<string, unknown>) {
  rejectUnknown(body, ["table", "pk", "sk_prefix", "limit", "start_key"]);
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