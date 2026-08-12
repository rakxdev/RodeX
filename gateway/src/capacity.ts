/**
 * capacity.ts — platform-wide capacity modes (NORMAL / PERFORMANCE).
 * Shared by the admin REST surface, the MCP tools and the scheduled runner.
 *
 * NORMAL      → tables provisioned 5/5 (free tier, $0); budgets = NORMAL_PROFILE
 * PERFORMANCE → tables on-demand (pay-per-request, no throttling); budgets =
 *               guardrails only.
 *
 * SWITCHING IS QUEUED + BACKGROUND: one worker request cannot call
 * UpdateTable on every table (per-request subrequest ceiling), so the POST
 * records a PENDING plan and the gateway's scheduled runner processes a chunk
 * of tables every minute until done (~minutes, matching the AWS transition
 * time). Status is visible via GET (and polls to "SWITCHING…" while pending).
 */
import { badRequest } from "./errors";
import type { Env } from "./env";
import { capacityModeOf, resetModeCache } from "./rate";
import { physicalName } from "./registry";
import { createStorage } from "./storage";

export const SETTING_CAPACITY_MODE = "capacity_mode";
export const SETTING_CAPACITY_PENDING = "capacity_pending";

interface PendingPlan {
  /** billing target: "on-demand" (performance) or "provisioned" (normal) */
  target: "on-demand" | "provisioned";
  /** explicit physical table names still to switch — immune to list churn */
  pending: string[];
  /** per-table retry counts (bounded; then given up) */
  attempts: Record<string, number>;
  /** started at (unix seconds) — for stale-plan recovery */
  at: number;
}

interface PhysicalTable {
  app_id: string;
  table: string;
  physical: string;
}

async function physicalTables(env: Env): Promise<PhysicalTable[]> {
  const storage = createStorage(env);
  const apps = await storage.listApps();
  const out: PhysicalTable[] = [];
  for (const app of apps) {
    for (const t of app.tables) out.push({ app_id: app.appId, table: t, physical: physicalName(app.appId, t) });
  }
  return out;
}

/** Current platform mode + every table's billing mode (for status displays). */
export async function getPlatformCapacity(env: Env) {
  const storage = createStorage(env);
  const mode = await capacityModeOf(env);
  const pendingRaw = await storage.getSetting(SETTING_CAPACITY_PENDING).catch(() => null);
  const pending: PendingPlan | null = pendingRaw ? JSON.parse(pendingRaw) : null;
  const tables = await physicalTables(env);
  const states: Array<{ app_id: string; table: string; mode: "on-demand" | "provisioned" | null }> = [];
  for (const t of tables) {
    const m = await storage.tableCapacityMode(t.physical).catch(() => null);
    states.push({ app_id: t.app_id, table: t.table, mode: m });
  }
  return {
    mode,
    ...(pending ? { switching: true, switching_to: pending.target, pending_tables: pending.pending.length } : { switching: false }),
    tables: states,
  };
}

/** Queue a platform-wide switch. The scheduled runner executes it chunk by chunk. */
export async function setPlatformCapacity(env: Env, modeRaw: unknown): Promise<Record<string, unknown>> {
  if (modeRaw !== "normal" && modeRaw !== "performance") {
    throw badRequest("mode must be 'normal' (provisioned, $0) or 'performance' (on-demand, pay-per-request)");
  }
  const target: "on-demand" | "provisioned" = modeRaw === "performance" ? "on-demand" : "provisioned";
  const storage = createStorage(env);
  const tables = await physicalTables(env);
  const plan: PendingPlan = { target, pending: tables.map((t) => t.physical), attempts: {}, at: Math.floor(Date.now() / 1000) };
  await storage.putSetting(SETTING_CAPACITY_PENDING, JSON.stringify(plan));
  return {
    mode: modeRaw,
    queued: tables.length,
    note: "Switching queued — runs in the background chunk by chunk and takes minutes. Watch GET /v1/admin/capacity (switching: true) until all tables report the target mode.",
  };
}

/**
 * Scheduled runner: switch up to `limit` tables toward the pending plan.
 * Returns { processed, done } — called by the gateway cron each minute.
 */
export async function processCapacityChunk(env: Env, limit = 12): Promise<{ processed: number; done: boolean }> {
  const storage = createStorage(env);
  const raw = await storage.getSetting(SETTING_CAPACITY_PENDING).catch(() => null);
  if (!raw) return { processed: 0, done: true };
  let plan: PendingPlan;
  try {
    plan = JSON.parse(raw) as PendingPlan;
  } catch {
    await storage.putSetting(SETTING_CAPACITY_PENDING, "").catch(() => {});
    return { processed: 0, done: true };
  }
  const slice = plan.pending.slice(0, limit);
  // UpdateTable takes ~1-2 min PER TABLE — parallelize across tables so a
  // run's limit all transition together (per-request subrequest ceiling is
  // respected: 12 tables × 2 calls = 24 ≤ ~100).
  const outcomes = await Promise.all(
    slice.map(async (physical): Promise<"ok" | "skip" | "fail"> => {
      try {
        const current = await storage.tableCapacityMode(physical).catch(() => null);
        if (current === plan.target) return "skip";
        await storage.setTableCapacity(physical, plan.target);
        return "ok";
      } catch (err) {
        // per-table failure (table still UPDATING from a prior switch,
        // 4×/24 h reached, transient) — retried by the next run, max 5 tries
        console.log("[capacity] table failed", physical, (err as Error).message);
        return "fail";
      }
    }),
  );
  const finished: string[] = [];
  const retry: string[] = [];
  let processed = 0;
  for (let i = 0; i < slice.length; i++) {
    const physical = slice[i];
    if (outcomes[i] === "fail") {
      plan.attempts[physical] = (plan.attempts[physical] ?? 0) + 1;
      if ((plan.attempts[physical] ?? 0) < 5) {
        retry.push(physical); // retried next run
        continue;
      }
      console.log("[capacity] giving up on", physical, "after 5 attempts");
    }
    finished.push(physical);
    processed++;
  }
  plan.pending = [...retry, ...plan.pending.slice(limit)]; // keep order stable
  const allDone = plan.pending.length === 0;
  if (allDone) {
    await storage.putSetting(SETTING_CAPACITY_PENDING, "").catch(() => {});
    await storage.putSetting(SETTING_CAPACITY_MODE, plan.target === "on-demand" ? "performance" : "normal").catch(() => {});
    resetModeCache(); // budgets switch on the next gate call
  } else {
    await storage.putSetting(SETTING_CAPACITY_PENDING, JSON.stringify(plan)).catch(() => {});
  }
  return { processed, done: allDone };
}