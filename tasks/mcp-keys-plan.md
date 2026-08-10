# Implementation Plan: MCP key parity — rotate_app_key + view_app_key

Status: IMPLEMENTED — code+tests+docs done, deployed, live-verified, NOT pushed · Branch: feat/mcp (local, unpushed)

## Why
The user wants full console automation parity through MCP. The console can
rotate an app's key and re-view it inside the 48 h window; MCP cannot. This
closes that gap. Master-key management (mint/view/delete `rok_mcp_`) stays
**console-only by design** (an AI must not mint its own credentials).

## Decisions
1. **`rotate_app_key`** — confirmation-gated (MUTATION): rotates an app's
   `rok_` key via the tested `registry.rotateKey`; returns the new key once in
   the result (same as console). Old key dies instantly.
2. **`view_app_key`** — confirmation-gated (secret reveal): decrypts the
   app's key cipher inside its 48 h recovery window (same rule as the
   console's VIEW KEY). Outside the window / no cipher → structured error:
   "recovery window expired — rotate instead".
3. Both count as MCP writes (budget `mcp:write`, 120/min) — they hit the
   registry, not reads.
4. Tool count 18 → 20. Manual (`get_instructions`), docs/mcp.md, public
   /docs table, console MCP page tool reference, ADR-006 count, CHANGELOG
   updated in the same round.

## Tasks
- [x] T1: tools in mcp.ts (rotate_app_key, view_app_key) + manual update
  - Acceptance: both registered; descriptions state the confirmation rule
  - Verify: tsc; discovery test lists 20 tools
- [x] T2: tests — gate refusals for both; rotate flow (old key 401, new key
  works); view flow (same raw key inside window; missing cipher → structured
  error)
  - Verify: vitest — full suite green
- [x] T3: docs (docs/mcp.md, DocsPage, McpPage, ADR-006, CHANGELOG,
  tasks/todo + mcp-plan status)
  - Verify: grep doc-vs-code audit
- [ ] T4: local checks → deploy (gateway + dashboard) → LIVE test on prod
  (rotate + view on a scratch app, old-key-401 proof) → commit
  - Verify: live curl / pi tools; NOT pushed

## Risks
- Rotate on the wrong app = that app's clients break until key is shared →
  gate + description warn; user approves first.
- View outside window → structured error, no crash (tested).
