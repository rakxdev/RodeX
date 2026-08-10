/**
 * mcpkeys.ts — console management of MCP master keys (the /mcp surface).
 *
 * Lifecycle per founder decisions (tasks/mcp-plan.md):
 *   - keys are `rok_mcp_`-prefixed, full platform access
 *   - created only here (console/admin session): name + optional description
 *   - raw key viewable ANYTIME (AES-GCM cipher without expiry — no window)
 *   - delete anytime; NO rotation endpoint (delete + create is the flow)
 */
import type { Hono } from "hono";
import { decryptKey, encryptKey, generateApiKey, hashKey, requireSession } from "./auth";
import { sessionSecret, type Env } from "./env";
import { badRequest, notFound, serviceUnavailable } from "./errors";
import { MCP_KEY_DESC_MAX, MCP_KEY_ID_PREFIX, MCP_KEY_NAME_MAX, MCP_KEY_PREFIX } from "./limits";
import { gateAdminRequest } from "./rate";
import { createStorage } from "./storage";
import type { McpKeyRow } from "./storage";

/** 1–40 printable chars, no control characters. */
function hasControl(s: string): boolean {
  return [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
}

function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length >= 1 && name.trim().length <= MCP_KEY_NAME_MAX && !hasControl(name);
}

function validDescription(desc: unknown): desc is string {
  return typeof desc === "string" && desc.trim().length <= MCP_KEY_DESC_MAX && !hasControl(desc);
}

function toPublic(row: McpKeyRow) {
  return {
    key_id: row.keyId,
    name: row.name,
    description: row.description,
    created_at: row.createdAt,
  };
}

export function registerMcpKeyRoutes(app: Hono<{ Bindings: Env }>): void {
  // create a master key (raw key returned exactly once; viewable anytime after)
  app.post("/v1/admin/mcp/keys", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const body = (await c.req.json().catch(() => null)) as { name?: unknown; description?: unknown } | null;
    if (!body || !validName(body.name)) {
      throw badRequest(`name is required (1–${MCP_KEY_NAME_MAX} printable chars)`);
    }
    if (body.description !== undefined && body.description !== null && !validDescription(body.description)) {
      throw badRequest(`description must be ≤ ${MCP_KEY_DESC_MAX} printable chars`);
    }
    const secret = sessionSecret(c.env);
    const keyId = `${MCP_KEY_ID_PREFIX}${randomHex(16)}`;
    const rawKey = generateApiKey(MCP_KEY_PREFIX);
    const row: McpKeyRow = {
      keyId,
      name: body.name.trim(),
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : undefined,
      keyHash: await hashKey(secret, rawKey),
      keyCipher: (await encryptKey(secret, rawKey)) ?? undefined,
      createdAt: Math.floor(Date.now() / 1000),
    };
    await createStorage(c.env).mcpKeyCreate(row);
    return c.json({ ok: true, result: { ...toPublic(row), key: rawKey } });
  });

  // list master keys (metadata only — never hashes or raw keys)
  app.get("/v1/admin/mcp/keys", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const rows = await createStorage(c.env).mcpKeyList();
    return c.json({ ok: true, result: { keys: rows.map(toPublic) } });
  });

  // re-view a raw master key — ANYTIME (no recovery window)
  app.post("/v1/admin/mcp/keys/:id/view", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    const row = await createStorage(c.env).mcpKeyGet(c.req.param("id"));
    if (!row) throw notFound("MCP key not found");
    if (!row.keyCipher) throw serviceUnavailable("Key cipher missing — delete and recreate this key");
    const rawKey = await decryptKey(sessionSecret(c.env), row.keyCipher);
    if (!rawKey) throw serviceUnavailable("Could not decrypt key — delete and recreate this key");
    return c.json({ ok: true, result: { key_id: row.keyId, key: rawKey } });
  });

  // delete a master key — instant revocation (auth checks the hash every request)
  app.delete("/v1/admin/mcp/keys/:id", async (c) => {
    await gateAdminRequest(c.env);
    await requireSession(sessionSecret(c.env), sessionTokenOf(c));
    await createStorage(c.env).mcpKeyDelete(c.req.param("id"));
    return c.json({ ok: true, result: { deleted: true, key_id: c.req.param("id") } });
  });
}

function randomHex(bytes: number): string {
  const out = crypto.getRandomValues(new Uint8Array(bytes));
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionTokenOf(c: { req: { header(name: string): string | undefined } }): string | undefined {
  const auth = c.req.header("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer) return bearer[1].trim();
  const x = c.req.header("x-rodex-session");
  if (x) return x.trim();
  const raw = c.req.header("cookie") || "";
  const m = /rodex_session=([^;]+)/.exec(raw);
  return m ? m[1] : undefined;
}
