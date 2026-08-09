/**
 * rate.ts — thin envelope over the Workers Rate Limiting bindings.
 * Bindings are per-location and eventually consistent (docs/rate-limits.md §4);
 * they are the FIRST gate; DynamoDB throttling mapping is the SECOND.
 * In tests the bindings are absent → envelope passes (unit tests cover logic).
 */
import { tooManyRequests } from "./errors";
import type { Env, RateLimitBinding } from "./env";

export async function checkRate(limit: RateLimitBinding | undefined, key: string): Promise<void> {
  if (!limit) return; // not configured (dev/tests)
  const { success } = await limit.limit({ key });
  if (!success) throw tooManyRequests(1);
}

/** Per-route gate: total + write/read budgets, keyed by app_id (+route family). */
export async function gateAppRequest(env: Env, appId: string, kind: "write" | "read"): Promise<void> {
  await checkRate(env.RL_APP_TOTAL, appId);
  await checkRate(kind === "write" ? env.RL_APP_WRITES : env.RL_APP_READS, `${appId}:${kind}`);
  await checkRate(env.RL_PLATFORM, "platform:all");
}

export async function gateAdminRequest(env: Env): Promise<void> {
  await checkRate(env.RL_ADMIN, "admin");
}