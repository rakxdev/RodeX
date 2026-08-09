/**
 * oauth.ts — GitHub OAuth (authorization code flow) for the dashboard.
 * Flow: start → 302 to GitHub (state in HttpOnly cookie) → callback → token
 * exchange → user lookup → allowed-username check → session cookie → redirect
 * to DASHBOARD_ORIGIN.
 */
import type { Context } from "hono";
import { constantTimeEqual, createSessionCookie } from "./auth";
import { allowedUsers, type Env } from "./env";
import { badRequest, forbidden, serviceUnavailable } from "./errors";

const GH_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GH_TOKEN = "https://github.com/login/oauth/access_token";
const GH_USER = "https://api.github.com/user";

const STATE_COOKIE = "rodex_oauth_state";

/** Extract the exact value of a named cookie (robust vs substring spoofing). */
function cookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function callbackUrl(c: Context<{ Bindings: Env }>): string {
  const url = new URL(c.req.url);
  return `${url.origin}/v1/auth/github/callback`;
}

function stateCookie(value: string, secure: boolean): string {
  return `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Max-Age=300; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function startGitHubOAuth(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  if (!env.GITHUB_CLIENT_ID) throw serviceUnavailable("GitHub login is not configured");
  const state = randomState();
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: callbackUrl(c),
    state,
    scope: "read:user",
  });
  const secure = new URL(c.req.url).protocol === "https:";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${GH_AUTHORIZE}?${params}`,
      "Set-Cookie": stateCookie(state, secure),
    },
  });
}

interface GitHubTokenResp {
  access_token?: string;
  error?: string;
}

interface GitHubUser {
  login?: string;
}

export async function completeGitHubOAuth(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = c.req.header("cookie") || "";

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw serviceUnavailable("GitHub login is not configured");
  }
  if (!code || !state) throw badRequest("Missing code or state");
  const stateCookie = cookieValue(cookie, STATE_COOKIE);
  if (!stateCookie || !constantTimeEqual(stateCookie, state)) throw badRequest("Invalid OAuth state");

  // 1) exchange code for token
  const tokenRes = await fetch(GH_TOKEN, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(c),
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as GitHubTokenResp;
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw badRequest("GitHub authorization failed");
  }

  // 2) fetch the user's login
  const userRes = await fetch(GH_USER, {
    headers: { Accept: "application/json", Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const user = (await userRes.json().catch(() => ({}))) as GitHubUser;
  const login = (user.login || "").toLowerCase();

  // 3) allowlist check
  if (!login || !allowedUsers(env).has(login)) {
    throw forbidden(`GitHub user '${login || "?"}' is not allowed — add them to GITHUB_ALLOWED_USERS`);
  }

  // 4) create admin session + redirect to the dashboard
  const session = await createSessionCookie(env.SESSION_SECRET || "dev-session-secret-change-me");
  return new Response(null, {
    status: 302,
    headers: {
      Location: env.DASHBOARD_ORIGIN || "/",
      "Set-Cookie": `rodex_session=${session}; Path=/; HttpOnly; Max-Age=43200; SameSite=None; Secure`,
    },
  });
}
