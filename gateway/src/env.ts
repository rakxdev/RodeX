/**
 * env.ts — the single typed view of runtime configuration (vars + secrets).
 * Secrets come from `wrangler secret put`; vars from wrangler.toml [vars].
 */

export interface Env {
  // storage mode
  STORAGE: "mock" | "aws";
  // dashboard origin for CORS + docs links
  DASHBOARD_ORIGIN: string;
  // comma-separated GitHub usernames allowed to log in
  GITHUB_ALLOWED_USERS: string;
  // secrets (wrangler secret put)
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  // rate limiting bindings (wrangler.toml [[ratelimits]])
  RL_APP_TOTAL?: RateLimitBinding;
  RL_APP_WRITES?: RateLimitBinding;
  RL_APP_READS?: RateLimitBinding;
  RL_PLATFORM?: RateLimitBinding;
  RL_ADMIN?: RateLimitBinding;
}

/** Minimal type of the Workers Rate Limiting binding (docs: runtime-apis/bindings/rate-limit). */
export interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export function allowedUsers(env: Env): Set<string> {
  return new Set(
    (env.GITHUB_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function dashboardOrigin(env: Env): string {
  return env.DASHBOARD_ORIGIN || "http://localhost:8787";
}

export function sessionSecret(env: Env): string {
  // dev fallback; production MUST set SESSION_SECRET via wrangler secret
  return env.SESSION_SECRET || "dev-session-secret-change-me";
}