/**
 * Gateway API client — typed, thin, honest about errors.
 * Base URL: VITE_GATEWAY_URL (dev default) or the live worker.
 * Sessions ride on cookies (credentials: include) for admin calls.
 */

const BASE = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? "https://rodex-gateway.rakxdev.workers.dev";

export interface ApiError {
  status: number;
  message: string;
  retryAfter?: number;
}

export class ApiError extends Error {
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
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
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
