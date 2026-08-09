/**
 * rate-do.ts — RateLimiterDO: the single point of truth for rate budgets.
 *
 * One shared DO instance owns ALL counters (a single-threaded, globally
 * routed location), so a burst of 10 000 requests still hits the budget at
 * exactly request N+1 — no edge lag, no per-isolate drift.
 *
 * The DO is stateless on purpose (in-memory counters): a window boundary is
 * the only thing that resets counters, and a rare DO restart merely starts a
 * fresh window (an over-allow of at most one minute, never a hard lock).
 * Unit tests instantiate it directly — no storage/state needed.
 */
export class RateLimiterDO {
  private counters = new Map<string, { start: number; count: number }>();

  async fetch(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as {
      checks?: Array<{ key: string; limit: number }>;
    };
    const checks = Array.isArray(body.checks) ? body.checks : [];
    const now = Math.floor(Date.now() / 1000);

    for (const { key, limit } of checks) {
      if (!key || typeof limit !== "number" || limit <= 0) continue;
      let c = this.counters.get(key);
      if (!c || c.start + 60 <= now) {
        c = { start: now, count: 0 };
        this.counters.set(key, c);
      }
      if (c.count >= limit) {
        return Response.json({ allowed: false, retry_after: Math.max(1, c.start + 60 - now) }, { status: 429 });
      }
      c.count += 1;
    }
    return Response.json({ allowed: true, consumed: checks.length });
  }
}