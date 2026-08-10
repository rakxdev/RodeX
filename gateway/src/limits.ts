/**
 * limits.ts — ALL hard caps in one place. Rationale for every number:
 * see docs/rate-limits.md (the math is derived from the free-tier pools).
 */

/** Max JSON bytes an app may PUT/UPDATE in one item.
 *  20 KB = ≤ 20 WCU per write → never throttled on the 25-WCU free pool. */
export const MAX_ITEM_BYTES = 20_000;
export const ITEM_BYTES = MAX_ITEM_BYTES; // alias for readability in tests

/** Max JSON body the gateway will parse (1 MB — comfortably under CF's 100 MB). */
export const MAX_REQUEST_BYTES = 1_000_000;

/** Max items returned by one query. */
export const MAX_QUERY_LIMIT = 100;

/** App display names (not keys): lowercase alnum, 1–40 chars. */
export const APP_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Logical table name an app supplies: the gateway prefixes it with app_<id>_. */
export const TABLE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,41}$/;

/** DynamoDB key value safety caps (documented max is larger; we keep headroom). */
export const PK_MAX_CHARS = 500;
export const SK_MAX_CHARS = 500;

/** Idempotency records live 24 h, then auto-expire (DynamoDB TTL). */
export const IDEMPOTENCY_TTL_SECONDS = 86_400;

/** Soft-delete recovery window (minutes). */
export const SOFT_DELETE_WINDOW_MINUTES = 5;
/** How long a raw API key stays server-side (AES-GCM encrypted) for VIEW-KEY recovery. */
export const KEY_RECOVERY_WINDOW_SECONDS = 48 * 60 * 60;

// ── strict rate budgets (per 60 s window) ───────────────────────────────────
// Enforced by single-point Durable Object counters — the same numbers the
// docs promise: no burst tolerance, no edge lag. See docs/rate-limits.md.
export const RATE_TOTAL_PER_APP = 600; // all requests, per app
export const RATE_WRITES_PER_APP = 120; // put/update/delete
export const RATE_READS_PER_APP = 240; // get/query
export const RATE_PLATFORM = 1000; // shared across ALL apps
export const RATE_ADMIN = 60; // console surface
export const RATE_WINDOW_SECONDS = 60;

// ── per-table provisioned capacity ──────────────────────────────────────────
// 5 WCU / 5 RCU per data table: sustained 5 writes/s + 5 reads/s per table,
// well above the per-app budgets (120 writes/min ≈ 2/s). The always-free pool
// is 25+25 account-wide → up to 5 tables at 5/5 stay free. Existing tables
// are auto-upgraded from the legacy 1/1 on their next touch.
export const TABLE_WCU = 5;
export const TABLE_RCU = 5;

/** Max tables purged per cron run (keeps a run inside free-plan subrequest/CPU budgets). */
export const PURGE_MAX_TABLES_PER_RUN = 5;

/** Sanity guard on number of apps a free account should host. */
export const MAX_APPS = 100;

import { payloadTooLarge } from "./errors";

/** Byte size of a JSON value (for size gates). */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Size gate applied at the API boundary BEFORE any storage call (mock or AWS). */
export function assertItemSize(payload: unknown): void {
  if (jsonBytes(payload) > MAX_ITEM_BYTES) {
    throw payloadTooLarge(`Item exceeds ${MAX_ITEM_BYTES} bytes (free-tier write budget) — see docs/rate-limits.md`);
  }
}

/** True when the JSON-serialized item fits our write cap. */
export function itemFits(value: unknown): boolean {
  return jsonBytes(value) <= ITEM_BYTES;
}