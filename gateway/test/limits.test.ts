import { describe, expect, it } from "vitest";
import {
  APP_NAME_PATTERN,
  ITEM_BYTES,
  jsonBytes,
  MAX_APPS,
  PK_MAX_CHARS,
  SK_MAX_CHARS,
  TABLE_NAME_PATTERN,
} from "../src/limits";

const MAX_ITEM_BYTES = ITEM_BYTES;

describe("limits", () => {
  it("400 KB item cap is an explicit constant (DynamoDB's hard limit)", () => {
    expect(MAX_ITEM_BYTES).toBe(400_000);
  });

  it("jsonBytes measures serialized size including names", () => {
    expect(jsonBytes({ a: "x" })).toBeGreaterThan(3);
    expect(jsonBytes("")).toBe(2); // quotes
  });

  it("itemFits-like logic: 20 KB payload passes, larger fails", () => {
    const under = { data: "x".repeat(MAX_ITEM_BYTES - 50) };
    expect(jsonBytes(under)).toBeLessThanOrEqual(MAX_ITEM_BYTES);
    const over = { data: "x".repeat(MAX_ITEM_BYTES + 50) };
    expect(jsonBytes(over)).toBeGreaterThan(MAX_ITEM_BYTES);
  });

  it("app name pattern enforces lowercase alnum 1-40", () => {
    expect("myapp1").toMatch(APP_NAME_PATTERN);
    expect("MyApp").not.toMatch(APP_NAME_PATTERN);
    expect("").not.toMatch(APP_NAME_PATTERN);
    expect("x".repeat(41)).not.toMatch(APP_NAME_PATTERN);
    expect("a-b_c.d").not.toMatch(APP_NAME_PATTERN); // dot is NOT allowed
  });

  it("table name pattern enforced", () => {
    expect("users_2026").toMatch(TABLE_NAME_PATTERN);
    expect("UPPER").not.toMatch(TABLE_NAME_PATTERN);
    expect("a".repeat(50)).not.toMatch(TABLE_NAME_PATTERN);
  });

  it("key char caps are set and sane", () => {
    expect(PK_MAX_CHARS).toBeGreaterThan(100);
    expect(SK_MAX_CHARS).toBeGreaterThan(100);
  });

  it("app guard constant exists", () => {
    expect(MAX_APPS).toBeGreaterThan(0);
  });
});