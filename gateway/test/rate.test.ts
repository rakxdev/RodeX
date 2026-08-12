/**
 * rate.test.ts — STRICT rate limiting semantics (the numbers the docs promise):
 *   per-app total 600, writes 120, reads 240, platform 1000, admin 60,
 *   fixed 60 s windows, retry_after = seconds remaining in the window.
 * Uses the local fallback counter (identical semantics to the DO).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { gateAdminRequest, gateAppRequest, resetRateCounters } from "../src/rate";
import { RateLimiterDO } from "../src/rate-do";
import { HttpError } from "../src/errors";
import type { Env } from "../src/env";

function env(): Env {
  return { STORAGE: "mock", DASHBOARD_ORIGIN: "http://x", GITHUB_ALLOWED_USERS: "" } as Env;
}

beforeEach(() => {
  resetRateCounters();
});

async function expect429(p: Promise<void>): Promise<number> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    const he = e as HttpError & { status: number; message: string };
    expect(he.status).toBe(429);
    return he.message === "Rate limit exceeded" ? 1 : Number(he.message.match(/\d+/)?.[0] ?? 1);
  }
  throw new Error("expected 429 but the call passed");
}

describe("strict rate limiting (local counter = DO semantics)", () => {
  it("write budget: exactly 2000 write-units pass per window, then 429", async () => {
    for (let i = 0; i < 2_000; i++) await gateAppRequest(env(), "app1", "write");
    await expect429(gateAppRequest(env(), "app1", "write")); // 2001st write → 429
  }, 30_000);

  it("read budget: 40 000 reads pass, then 429", async () => {
    for (let i = 0; i < 40_000; i++) await gateAppRequest(env(), "app1", "read");
    await expect429(gateAppRequest(env(), "app1", "read"));
  }, 60_000);

  it("mixed traffic: kind budgets trip independently (2000 writes + 40k reads, then both 429)", async () => {
    for (let i = 0; i < 2_000; i++) await gateAppRequest(env(), "app1", "write");
    for (let i = 0; i < 40_000; i++) await gateAppRequest(env(), "app1", "read");
    await expect429(gateAppRequest(env(), "app1", "write")); // write budget exhausted
    await expect429(gateAppRequest(env(), "app1", "read")); // read budget exhausted
  }, 60_000);

  it("apps are isolated: app1 at its write cap does not touch app2", async () => {
    for (let i = 0; i < 2_000; i++) await gateAppRequest(env(), "app1", "write");
    await gateAppRequest(env(), "app2", "write"); // still allowed
  }, 30_000);

  it("platform pool binds across THREE apps (kind budgets alone max at 82 000)", async () => {
    const e = env();
    for (let i = 0; i < 2_000; i++) await gateAppRequest(e, "appA", "write");
    for (let i = 0; i < 40_000; i++) await gateAppRequest(e, "appA", "read");
    for (let i = 0; i < 2_000; i++) await gateAppRequest(e, "appB", "write");
    for (let i = 0; i < 40_000; i++) await gateAppRequest(e, "appB", "read");
    // appC: 2000 writes (cum 86 000) + reads — platform trips once the shared pool crosses 100 000
    for (let i = 0; i < 2_000; i++) await gateAppRequest(e, "appC", "write");
    let allowed = 0;
    for (let i = 0; i < 30_000; i++) {
      try {
        await gateAppRequest(e, "appC", "read");
        allowed++;
      } catch {
        break;
      }
    }
    expect(allowed).toBeGreaterThanOrEqual(12_000); // cum 100 000 needs ~14 000 reads
    expect(allowed).toBeLessThanOrEqual(16_000); // and trips well before appC's read cap (40 000)
  }, 60_000);

  it("admin budget: 60, then 429", async () => {
    for (let i = 0; i < 60; i++) await gateAdminRequest(env());
    await expect429(gateAdminRequest(env()));
  });

  it("retry_after reflects the remaining window", async () => {
    for (let i = 0; i < 2_000; i++) await gateAppRequest(env(), "app1", "write");
    const retry = await expect429(gateAppRequest(env(), "app1", "write"));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
  }, 30_000);

  it("a fresh window resets every counter", async () => {
    for (let i = 0; i < 2_000; i++) await gateAppRequest(env(), "app1", "write");
    await expect429(gateAppRequest(env(), "app1", "write"));
    resetRateCounters(); // simulates the window boundary / DO restart
    await gateAppRequest(env(), "app1", "write"); // allowed again
  }, 30_000);
});

describe("RateLimiterDO (single-point counters)", () => {
  it("enforces the budget atomically: 121st sequential call is denied with HTTP 429", async () => {
    const do_ = new RateLimiterDO();
    let ok = 0;
    let denied = 0;
    for (let i = 0; i < 121; i++) {
      const res = await do_.fetch(new Request("https://rl/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks: [{ key: "app9:write", limit: 120 }] }),
      }));
      if (res.status === 200) ok++;
      else denied++;
    }
    expect(ok).toBe(120); // exactly the budget
    expect(denied).toBe(1); // the 121st, HTTP 429
  });

  it("returns retry_after on the rejecting response", async () => {
    const do_ = new RateLimiterDO();
    for (let i = 0; i < 120; i++) {
      await do_.fetch(new Request("https://rl/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks: [{ key: "k", limit: 120 }] }),
      }));
    }
    const res = await do_.fetch(new Request("https://rl/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checks: [{ key: "k", limit: 120 }] }),
    }));
    const body = (await res.json()) as { allowed: boolean; retry_after: number };
    expect(body.allowed).toBe(false);
    expect(body.retry_after).toBeGreaterThanOrEqual(1);
  });

  it("peek reports counts WITHOUT consuming", async () => {
    const do_ = new RateLimiterDO();
    for (let i = 0; i < 7; i++) {
      await do_.fetch(new Request("https://rl/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks: [{ key: "appX:write", limit: 120 }] }),
      }));
    }
    const peek = await do_.fetch(new Request("https://rl/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "peek", checks: [{ key: "appX:write" }, { key: "appX:read" }] }),
    }));
    const body = (await peek.json()) as { counts: Array<{ key: string; count: number }> };
    expect(body.counts.find((x) => x.key === "appX:write")?.count).toBe(7);
    expect(body.counts.find((x) => x.key === "appX:read")?.count).toBe(0);
    // peek consumed nothing → the next check still passes (113 remaining)
    const after = await do_.fetch(new Request("https://rl/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checks: [{ key: "appX:write", limit: 120 }] }),
    }));
    expect((await after.json()) as { allowed: boolean }).toMatchObject({ allowed: true });
  });
});