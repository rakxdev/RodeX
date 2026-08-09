/**
 * errors.ts — typed HTTP errors + one mapping function.
 * Contract (SPEC §5/§7): every failure is `{ ok:false, error:{ code, message } }`
 * and never leaks internals. DynamoDB throttling maps to 429 + Retry-After.
 */

export class HttpError extends Error {
  readonly retryAfter?: number;
  constructor(readonly status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "HttpError";
    this.retryAfter = retryAfter;
  }
  toJson() {
    return {
      ok: false,
      error: {
        code: this.status,
        message: this.message,
        ...(this.retryAfter !== undefined ? { retry_after: this.retryAfter } : {}),
      },
    };
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const unauthorized = (msg = "Missing or invalid credentials") => new HttpError(401, msg);
export const forbidden = (msg = "You are not allowed to access this resource") => new HttpError(403, msg);
export const notFound = (msg = "Resource not found") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
export const payloadTooLarge = (msg = "Payload exceeds the maximum allowed size") => new HttpError(413, msg);
export const tooManyRequests = (retryAfter = 1, msg = "Rate limit exceeded — slow down") =>
  new HttpError(429, msg, retryAfter);
export const gatewayError = (msg = "Gateway error, please retry") => new HttpError(502, msg);
export const serviceUnavailable = (msg = "Service temporarily unavailable") => new HttpError(503, msg);

/** Test helper: is a response shape valid per our contract. */
export function isErrorShape(o: unknown): o is { ok: false; error: { code: number; message: string } } {
  return (
    typeof o === "object" && o !== null &&
    (o as any).ok === false &&
    typeof (o as any).error?.code === "number" &&
    typeof (o as any).error?.message === "string"
  );
}