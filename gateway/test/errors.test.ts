import { describe, expect, it } from "vitest";
import {
  HttpError,
  badRequest,
  conflict,
  forbidden,
  gatewayError,
  isErrorShape,
  notFound,
  payloadTooLarge,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
} from "../src/errors";

describe("errors", () => {
  it("HttpError carries status + message + optional retryAfter", () => {
    const e = new HttpError(429, "slow down", 2);
    expect(e.status).toBe(429);
    expect(e.message).toBe("slow down");
    expect(e.retryAfter).toBe(2);
  });

  it("toJson matches the API contract", () => {
    const e = tooManyRequests(1);
    expect(e.toJson()).toEqual({
      ok: false,
      error: { code: 429, message: expect.any(String), retry_after: 1 },
    });
    expect(isErrorShape(e.toJson())).toBe(true);
  });

  it("plain errors have no retry_after field", () => {
    expect(unauthorized().toJson().error).not.toHaveProperty("retry_after");
    expect(isErrorShape(unauthorized().toJson())).toBe(true);
  });

  it("status codes match the documented set", () => {
    expect(badRequest("x").status).toBe(400);
    expect(unauthorized().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(notFound().status).toBe(404);
    expect(conflict("x").status).toBe(409);
    expect(payloadTooLarge().status).toBe(413);
    expect(tooManyRequests().status).toBe(429);
    expect(gatewayError().status).toBe(502);
    expect(serviceUnavailable().status).toBe(503);
  });
});