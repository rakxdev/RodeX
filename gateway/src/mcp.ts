/**
 * mcp.ts — the RodeX MCP server (Streamable HTTP, stateless).
 *
 * Served at /mcp on the SAME gateway worker (founder decision: one worker,
 * one deploy, MCP budgets share the single-point RateLimiterDO).
 *
 * Auth: master keys ONLY (Authorization: Bearer rok_mcp_…) — no OAuth.
 * Scope: FULL platform access (every app/table/item) — founder decision.
 * Mutations are hard-gated: without `confirmed: true` the server refuses
 * with a structured confirmation_required response the agent must relay to
 * the user BEFORE executing anything.
 *
 * Tools reuse the exact tested gateway handlers (items/tables/registry),
 * so MCP traffic goes through the same validation, idempotency, size caps,
 * and per-app budgets as REST traffic.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, type StatelessMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import type { Env } from "./env";
import { sessionSecret } from "./env";
import { hashKey } from "./auth";
import { createStorage } from "./storage";
import type { AppContext } from "./items";
import { handleDelete, handleGet, handlePut, handleQuery, handleUpdate } from "./items";
import { handleCreateTable, handleDeleteTable, handleListTables } from "./tables";
import { createApp, getApp, softDelete, toPublic } from "./registry";
import { gateMCPRequest } from "./rate";
import { APP_NAME_PATTERN, TABLE_NAME_PATTERN } from "./limits";

// ── helpers ─────────────────────────────────────────────────────────────────

export interface McpIdentity {
  keyId: string;
  name: string;
}

/** Validate Authorization: Bearer rok_mcp_… against stored hashes. */
export async function authMcpKey(env: Env, request: Request): Promise<McpIdentity | null> {
  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(rok_mcp_[A-Za-z0-9_-]{43})$/i.exec(auth);
  if (!m) return null;
  const row = await createStorage(env).mcpKeyFindByHash(await hashKey(sessionSecret(env), m[1]));
  return row ? { keyId: row.keyId, name: row.name } : null;
}

/** Build an AppContext for any app — the master key owns every app. */
async function ctxFor(env: Env, appId: string): Promise<AppContext> {
  const storage = createStorage(env);
  const row = await getApp(storage, appId);
  return { env, appId: row.appId, storage, ownedTables: new Set(row.tables) };
}

/** Normalize a tool result into an MCP text block (structured JSON). */
function resultText(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** Run a tool body, converting ANY thrown error into a structured result. */
async function safe<T>(fn: () => Promise<T>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const out = await fn();
    return resultText(out);
  } catch (e) {
    const err = e as { toJson?: () => { error?: { code: number; message: string } }; message?: string };
    const j = err.toJson?.();
    const code = j?.error?.code;
    return resultText({ ok: false, code: code ?? "error", message: j?.error?.message ?? err.message ?? "Unknown error" });
  }
}

/** Unwrap the { body, replay } envelope the withIdem-based REST handlers return. */
function unwrap<T extends { body: string }>(out: T): unknown {
  return JSON.parse(out.body);
}

/** The refusal the confirmation gate returns (agents must relay it verbatim). */
function needConfirmation(what: Record<string, unknown>): { content: Array<{ type: "text"; text: string }> } {
  return resultText({
    ok: false,
    code: "confirmation_required",
    what_would_happen: what,
    ask_user:
      "Present exactly what will happen to the user and ask for explicit approval. " +
      "Only retry with confirmed: true after the user has approved. Never fabricate approval.",
  });
}

/** Full operating manual — served by get_instructions and shown in the console. */
export const MCP_MANUAL = `# RodeX MCP — Operating Manual

You are connected to the RodeX database platform (master-key access).
Your identity is bound to a console-created master key: you can operate
EVERY app, table, and item on the platform.

## Non-negotiable rules

1. CONFIRM EVERY MUTATION. Tools that create, update, or delete anything
   (apps, tables, items) require confirmed: true. NEVER call them with
   confirmed: true without the user's explicit approval. If a call returns
   confirmation_required, stop, present what_would_happen to the user, ask,
   and only retry after approval.
2. GATHER BEFORE ACTING. Collect every value you need from the user (which
   app, table, keys, payload) BEFORE proposing a mutation. Present the full
   plan as a group, get one approval, then execute step by step.
3. NEVER guess app or table names — always list_apps / list_tables first.
4. Reads are free: use get_item / query / list_* freely to understand data
   before proposing changes.

## Tools

- health — server + auth status (read)
- get_instructions — this manual (read)
- list_apps / get_app — app inventory + details (read)
- list_tables — tables of an app, with key schema (read)
- get_item — one item (pk required; sk defaults to "~") (read)
- query — pk + optional sk_begins_with, limit <= 100, pagination (read)
- create_app / delete_app — app lifecycle (MUTATION — confirm)
- create_table / delete_table — table lifecycle (MUTATION — confirm)
- put_item / update_item / delete_item — item lifecycle (MUTATION — confirm)

## Budgets

MCP traffic: 600 total / 120 writes / 240 reads per minute, platform-wide.
429 responses name the budget and carry retry_after seconds. App budgets
apply too (per-app 600 total / 120 writes / 240 reads per minute).

## Conventions

- Items are { pk, sk?, data: {...} } — sk defaults to "~" on put/get.
- Writes are idempotent: pass request_id to retry safely; updates are
  version-guarded (expected_version → 409 on conflict).
- Items cap at 20 KB; query limit max 100.
- Returned results are JSON text blocks — read them carefully before
  proposing the next step.`;

// ── server factory ──────────────────────────────────────────────────────────

const pkSchema = z.string().min(1).max(500);
const skSchema = z.string().min(1).max(500).optional();
const dataSchema = z.record(z.string(), z.unknown());
const confirmedSchema = z.boolean().optional().describe("MUST be true — only after the user explicitly approved this mutation");

function buildMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: "rodex", version: "1.0.0" });

  // ── read-only tools ────────────────────────────────────────────────────────

  server.registerTool(
    "health",
    {
      description: "Server + auth status. Call first when in doubt.",
      inputSchema: {},
    },
    async () =>
      resultText({
        ok: true,
        service: "rodex-gateway",
        mcp: "rodex/1.0.0",
        auth: "master-key",
        identity: "master",
        instructions: "Run get_instructions for the operating manual.",
      }),
  );

  server.registerTool(
    "get_instructions",
    {
      description: "Returns the full operating manual: confirmation rules, tool list, budgets, conventions. Read it before any mutation.",
      inputSchema: {},
    },
    async () => resultText({ ok: true, manual: MCP_MANUAL }),
  );

  server.registerTool(
    "list_apps",
    {
      description: "Lists every app on the platform (id, name, status, tables, description). Always call this before operating on data — never guess app ids.",
      inputSchema: {},
    },
    async () => {
      await gateMCPRequest(env, "read");
      const apps = await createStorage(env).listApps();
      return resultText({ ok: true, apps: apps.map(toPublic) });
    },
  );

  server.registerTool(
    "get_app",
    {
      description: "Details of one app: name, status, tables, description, key_prefix.",
      inputSchema: { app_id: z.string().min(1) },
    },
    async ({ app_id }) =>
      safe(async () => {
        await gateMCPRequest(env, "read");
        return { ok: true, app: toPublic(await getApp(createStorage(env), app_id)) };
      }),
  );

  server.registerTool(
    "list_tables",
    {
      description: "Tables of one app (logical names + key schema via app ownership). Use before any item operation.",
      inputSchema: { app_id: z.string().min(1) },
    },
    async ({ app_id }) =>
      safe(async () => {
        await gateMCPRequest(env, "read");
        const ctx = await ctxFor(env, app_id);
        return { ok: true, tables: (await handleListTables(ctx)).result.tables };
      }),
  );

  server.registerTool(
    "get_item",
    {
      description: "Fetch one item. sk is optional and defaults to '~'. Pass strong: true only when you need read-after-write consistency (costs more budget).",
      inputSchema: { app_id: z.string().min(1), table: z.string().min(1).max(42), pk: pkSchema, sk: skSchema, strong: z.boolean().optional() },
    },
    async ({ app_id, table, pk, sk, strong }) =>
      safe(async () => {
        await gateMCPRequest(env, "read");
        const ctx = await ctxFor(env, app_id);
        const body: Record<string, unknown> = { table, pk };
        if (sk !== undefined) body["sk"] = sk;
        if (strong) body["strong"] = true;
        return handleGet(ctx, body);
      }),
  );

  server.registerTool(
    "query",
    {
      description: "Query items by pk, optionally filtered by sk_prefix. limit ≤ 100; paginate with next_start_key until has_more is false.",
      inputSchema: {
        app_id: z.string().min(1),
        table: z.string().min(1).max(42),
        pk: pkSchema,
        sk_prefix: z.string().max(500).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        start_key: z.string().optional(),
      },
    },
    async ({ app_id, table, pk, sk_prefix, limit, start_key }) =>
      safe(async () => {
        await gateMCPRequest(env, "read");
        const ctx = await ctxFor(env, app_id);
        const body: Record<string, unknown> = { table, pk };
        if (sk_prefix !== undefined) body["sk_prefix"] = sk_prefix;
        if (limit !== undefined) body["limit"] = limit;
        if (start_key !== undefined) body["start_key"] = start_key;
        return handleQuery(ctx, body);
      }),
  );

  // ── mutation tools (confirmation-gated) ────────────────────────────────────

  server.registerTool(
    "create_app",
    {
      description:
        "Create a new app (its own API key + tables). MUTATION: gather the name (+ optional description ≤ 200 chars) from the user, present the plan, and get explicit approval before calling with confirmed: true.",
      inputSchema: {
        name: z.string().regex(APP_NAME_PATTERN, "lowercase alnum, 1-40 chars, may contain _ and -"),
        description: z.string().max(200).optional(),
        confirmed: confirmedSchema,
      },
    },
    async ({ name, description, confirmed }) => {
      if (!confirmed) return needConfirmation({ action: "create_app", name, description });
      return safe(async () => {
        await gateMCPRequest(env, "write");
        const { app, api_key } = await createApp(createStorage(env), sessionSecret(env), name, description);
        return { ok: true, app: { ...app, api_key } };
      });
    },
  );

  server.registerTool(
    "delete_app",
    {
      description:
        "Soft-delete an app (purge happens after the recovery window). MUTATION: tell the user which app and what data is affected, get explicit approval, then call with confirmed: true.",
      inputSchema: { app_id: z.string().min(1), confirmed: confirmedSchema },
    },
    async ({ app_id, confirmed }) => {
      if (!confirmed) return needConfirmation({ action: "delete_app", app_id });
      return safe(async () => {
        await gateMCPRequest(env, "write");
        return { ok: true, app: await softDelete(createStorage(env), app_id) };
      });
    },
  );

  server.registerTool(
    "create_table",
    {
      description:
        "Create a table in an app. MUTATION: confirm the table name with the user first (lowercase alnum, up to 42 chars, may contain _ and -), then call with confirmed: true.",
      inputSchema: { app_id: z.string().min(1), name: z.string().regex(TABLE_NAME_PATTERN, "lowercase alnum, 1-42 chars"), confirmed: confirmedSchema },
    },
    async ({ app_id, name, confirmed }) => {
      if (!confirmed) return needConfirmation({ action: "create_table", app_id, table: name });
      return safe(async () => {
        await gateMCPRequest(env, "write");
        const ctx = await ctxFor(env, app_id);
        return unwrap(await handleCreateTable(ctx, { name }));
      });
    },
  );

  server.registerTool(
    "delete_table",
    {
      description:
        "Delete a table and ALL its data — irreversible. MUTATION: state the table and the data it holds to the user, get explicit approval, then call with confirmed: true.",
      inputSchema: { app_id: z.string().min(1), name: z.string().regex(TABLE_NAME_PATTERN, "lowercase alnum, 1-42 chars"), confirmed: confirmedSchema },
    },
    async ({ app_id, name, confirmed }) => {
      if (!confirmed) return needConfirmation({ action: "delete_table", app_id, table: name, note: "ALL data in this table is destroyed" });
      return safe(async () => {
        await gateMCPRequest(env, "write");
        const ctx = await ctxFor(env, app_id);
        return unwrap(await handleDeleteTable(ctx, { name }));
      });
    },
  );

  server.registerTool(
    "put_item",
    {
      description:
        "Write an item {pk, sk?, data}. sk defaults to '~'. Pass request_id to make retries idempotent; overwrite: true to force-replace (resets version). MUTATION: show the user exactly what will be written and where, get approval, then confirmed: true.",
      inputSchema: {
        app_id: z.string().min(1),
        table: z.string().min(1).max(42),
        pk: pkSchema,
        sk: skSchema,
        data: dataSchema,
        request_id: z.string().min(8).max(64).optional(),
        overwrite: z.boolean().optional(),
        confirmed: confirmedSchema,
      },
    },
    async ({ app_id, table, pk, sk, data, request_id, overwrite, confirmed }) => {
      if (!confirmed) return needConfirmation({ action: "put_item", app_id, table, pk, sk, data });
      return safe(async () => {
        await gateMCPRequest(env, "write");
        const ctx = await ctxFor(env, app_id);
        const body: Record<string, unknown> = { table, item: { pk, data } };
        if (sk !== undefined) (body.item as Record<string, unknown>).sk = sk;
        if (request_id !== undefined) body["request_id"] = request_id;
        if (overwrite) body["overwrite"] = true;
        return unwrap(await handlePut(ctx, body));
      });
    },
  );

  server.registerTool(
    "update_item",
    {
      description:
        "Update an item's data (version-guarded: pass expected_version to get 409 on conflict instead of clobbering). MUTATION: show current vs new data to the user, get approval, then confirmed: true.",
      inputSchema: {
        app_id: z.string().min(1),
        table: z.string().min(1).max(42),
        pk: pkSchema,
        sk: z.string().min(1).max(500), // REQUIRED — the REST contract does not default sk on update
        data: dataSchema,
        expected_version: z.number().int().optional(),
        request_id: z.string().min(8).max(64).optional(),
        confirmed: confirmedSchema,
      },
    },
    async ({ app_id, table, pk, sk, data, expected_version, request_id, confirmed }) => {
      if (!confirmed) return needConfirmation({ action: "update_item", app_id, table, pk, sk, data });
      return safe(async () => {
        await gateMCPRequest(env, "write");
        const ctx = await ctxFor(env, app_id);
        const body: Record<string, unknown> = { table, pk, sk, data };
        if (expected_version !== undefined) body["expected_version"] = expected_version;
        if (request_id !== undefined) body["request_id"] = request_id;
        return unwrap(await handleUpdate(ctx, body));
      });
    },
  );

  server.registerTool(
    "delete_item",
    {
      description:
        "Delete one item by pk/sk. MUTATION: state the exact item to the user, get approval, then confirmed: true.",
      inputSchema: { app_id: z.string().min(1), table: z.string().min(1).max(42), pk: pkSchema, sk: z.string().min(1).max(500), confirmed: confirmedSchema },
    },
    async ({ app_id, table, pk, sk, confirmed }) => {
      if (!confirmed) return needConfirmation({ action: "delete_item", app_id, table, pk, sk });
      return safe(async () => {
        await gateMCPRequest(env, "write");
        const ctx = await ctxFor(env, app_id);
        return unwrap(await handleDelete(ctx, { table, pk, sk }));
      });
    },
  );

  return server;
}

// ── handler wiring ──────────────────────────────────────────────────────────

/**
 * Create the Streamable HTTP handler for one request. Stateless JSON mode:
 * no SSE, no sessions → stays inside free-plan wall-clock limits.
 */
export function createMcpRoute(env: Env): StatelessMcpHandler {
  return createMcpHandler(() => buildMcpServer(env), {
    responseMode: "json",
    legacy: "stateless",
  });
}
