/**
 * Gateway API client — typed, thin, honest about errors.
 * Base URL: VITE_GATEWAY_URL (dev default) or the live worker.
 * Sessions ride on cookies (credentials: include) for admin calls.
 */

const BASE = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? "https://rodex-gateway.rakxdev.workers.dev";

// ── session token channel ────────────────────────────────────────────────────
// The gateway signs a 12 h token. Browsers that accept cross-site cookies use
// the HttpOnly cookie; everyone else (third-party cookie blockers) uses this
// token, sent as `Authorization: Bearer <token>` on every request.
const SESSION_KEY = "rodex_session";

// ── session-state cache ───────────────────────────────────────────────────────
// /v1/admin/me is verified ONCE per page load; every guard reads the cached
// result, so switching tabs never re-verifies (no VERIFYING SESSION flash).
// Login/logout invalidate the cache through setSessionToken/clearSessionToken.
let authed: boolean | null = null;
let checkPromise: Promise<void> | null = null;
const authListeners = new Set<(v: boolean) => void>();
// Set by logout(); PublicOnly renders /login without re-verifying, so a stale
// cookie can never bounce the user back to the board.
let explicitLogout = false;

export function isExplicitLogout(): boolean {
  return explicitLogout;
}

export function markExplicitLogout(): void {
  explicitLogout = true;
  invalidateSession();
}

function setAuthed(v: boolean): void {
  authed = v;
  authListeners.forEach((l) => l(v));
}

export function getAuthedState(): boolean | null {
  return authed;
}

export function invalidateSession(): void {
  authed = null;
  checkPromise = null;
}

export function ensureSessionChecked(): Promise<void> {
  if (checkPromise) return checkPromise;
  checkPromise = api
    .get<MeResult>("/v1/admin/me")
    .then((r) => setAuthed(r.authenticated))
    .catch(() => setAuthed(false));
  return checkPromise;
}

export function subscribeAuthed(listener: (v: boolean) => void): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  explicitLogout = false;
  invalidateSession();
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    /* storage unavailable — cookie channel still covers most browsers */
  }
}

export function clearSessionToken(): void {
  invalidateSession();
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** OAuth callback lands on /login?session=<token> — store it and strip the URL. */
export function ingestUrlSession(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("session");
  if (!token) return;
  setSessionToken(token);
  params.delete("session");
  const qs = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
}

export interface ApiErrorShape {
  status: number;
  message: string;
  retryAfter?: number;
}

export class ApiError extends Error implements ApiErrorShape {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.name = "ApiError";
  }
}

interface GatewayResponse<T> {
  ok: boolean;
  result?: T;
  error?: { code: number; message: string; retry_after?: number };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: "include",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Gateway unreachable — check your connection");
  }
  const data = (await res.json().catch(() => null)) as GatewayResponse<T> | null;
  if (!res.ok || !data?.ok) {
    throw new ApiError(data?.error?.code ?? res.status, data?.error?.message ?? `HTTP ${res.status}`, data?.error?.retry_after);
  }
  return data.result as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export const gatewayBase = BASE;

// ── domain types (mirror docs/api.md + openapi.yaml) ──────────────
export type AppStatus = "active" | "suspended" | "deleting";

export interface AppInfo {
  app_id: string;
  name: string;
  status: AppStatus;
  created_at: number;
  tables: string[];
  key_prefix: string;
  purge_at?: number;
  api_key?: string; // present only at creation / rotation
}

export interface MeResult {
  authenticated: boolean;
  user?: string;
  allowed_users?: string[];
}
