/**
 * auth.ts — key generation/hashing (app API keys) + session cookie signing.
 * App keys are shown ONCE at creation; we store only HMAC-SHA256(secret, key).
 * Verification uses constant-time compare.
 */

import { unauthorized } from "./errors";

const enc = new TextEncoder();

/** Branded API key: `rok_` + 43 base64url chars.
 *  The prefix is the RodeX fingerprint — like sk- (OpenAI), pk_ (Stripe),
 *  cf_ (Cloudflare) — so any project using RodeX is instantly recognizable. */
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `rok_${base64Url(bytes)}`;
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256(secret, key) hex. Salt lives inside the secret (stored per app). */
export async function hashKey(secret: string, key: string): Promise<string> {
  return hashHmac(secret, key);
}

async function hashHmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToHex(new Uint8Array(sig));
}

/** Constant-time string compare (XOR accumulation, no early exit). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** API keys are PRE-HASHED in transit? No — keys travel once (plain over TLS) and are stored hashed. */

// ── Sessions (admin dashboard) ───────────────────────────────────────────────

export interface SessionPayload {
  sub: string; // "admin"
  exp: number; // unix seconds
}

const SESSION_TTL_SECONDS = 12 * 60 * 60;

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string | null {
  try {
    // restore padding
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch {
    return null;
  }
}

/** Sign a session cookie value: "<payload>.<sig>". */
export async function createSessionCookie(secret: string, sub = "admin"): Promise<string> {
  const payload: SessionPayload = { sub, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = b64urlEncode(encodeURIComponent(JSON.stringify(payload)));
  const sig = await hashHmac(secret, body);
  return `${body}.${sig}`;
}

/** Verify + parse; returns null on any tamper/expiry. */
export async function verifySessionCookie(secret: string, cookie: string | undefined | null): Promise<SessionPayload | null> {
  if (!cookie) return null;
  const idx = cookie.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = cookie.slice(0, idx);
  const sig = cookie.slice(idx + 1);
  const expected = await hashHmac(secret, body);
  if (!constantTimeEqual(expected, sig)) return null;
  const raw = b64urlDecode(body);
  if (!raw) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(raw)) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Throwing variant for handlers. */
export async function requireSession(secret: string, cookie: string | undefined | null) {
  const session = await verifySessionCookie(secret, cookie);
  if (!session) throw unauthorized("Session expired or invalid — please log in");
  return session;
}

/** Domain helper: cookie must be SameSite=None; Secure for cross-site use. */
export function sessionCookieHeader(value: string, secure: boolean, domain?: string): string {
  const parts = [`rodex_session=${value}`, "Path=/", "HttpOnly", "Max-Age=43200"];
  if (secure) parts.push("SameSite=None", "Secure");
  else parts.push("SameSite=Lax");
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

// ── short-lived key cipher (VIEW-KEY recovery window) ────────────────────────
// The raw API key is normally stored ONLY as an HMAC hash. For a short recovery
// window after creation/rotation we additionally keep an AES-GCM copy so the
// owner can view/reuse it; after the window the ciphertext is dead.

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Returns "<iv-b64url>.<ciphertext-b64url>" or null on failure. */
export async function encryptKey(secret: string, plaintext: string): Promise<string | null> {
  try {
    const key = await aesKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    return `${base64Url(iv)}.${base64Url(new Uint8Array(ct))}`;
  } catch {
    return null;
  }
}

/** Inverse of encryptKey; null on tamper/decrypt failure. */
export async function decryptKey(secret: string, blob: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = blob.split(".");
    if (!ivB64 || !ctB64) return null;
    const iv = Uint8Array.from(atob(ivB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const key = await aesKey(secret);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}