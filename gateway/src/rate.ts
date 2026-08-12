/**
 * rate.ts — STRICT rate limiting.
 *
 * Architecture: single-point counters in a Durable Object (one DO instance
 * per key, single-threaded) — a request is allowed only if EVERY budget it
 * touches still has room. No edge lag, no burst tolerance: the numbers the
 * docs promise are the numbers the gateway enforces, exactly.
 *
 * When the DO binding is absent (dev/tests) a module-level window counter
 * with identical semantics is used.
 */
import { tooManyRequests } from "./errors";
import { NORMAL_PROFILE, PERFORMANCE_PROFILE, TEST_PROFILE, type RateProfile, RATE_ADMIN, RATE_WINDOW_SECONDS } from "./limits";
import type { Env } from "./env";
import { createStorage } from "./storage";

// ── capacity-mode selection (NORMAL / PERFORMANCE) ──────────────────────────
// The platform setting `capacity_mode` picks the budget profile. Cached 30 s
// worker-side: mode switches take minutes at AWS anyway, so a 30 s lag is
// harmless. Cache lives per isolate and re-reads after TTL.
const MODE_CACHE_TTL_MS = 30_000;
let modeCache: { mode: "normal" | "performance"; at: number } | null = null;

export type CapacityMode = "normal" | "performance";

export async function capacityModeOf(env: Env): Promise<CapacityMode> {
  const now = Date.now();
  if (modeCache && now - modeCache.at < MODE_CACHE_TTL_MS) return modeCache.mode;
  let mode: CapacityMode = "normal";
  try {
    const stored = await createStorage(env).getSetting("capacity_mode");
    if (stored === "performance") mode = "performance";
  } catch {
    // settings read failed → behave conservatively (normal)
  }
  modeCache = { mode, at: now };
  return mode;
}

/** Tests only: reset the mode cache (unit tests set the setting directly). */
export function resetModeCache(): void {
  modeCache = null;
}

async function profileFor(env: Env): Promise<RateProfile> {
  const mode = await capacityModeOf(env);
  if (mode === "performance") return PERFORMANCE_PROFILE;
  // internal test profile — seeded by the test suite only (capacity_mode=test)
  try {
    if ((await createStorage(env).getSetting("capacity_mode")) === "test") return TEST_PROFILE;
  } catch {
    /* settings read failed → normal */
  }
  return NORMAL_PROFILE;
}

// ── local fallback (dev/tests; same semantics as the DO) ────────────────────
const localCounters = new Map<string, { start: number; count: number }>();

export function resetRateCounters(): void {
  localCounters.clear();
}

/** Strict fixed-window counter. Returns retry_after seconds when over. */
function checkWindow(counters: Map<string, { start: number; count: number }>, key: string, limit: number, now: number, weight = 1): number | null {
  if (limit <= 0) return null;
  let c = counters.get(key);
  if (!c || c.start + RATE_WINDOW_SECONDS <= now) {
    c = { start: now, count: 0 };
    counters.set(key, c);
  }
  if (c.count + weight > limit) {
    return Math.max(1, c.start + RATE_WINDOW_SECONDS - now);
  }
  c.count += weight;
  return null;
}

interface RateCheck {
  key: string;
  limit: number;
  budget?: string;
  /** Units consumed by this check (batch writes) — default 1. */
  weight?: number;
}

/** Local fixed-window check; returns {retry,budget} when over. */
function localCheck(checks: Array<{ key: string; limit: number; budget?: string; weight?: number }>): { retry: number; budget: string } | null {
  const now = Math.floor(Date.now() / 1000);
  for (const { key, limit, budget, weight } of checks) {
    const retry = checkWindow(localCounters, key, limit, now, weight);
    if (retry !== null) return { retry, budget: budget ?? "rate" };
  }
  return null;
}

// ── Durable Object path ─────────────────────────────────────────────────────

/** Ask the single-point DO to consume all budgets atomically (one call). */
async function doCheck(env: Env, checks: RateCheck[]): Promise<{ retry: number; budget: string } | null> {
  const ns = env.RL_DO;
  if (!ns) return localCheck(checks); // dev/tests
  const id = ns.idFromName("rodex-rl");
  const stub = ns.get(id);
  const res = await stub.fetch("https://rl/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checks }),
  });
  const body = (await res.json().catch(() => ({}))) as { allowed?: boolean; retry_after?: number; budget?: string };
  return body.allowed ? null : { retry: body.retry_after ?? 1, budget: body.budget ?? "rate" };
}

function fail(result: { retry: number; budget: string }): never {
  throw tooManyRequests(result.retry, `Rate limit exceeded — ${result.budget} budget, retry in ${result.retry}s`);
}

/** Per-app gate: total + write/read budget + platform pool — all strict.
 * `weight` lets one HTTP request consume N units (big items, batch writes). */
export async function gateAppRequest(env: Env, appId: string, kind: "write" | "read", weight = 1): Promise<void> {
  const p = await profileFor(env);
  const checks: RateCheck[] = [
    { key: appId, limit: p.totalPerApp, budget: "total", weight },
    { key: `${appId}:${kind}`, limit: kind === "write" ? p.writesPerApp : p.readsPerApp, budget: kind === "write" ? "writes" : "reads", weight },
    { key: "platform:all", limit: p.platform, budget: "platform", weight },
  ];
  const result = await doCheck(env, checks);
  if (result) fail(result);
}

/** Admin surface gate. */
export async function gateAdminRequest(env: Env): Promise<void> {
  const result = await doCheck(env, [{ key: "admin", limit: RATE_ADMIN, budget: "admin" }]);
  if (result) fail(result);
}

/** MCP entry gate: platform-wide total only (initialize/list are reads). */
export async function gateMCPTotal(env: Env): Promise<void> {
  const p = await profileFor(env);
  const result = await doCheck(env, [{ key: "mcp:total", limit: p.mcpTotal, budget: "mcp-total" }]);
  if (result) fail(result);
}

/** MCP tool gate: total + kind budget (writes/reads). Weight = items in a batch. */
export async function gateMCPRequest(env: Env, kind: "write" | "read", weight = 1): Promise<void> {
  const p = await profileFor(env);
  const result = await doCheck(env, [
    { key: "mcp:total", limit: p.mcpTotal, budget: "mcp-total", weight },
    { key: `mcp:${kind}`, limit: kind === "write" ? p.mcpWrites : p.mcpReads, budget: kind === "write" ? "mcp-writes" : "mcp-reads", weight },
  ]);
  if (result) fail(result);
}

// ── observability: peek counters WITHOUT consuming ───────────────────────────

export interface UsageSnapshot {
  key: string;
  count: number;
  window_start: number;
}

/** Current per-budget usage for an app (total / writes / reads / platform). */
export async function peekUsage(env: Env, appId: string): Promise<UsageSnapshot[]> {
  const keys = [appId, `${appId}:write`, `${appId}:read`, "platform:all"];
  const ns = env.RL_DO;
  if (!ns) {
    // dev/tests: read the local fallback counters directly
    const now = Math.floor(Date.now() / 1000);
    return keys.map((key) => {
      const c = localCounters.get(key);
      return { key, count: c && c.start + RATE_WINDOW_SECONDS > now ? c.count : 0, window_start: c && c.start + RATE_WINDOW_SECONDS > now ? c.start : now };
    });
  }
  const id = ns.idFromName("rodex-rl");
  const stub = ns.get(id);
  const res = await stub.fetch("https://rl/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "peek", checks: keys.map((key) => ({ key })) }),
  });
  const body = (await res.json().catch(() => ({}))) as { counts?: UsageSnapshot[] };
  return Array.isArray(body.counts) ? body.counts : [];
}