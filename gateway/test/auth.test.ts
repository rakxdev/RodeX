import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  createSessionCookie,
  generateApiKey,
  hashKey,
  requireSession,
  verifySessionCookie,
} from "../src/auth";
import { HttpError } from "../src/errors";

describe("auth — api keys", () => {
  it("generates a branded rok_ base64url key (32 bytes)", () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1).toMatch(/^rok_[A-Za-z0-9_-]{43}$/);
    expect(k1).not.toBe(k2);
  });

  it("hashes are stable per secret+key and differ across keys", async () => {
    const secret = "s3cr3t-" + Math.random();
    const key = generateApiKey();
    const h1 = await hashKey(secret, key);
    const h2 = await hashKey(secret, key);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    const other = await hashKey(secret + "x", key);
    expect(other).not.toBe(h1);
  });

  it("hash never contains the raw key", async () => {
    const key = generateApiKey();
    const h = await hashKey("s", key);
    expect(h.includes(key.slice(0, 8))).toBe(false);
  });
});

describe("auth — constant time compare", () => {
  it("matches equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
  });
  it("rejects mismatches and length differences", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("auth — sessions", () => {
  const secret = "x".repeat(32);

  it("signs and verifies a valid session", async () => {
    const cookie = await createSessionCookie(secret);
    const payload = await verifySessionCookie(secret, cookie);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("admin");
    expect(payload!.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it("rejects tampered payload", async () => {
    const cookie = await createSessionCookie(secret);
    const i = cookie.lastIndexOf(".");
    const tampered = ("AAAA" + cookie.slice(4, i)) + cookie.slice(i);
    expect(await verifySessionCookie(secret, tampered)).toBeNull();
  });

  it("rejects wrong secret", async () => {
    const cookie = await createSessionCookie(secret);
    expect(await verifySessionCookie("y".repeat(32), cookie)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySessionCookie(secret, "garbage")).toBeNull();
    expect(await verifySessionCookie(secret, undefined)).toBeNull();
  });

  it("requireSession throws 401", async () => {
    await expect(requireSession(secret, "bad")).rejects.toBeInstanceOf(HttpError);
    const cookie = await createSessionCookie(secret);
    await expect(requireSession(secret, cookie)).resolves.toMatchObject({ sub: "admin" });
  });
});