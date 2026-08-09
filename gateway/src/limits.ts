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

/** Max tables purged per cron run (keeps a run inside free-plan subrequest/CPU budgets). */
export const PURGE_MAX_TABLES_PER_RUN = 5;

/** Sanity guard on number of apps a free account should host. */
export const MAX_APPS = 100;

/** Byte size of a JSON value (for size gates). */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** True when the JSON-serialized item fits our write cap. */
export function itemFits(value: unknown): boolean {
  return jsonBytes(value) <= ITEM_BYTES;
}