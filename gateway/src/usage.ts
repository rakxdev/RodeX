/**
 * usage.ts — THE ONE usage calculator (single source of truth for meters).
 *
 * Used by BOTH the console (admin REST endpoint) and the MCP surface
 * (get_app_usage tool) so the numbers can never drift: if a limit or a
 * formula changes here, both sides change together.
 *
 * Request meters come from the single-point limiter peek (zero consumption);
 * storage from DescribeTable-style sizes with a 60 s cache.
 */
import type { Env } from "./env";
import { profileFor } from "./rate";
import { peekUsage } from "./rate";
import { getApp, physicalName } from "./registry";
import { createStorage } from "./storage";

const WINDOW_SECONDS = 60;

// storage size snapshot cache (control-plane DescribeTable; ItemCount itself
// lags ~6 h on DynamoDB's side — 60 s is plenty between refreshes)
const storageCache = new Map<string, { at: number; bytes: number; items: number }>();
const STORAGE_CACHE_TTL_MS = 60_000;

/** Test helper: forget cached storage sizes (mock reset). */
export function resetStorageCache(): void {
  storageCache.clear();
}

export interface UsageSnapshot {
  app_id: string;
  window_seconds: number;
  requests: {
    total: { used: number; limit: number; remaining: number };
    writes: { used: number; limit: number; remaining: number };
    reads: { used: number; limit: number; remaining: number };
    platform: { used: number; limit: number; remaining: number };
  };
  storage: { bytes: number; items: number; tables: number; sampled_at: number };
}

/** Live usage of one app: limiter peek (no consumption) + cached storage. */
export async function usageSnapshot(env: Env, appId: string): Promise<UsageSnapshot> {
  const storage = createStorage(env);
  const row = await getApp(storage, appId);
  const counts = await peekUsage(env, row.appId);
  const used = (key: string) => counts.find((x) => x.key === key)?.count ?? 0;
  const request = (key: string, limit: number) => ({
    used: used(key),
    limit,
    remaining: Math.max(0, limit - used(key)),
  });
  // limits come from the ACTIVE capacity profile — the meters always show the
  // numbers the gates actually enforce (NORMAL 800 / PERFORMANCE guardrails)
  const p = await profileFor(env);
  const requests = {
    total: request(row.appId, p.totalPerApp),
    writes: request(`${row.appId}:write`, p.writesPerApp),
    reads: request(`${row.appId}:read`, p.readsPerApp),
    platform: request("platform:all", p.platform),
  };
  const now = Date.now();
  let bytes = 0;
  let items = 0;
  for (const t of row.tables) {
    const physical = physicalName(row.appId, t);
    const cached = storageCache.get(physical);
    let size = cached && now - cached.at < STORAGE_CACHE_TTL_MS ? cached : null;
    if (!size) {
      const fresh = await storage.storageSize(physical).catch(() => null);
      if (fresh) {
        size = { at: now, bytes: fresh.bytes, items: fresh.items };
        storageCache.set(physical, size);
      }
    }
    if (size) {
      bytes += size.bytes;
      items += size.items;
    }
  }
  return {
    app_id: row.appId,
    window_seconds: WINDOW_SECONDS,
    requests,
    storage: { bytes, items, tables: row.tables.length, sampled_at: Math.floor(now / 1000) },
  };
}