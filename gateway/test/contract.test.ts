import { describe, expect, it } from "vitest";
import {
  LIMITS,
  NORMAL_PROFILE as GENERATED_NORMAL,
  PERFORMANCE_PROFILE as GENERATED_PERFORMANCE,
} from "../src/generated/contract";
import {
  ITEM_BYTES,
  MAX_ITEM_BYTES,
  MAX_QUERY_LIMIT,
  MAX_REQUEST_BYTES,
  NORMAL_PROFILE,
  PERFORMANCE_PROFILE,
  RATE_ADMIN,
} from "../src/limits";

describe("canonical public contract parity", () => {
  it("keeps gateway caps sourced from the generated contract", () => {
    expect(MAX_ITEM_BYTES).toBe(LIMITS.maxItemBytes);
    expect(ITEM_BYTES).toBe(LIMITS.maxItemBytes);
    expect(MAX_REQUEST_BYTES).toBe(LIMITS.maxRequestBytes);
    expect(MAX_QUERY_LIMIT).toBe(LIMITS.maxQueryLimit);
    expect(RATE_ADMIN).toBe(LIMITS.adminRequestsPerMinute);
  });

  it("keeps NORMAL and PERFORMANCE profiles sourced from generated values", () => {
    expect(NORMAL_PROFILE).toEqual(GENERATED_NORMAL);
    expect(PERFORMANCE_PROFILE).toEqual(GENERATED_PERFORMANCE);
    expect(PERFORMANCE_PROFILE.totalPerApp).toBeGreaterThanOrEqual(NORMAL_PROFILE.totalPerApp);
    expect(PERFORMANCE_PROFILE.writesPerApp).toBeGreaterThanOrEqual(NORMAL_PROFILE.writesPerApp);
    expect(PERFORMANCE_PROFILE.readsPerApp).toBeGreaterThanOrEqual(NORMAL_PROFILE.readsPerApp);
  });

  it("keeps the deliberate test profile separate from public profiles", async () => {
    const { TEST_PROFILE } = await import("../src/limits");
    expect(TEST_PROFILE).not.toEqual(NORMAL_PROFILE);
    expect(TEST_PROFILE).not.toEqual(PERFORMANCE_PROFILE);
  });
});
