# Implementation Plan: MCP Server for RodeX (the Universal Gateway Interface)

Status: **IMPLEMENTED — local branch feat/mcp, all phases A–E code+docs done, 137/137 tests, NOT pushed/deployed (per founder instruction)** · Source of truth: SPEC.md, PRODUCT.md, docs/decisions/ADR-001..005 · Research: official Cloudflare + MCP spec docs (2026-07)

## Review answers (locked with the founder, 2026-08)

1. **Full access — confirmed**: MCP master keys may create AND delete apps, tables,
   items — everything. All mutations stay confirmation-gated.
2. **Key re-view: ANYTIME — no window**: MCP key ciphertext has NO expiry (unlike app
   keys' 48 h). Console can show the key whenever needed. Trade-off documented:
   rotating `MCP_KEY_SECRET` makes existing keys un-viewable (delete + recreate);
   deleting a key destroys it forever.
3. **ONE worker — confirmed**: MCP is served from the **existing gateway worker**
   at `https://rodex-gateway.rakxdev.workers.dev/mcp`. No new worker, no new secrets;
   MCP budgets share the SAME RateLimiterDO. Name cross-check done: `rodex-mcp`
   is available (404 = free) if a dedicated worker is ever wanted; hyphen form is
   mandatory (underscores are not valid in workers.dev subdomains).
4. **DynamoDB feature audit — done (all supported)**: table delete already exists
   in the storage layer (DeleteTable, used by app purge) — only the API surface
   (`POST /v1/table/delete`) is missing and will be added (one endpoint over an
   existing tested path).

## Overview

Expose the **entire RodeX gateway as an MCP server** (`https://rodex-mcp.rakxdev.workers.dev/mcp`, Streamable HTTP transport) so **any coding agent** (Cursor, Claude Code, VS Code/Copilot, Windsurf, Zed, Gemini CLI, Codex, Cline, Continue, …) can operate the platform — every app, every table, every item — through one URL and one **master API key**.

Keys are `rok_mcp_`-prefixed, **created and managed only in the console** (new MCP page): name + description per key, view-again inside a 48 h window, delete anytime, **no rotation** (user directive). **No GitHub OAuth for MCP** (user directive) — the master key is the only auth.

Every tool is designed with rich instructions, and a hard **confirmation gate** guards every mutation: the agent must gather all information, present the plan to the user, and obtain explicit approval before any create/delete/update executes — enforced server-side, not just by description.

## Architecture Decisions

1. **Single worker — MCP lives IN the existing gateway** at `/mcp` (founder decision,
   review answer #3). No new worker, no new secrets, one deploy. The MCP handler
   shares the gateway's env (AWS creds, SESSION/MCP secrets), storage core, and —
   importantly — the SAME RateLimiterDO, so MCP budgets are counted by the same
   single-point authority as app budgets. Bundle grows by the MCP SDK only.
2. **Stateless Streamable HTTP server** using Cloudflare's current blessed path (`createMcpHandler` from `agents/mcp` — `McpAgent` is deprecated). JSON-only responses (no SSE) → never hits the free-plan wall-clock cap. Single endpoint `/mcp`, POST JSON-RPC. **Origin validated** on every request (spec-required DNS-rebinding protection): missing Origin (non-browser clients) allowed; browser origins allow-listed.
3. **Master-key auth**: every request must carry `Authorization: Bearer rok_mcp_…`. The worker validates against `rodex_mcp_keys` (hash-only storage, HMAC-SHA256 with a dedicated `MCP_KEY_SECRET`). Invalid/missing → JSON-RPC error `-32001 Unauthorized` (never reveals whether a key exists). No OAuth endpoints at all.
4. **Key lifecycle (console-only)**: gateway gains admin endpoints `POST/GET /v1/admin/mcp/keys`, `POST /v1/admin/mcp/keys/:id/view` (**anytime — AES-GCM ciphertext with NO expiry**, founder decision), `DELETE /v1/admin/mcp/keys/:id`. **No rotate endpoint by design.** Keys stored in new auto-provisioned table `rodex_mcp_keys` (5/5, consistent with ADR-001). Deleting a key destroys it forever.
5. **MCP traffic budgets** (separate from app budgets, in-worker sliding-window counter — one personal worker ≈ single isolate, documented honest ceiling like the 5 RCU note): **600 total / 120 writes / 240 reads per minute platform-wide** for MCP. 429s name the budget.
6. **Confirmation gate (hard rule)**: every mutating tool requires `confirmed: true` in its arguments. Without it the server refuses with a structured `confirmation_required` response the agent must relay to the user. Tool descriptions + a `get_instructions` tool + the console manual all state the protocol: *gather everything, present the plan, ask, then execute*.
7. **Gateway addition (small)**: `POST /v1/table/delete` — currently tables can't be deleted individually (only via app purge). Needed for full gateway access. Added with tests; does not change existing contracts.
8. **Deploy order**: gateway first (key CRUD + table delete), then MCP worker, then dashboard page. All behind the protected-main PR flow.

## Key model

| Field | Rule |
|---|---|
| Format | `rok_mcp_` + 43 base64url chars (256-bit), crypto-random |
| Storage | HMAC-SHA256 hash only + AES-GCM ciphertext with `recoverable_until` (48 h) |
| Shown | once at creation; **re-viewable ANYTIME** (gold reveal; no expiry — founder decision) |
| Delete | immediate revocation — server checks hash on every request |
| Rotation | **not offered** (user directive): delete + create is the flow |
| Name/description | name required ≤ 40 chars; description optional ≤ 200 chars |
| Scope | **full platform access** — every app, table, item (user directive) |

## Tools (full gateway surface, master key)

| Tool | Kind | Confirm? | Purpose / instructions baked into description |
|---|---|---|---|
| `health` | read | — | server + auth status; always callable first |
| `get_instructions` | read | — | returns the full operating manual (protocol, conventions, budgets) |
| `list_apps` | read | — | all apps: id, name, description, status — agent must pick `app_id` before any data work |
| `get_app` | read | — | one app's details |
| `create_app` | mutate | ✅ | name + description; state the app's purpose to the user first |
| `delete_app` | mutate | ✅ | soft delete (recoverable window); warn user about the purge schedule |
| `list_tables` | read | — | app's tables + key schema (pk/sk names) |
| `create_table` | mutate | ✅ | table name rules (≤ 40 chars, `[a-z0-9_]+`); confirm before creating |
| `delete_table` | mutate | ✅ | **new gateway endpoint** `POST /v1/table/delete`; warn: data is gone |
| `put_item` | mutate | ✅ | pk/sk rules, 20 KB cap, request_id idempotency, expected_version 409s |
| `get_item` | read | — | pk required, sk defaults to `~` |
| `update_item` | mutate | ✅ | partial update, version-guarded |
| `delete_item` | mutate | ✅ | confirm with the exact pk/sk |
| `query` | read | — | pk required, optional sk_begins_with, limit ≤ 100, pagination |

Every mutate description ends with the same rule: *"NEVER call with confirmed:true unless the user has explicitly approved. Present exactly what will change, ask, wait."* The server enforces it regardless.

## Confirmation protocol (enforced)

1. Read-only tools: free.
2. Mutating call without `confirmed: true` → server returns `{ok:false, code:"confirmation_required", what_would_happen:{…}, ask_user:"Present this to the user and ask for explicit approval before retrying with confirmed:true"}`.
3. Mutating call with `confirmed: true` → executes exactly the args given, returns the same envelope the REST API returns.
4. The `get_instructions` tool + console manual tell agents to **batch their plan**: state all commands, gather all missing values from the user, confirm the group once, then execute step by step.

## Dashboard: MCP page (console)

- **Header**: new `MCP` button (next to DOCS/USAGE/EXIT in the console header) → separate route `/mcp`.
- **Left column — KEY MANAGEMENT**: create form (name + description) → key revealed once (gold, COPY/HIDE); key list (name, description, created, recoverable-until badge, status dot); VIEW inside 48 h; DELETE with red confirm modal; explicit note: *no rotation — delete & recreate*.
- **Right column — OPERATING MANUAL** (minimal, structured, knowledge-rich):
  1. What this is (one paragraph) + the endpoint URL (copy button)
  2. Connect recipes per client: Cursor (`url` + `headers.Authorization` with `${env:VAR}`), Claude Code (remote URL / `npx mcp-remote --header`), VS Code/Copilot, Zed, Windsurf, Gemini CLI, generic
  3. Master-key concept + safety (keep in env var, never paste into chat prompts)
  4. Tool reference table (name · reads/mutates · confirm? · what it does)
  5. **THE CONFIRMATION PROTOCOL** (the agent rules, copy-paste-ready prompt)
  6. Budgets + error codes (401, 429 budget-named, confirmation_required)
  7. FAQ (key lost? 48 h window → recreate; agent misbehaving? delete key)
- Mobile: stacked; desktop: two columns. Dark console theme, gold for key reveals.

## Task List

### Phase A: Gateway — MCP key management + table delete (foundation)
- [ ] A1: `rodex_mcp_keys` table provisioning (auto, like rodex_meta) + storage helpers (create/list/view/delete key, hash + 48 h cipher)
  - Acceptance: helpers round-trip; hash-only never stores raw; view respects window; delete removes row
  - Verify: `npm test` (new storage tests); tsc
  - Files: storage-aws.ts, storage-mock.ts, storage.ts, tests — M
- [ ] A2: Admin endpoints `POST/GET /v1/admin/mcp/keys`, `POST …/:id/view`, `DELETE …/:id` (admin session, admin budget; no rotate endpoint exists by design)
  - Acceptance: 401 without session; key returned once; view inside/outside 48 h; delete → immediate 401 on MCP use; name/description validation
  - Verify: `npm test` (admin tests); curl against prod after deploy
  - Files: admin.ts, index.ts, tests — M
- [ ] A3: `POST /v1/table/delete` (app auth) — existing soft-delete semantics, hard confirm via app key
  - Acceptance: deletes only owned table; 403 cross-app; 404 unknown; tested
  - Verify: `npm test`; curl live
  - Files: tables.ts, index.ts, tests — S
### Checkpoint: gateway green (tests + tsc + lint), deploy gateway
### Phase B: MCP worker — skeleton, auth, read-only tools
- [ ] B1: `/mcp` route inside the gateway (MCP SDK handler, Origin validation, Bearer auth vs `rodex_mcp_keys`, MCP budgets via the SAME RateLimiterDO)
  - Acceptance: `/mcp` answers initialize/tools/list; bad/missing key → -32001; unknown Origin rejected
  - Verify: MCP Inspector locally + unit tests (auth matrix)
  - Files: gateway/src/mcp/*, index.ts, tests — M
- [ ] B2: read-only tools: `health`, `get_instructions`, `list_apps`, `get_app`, `list_tables`, `get_item`, `query`
  - Acceptance: each maps to the gateway core; app isolation preserved (only owned apps visible); instruction content includes the confirmation protocol
  - Verify: unit tests per tool (valid/invalid args); Inspector live
  - Files: mcp/src/tools/*, tests — M
### Checkpoint: read-only path live end-to-end (Inspector), review with human
### Phase C: Mutation tools + confirmation gate
- [ ] C1: confirmation gate core: mutating calls refuse without `confirmed:true` (structured refusal), execute with it
  - Acceptance: matrix tests — no flag → refusal; flag → executes; flag+wrong args → validation error
  - Verify: unit tests; Inspector demo
  - Files: mcp/src/gate.ts, tests — S
- [ ] C2: mutation tools: `put_item`, `update_item`, `delete_item`, `create_table`, `delete_table`, `create_app`, `delete_app` (all confirm-gated, all wired to gateway core)
  - Acceptance: each tool's success path + refusal path + error paths (413, 409, 429, 404) tested
  - Verify: `npm test`; live Inspector: create table → put → get → update → delete with confirmations
  - Files: mcp/src/tools/*, tests — M
### Checkpoint: full data-plane live with confirmations, review with human
### Phase D: Dashboard MCP page
- [ ] D1: `/mcp` route + header button; key management panel (create/reveal/list/view/delete)
  - Acceptance: create shows `rok_mcp_` once; view inside 48 h; delete confirm modal; empty state; error toasts
  - Verify: build + tsc; browser check (Chrome DevTools MCP)
  - Files: pages/McpPage.tsx, AppRoutes, header, api client, components — M
- [ ] D2: operating manual panel (connect recipes, tool table, confirmation protocol, budgets, FAQ) + copy buttons
  - Acceptance: all sections render; copy works; links correct
  - Verify: browser check; content review with human
  - Files: McpPage.tsx (+ manual data file) — M
### Checkpoint: page reviewed by human
### Phase E: Docs, CI, deploy, live verification
- [ ] E1: docs — api.md + openapi.yaml (mcp key endpoints, table delete), docs/mcp.md (server, auth, tool reference, protocol, client recipes), usage page MCP section, ADR-006 (MCP master-key + confirmation gate), CHANGELOG, plan/todo close-out
  - Acceptance: every claim matches the shipped code; README links docs/mcp.md
  - Verify: doc-vs-code grep audit (like the last docs round)
  - Files: docs/*, CHANGELOG.md, tasks/* — M
- [ ] E2: CI/deploy wiring — quality gate covers the new MCP code (tests, tsc, lint, build); deploy workflow unchanged (single gateway worker); dashboard deployed
  - Acceptance: CI green on PR; `/v1/health` + `/mcp` reachable on prod
  - Verify: PR check run; prod curls; MCP Inspector against prod
  - Files: .github/workflows/* (if needed), dashboard — S
### Checkpoint: COMPLETE — live demo with the user (connect one real agent)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Agent ignores confirmation protocol | data loss / unwanted changes | server-enforced `confirmed` flag + structured refusal; delete-key is the panic button; docs push the protocol |
| Master key pasted into a chat/prompt | key exposure | 48 h view window is console-only; delete & recreate; hash-only storage; agents told to use `${env:VAR}` |
| MCP traffic shares DynamoDB capacity with apps | throttles | dedicated MCP budget (120 writes/min) + same 20 KB caps; documented ceiling |
| Free-plan wall-clock on streams | cut-off responses | JSON-only responses, no SSE (spec allows) |
| Cross-dir import (mcp → gateway core) bundling issue | build break | tested at scaffold; fallback = extract `shared/` core |
| Clients with quirky header support | can't connect | mcp-remote bridge + per-client recipes; header-auth supported in every major client (researched) |
| Key table proliferation | clutter | keys list shows created/last-used; delete anytime; no rotation keeps the model simple |

## Resolved during review (2026-08)
1. Control-plane in MCP: **YES — full access, delete everything** (confirmation-gated).
2. View-again: **ANYTIME — no window** (ciphertext without expiry).
3. Single worker: **YES — MCP on the existing gateway at `/mcp`**; `rodex-mcp` name checked and available if ever needed (hyphen mandatory; underscore invalid).
4. DynamoDB feature audit: **all supported** — table delete exists in the storage layer (used by purge); only the `POST /v1/table/delete` API surface is being added.

## Remaining open questions
1. **MCP budget**: 600 total / 120 writes / 240 reads per minute (platform-wide, same RateLimiterDO). OK?
