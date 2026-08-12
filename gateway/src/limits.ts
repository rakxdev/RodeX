/**
 * limits.ts — ALL hard caps in one place. Rationale for every number:
 * see docs/rate-limits.md and contract/rodex-contract.json.
 */
import { LIMITS, NORMAL_PROFILE as GENERATED_NORMAL_PROFILE, PERFORMANCE_PROFILE as GENERATED_PERFORMANCE_PROFILE } from "./generated/contract";

/** Max JSON bytes an app may PUT/UPDATE in one item. */
export const MAX_ITEM_BYTES = LIMITS.maxItemBytes;
export const ITEM_BYTES = MAX_ITEM_BYTES; // alias for readability in tests

/** Max JSON body the gateway will parse (1 MB — comfortably under CF's 100 MB). */
export const MAX_REQUEST_BYTES = LIMITS.maxRequestBytes;

/** Max items returned by one query. */
export const MAX_QUERY_LIMIT = LIMITS.maxQueryLimit;

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
//
// TWO CAPACITY PROFILES (docs/capacity.md):
//   NORMAL      — generous, wall-free for realistic workloads, $0 free tier
//   PERFORMANCE — guardrails only (on-demand billing; runaway-script backstop)
// gateAppRequest/gateMCPRequest pick the profile from the platform setting
// `capacity_mode` (worker-side 30 s cache).
export interface RateProfile {
  totalPerApp: number;
  writesPerApp: number;
  readsPerApp: number;
  platform: number;
  mcpTotal: number;
  mcpWrites: number;
  mcpReads: number;
}

// NORMAL = the PROVISIONED free tier made honest: the account ceiling is
// 25 WCU + 25 RCU per second (1 500 write-units/min + 1 500 read-units/min
// shared by ALL tables). Per-app budgets take ~half the pool with margin:
// 800 units/min ≈ 13/s — bursts ride AWS burst-credit (~5 min headroom).
export const NORMAL_PROFILE: RateProfile = { ...GENERATED_NORMAL_PROFILE };

export const PERFORMANCE_PROFILE: RateProfile = { ...GENERATED_PERFORMANCE_PROFILE };

/** Internal test profile — seeded by the test suite only (capacity_mode=test). */
export const TEST_PROFILE: RateProfile = {
  totalPerApp: 600,
  writesPerApp: 60,
  readsPerApp: 240,
  platform: 1_000,
  mcpTotal: 600,
  mcpWrites: 60,
  mcpReads: 240,
};

// Backward-compat aliases (default profile = NORMAL)
export const RATE_TOTAL_PER_APP = NORMAL_PROFILE.totalPerApp;
export const RATE_WRITES_PER_APP = NORMAL_PROFILE.writesPerApp;
export const RATE_READS_PER_APP = NORMAL_PROFILE.readsPerApp;
export const RATE_PLATFORM = NORMAL_PROFILE.platform;
export const RATE_ADMIN = LIMITS.adminRequestsPerMinute; // console surface (unchanged in both modes)

export const RATE_WINDOW_SECONDS = 60;

// ── MCP (universal master-key interface) budgets ─────────────────────────────
// Platform-wide budgets for the /mcp surface, counted by the SAME single-point
// RateLimiterDO (keys mcp:total / mcp:write / mcp:read). Separate from the
// per-app pools so agents can never starve an app's budget (or vice versa).
export const MCP_RATE_TOTAL = NORMAL_PROFILE.mcpTotal;
export const MCP_RATE_WRITES = NORMAL_PROFILE.mcpWrites;
export const MCP_RATE_READS = NORMAL_PROFILE.mcpReads;

// ── MCP master keys ──────────────────────────────────────────────────────────
// Console-managed, hash-only at rest + AES-GCM cipher (viewable ANYTIME — no
// window, founder decision). No rotation endpoint by design (delete + create).
export const MCP_KEY_PREFIX = "rok_mcp_";
export const MCP_KEY_ID_PREFIX = "mcpk_";
export const MCP_KEY_NAME_MAX = 40;
export const MCP_KEY_DESC_MAX = 200;

// ── per-table provisioned capacity ──────────────────────────────────────────
// 5 WCU / 5 RCU per data table: sustained 5 writes/s + 5 reads/s per table,
// well above the per-app budgets (800 write-units/min ≈ 13/s, NORMAL). The always-free pool
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

/** DynamoDB's exact write-charge rule: every row rounds UP to whole KBs, min 1.
 * 1 unit = 1 WCU of the free tier's 25/s (docs/rate-limits.md). */
export function wcuUnits(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 1024));
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