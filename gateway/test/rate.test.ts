import { describe, expect, it } from "vitest";
import { checkRate, gateAdminRequest, gateAppRequest } from "../src/rate";
import { HttpError } from "../src/errors";
import type { Env, RateLimitBinding } from "../src/env";

function makeLimit(hits: { n: number }) {
  return {
    limit: async ({ key }: { key: string }) => {
      hits.n++;
      return { success: key !== "blocked" };
    },
  } as unknown as RateLimitBinding;
}

function envWith(hits: { n: number }): Env {
  return {
    STORAGE: "mock",
    DASHBOARD_ORIGIN: "http://x",
    GITHUB_ALLOWED_USERS: "",
    RL_APP_TOTAL: makeLimit(hits),
    RL_APP_WRITES: makeLimit(hits),
    RL_APP_READS: makeLimit(hits),
    RL_PLATFORM: makeLimit(hits),
    RL_ADMIN: makeLimit(hits),
  } as Env;
}

describe("rate envelope", () => {
  it("passes when all bindings allow", async () => {
    const hits = { n: 0 };
    await gateAppRequest(envWith(hits), "app1", "write");
    expect(hits.n).toBe(3); // total + write + platform
  });

  it("write gate uses write budget; read gate uses read budget", async () => {
    const hits = { n: 0 };
    await gateAppRequest(envWith(hits), "app1", "read");
    expect(hits.n).toBe(3); // total + read + platform
  });

  it("throws 429 when a binding blocks", async () => {
    const env = envWith({ n: 0 });
    // make the platform binding block
    (env.RL_PLATFORM as unknown as { limit: (o: { key: string }) => Promise<{ success: boolean }> }).limit = async () => ({ success: false });
    try {
      await gateAppRequest(env, "app1", "write");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(429);
      expect((e as HttpError).retryAfter).toBe(1);
    }
  });

  it("admin gate hits admin binding", async () => {
    const hits = { n: 0 };
    await gateAdminRequest(envWith(hits));
    expect(hits.n).toBe(1);
  });

  it("missing bindings (dev/tests) are skipped", async () => {
    const env = { STORAGE: "mock", DASHBOARD_ORIGIN: "x", GITHUB_ALLOWED_USERS: "" } as Env;
    await expect(gateAppRequest(env, "a", "write")).resolves.toBeUndefined();
    await expect(checkRate(undefined, "k")).resolves.toBeUndefined();
  });
});