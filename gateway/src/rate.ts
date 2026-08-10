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
import {
  RATE_ADMIN,
  RATE_PLATFORM,
  RATE_READS_PER_APP,
  RATE_TOTAL_PER_APP,
  RATE_WINDOW_SECONDS,
  RATE_WRITES_PER_APP,
} from "./limits";
import type { Env } from "./env";

// ── local fallback (dev/tests; same semantics as the DO) ────────────────────
const localCounters = new Map<string, { start: number; count: number }>();

export function resetRateCounters(): void {
  localCounters.clear();
}

/** Strict fixed-window counter. Returns retry_after seconds when over. */
function checkWindow(counters: Map<string, { start: number; count: number }>, key: string, limit: number, now: number): number | null {
  if (limit <= 0) return null;
  let c = counters.get(key);
  if (!c || c.start + RATE_WINDOW_SECONDS <= now) {
    c = { start: now, count: 0 };
    counters.set(key, c);
  }
  if (c.count >= limit) {
    return Math.max(1, c.start + RATE_WINDOW_SECONDS - now);
  }
  c.count += 1;
  return null;
}

interface RateCheck {
  key: string;
  limit: number;
  budget?: string;
}

/** Local fixed-window check; returns {retry,budget} when over. */
function localCheck(checks: Array<{ key: string; limit: number; budget?: string }>): { retry: number; budget: string } | null {
  const now = Math.floor(Date.now() / 1000);
  for (const { key, limit, budget } of checks) {
    const retry = checkWindow(localCounters, key, limit, now);
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

/** Per-app gate: total + write/read budget + platform pool — all strict. */
export async function gateAppRequest(env: Env, appId: string, kind: "write" | "read"): Promise<void> {
  const checks: RateCheck[] = [
    { key: appId, limit: RATE_TOTAL_PER_APP, budget: "total" },
    { key: `${appId}:${kind}`, limit: kind === "write" ? RATE_WRITES_PER_APP : RATE_READS_PER_APP, budget: kind === "write" ? "writes" : "reads" },
    { key: "platform:all", limit: RATE_PLATFORM, budget: "platform" },
  ];
  const result = await doCheck(env, checks);
  if (result) fail(result);
}

/** Admin surface gate. */
export async function gateAdminRequest(env: Env): Promise<void> {
  const result = await doCheck(env, [{ key: "admin", limit: RATE_ADMIN, budget: "admin" }]);
  if (result) fail(result);
}