<p align="center">
  <img src="brand/rodex-mark.svg" width="92" alt="RodexDB mark" />
</p>

<h1 align="center">RODEX&nbsp;DB</h1>

<h3 align="center">Your own database platform — per-app keys &amp; tables on DynamoDB, one clean API, <br/>every coding agent on MCP, all on the free tier. <em>$0 forever.</em></h3>

<p align="center">
  <a href="https://github.com/rakxdev/RodeX/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/rakxdev/RodeX/ci.yml?style=flat-square&label=quality%20gate&logo=github" alt="CI" /></a>
  <img src="https://img.shields.io/badge/tests-143%20passing-6a7c5c?style=flat-square&logo=vitest" alt="tests" />
  <img src="https://img.shields.io/badge/cost-%240%20forever-d9b64a?style=flat-square" alt="cost" />
  <img src="https://img.shields.io/badge/stack-DynamoDB%20·%20Workers%20·%20Pages-2a2c28?style=flat-square" alt="stack" />
  <img src="https://img.shields.io/badge/license-private-blue?style=flat-square" alt="license" />
</p>

<p align="center">
  <a href="https://rodexdb.pages.dev"><b>LIVE CONSOLE</b></a> ·
  <a href="https://rodexdb.pages.dev/docs"><b>API REFERENCE</b></a> ·
  <a href="https://rodexdb.pages.dev/usage"><b>USAGE &amp; LIMITS</b></a> ·
  <a href="docs/mcp.md"><b>MCP FOR AGENTS</b></a>
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/rakxdev/RodeX"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" /></a>
</p>

---

## Architecture

<img src="brand/architecture.svg" alt="RodexDB architecture diagram" />

---

## Table of Contents

1. [What is RodexDB](#what-is-rodexdb)
2. [Features](#features)
3. [How it stays free](#how-it-stays-free)
4. [Quick start — local](#quick-start--local)
5. [Deploy to Cloudflare — click-to-deploy](#deploy-to-cloudflare)
6. [Environment variables](#environment-variables)
7. [API & MCP — the developer surface](#api--mcp--the-developer-surface)
8. [Security invariants](#security-invariants)
9. [Testing & evidence](#testing--evidence)
10. [Documentation](#documentation)
11. [Credits](#credits)

---

## What is RodexDB

A **personal database gateway platform**: create apps, get isolated credentials, and every
app gets its own tables on DynamoDB through one documented HTTP API — plus a full
**MCP server** so any coding agent (Cursor, Claude Code, VS Code/Copilot, Gemini CLI, …)
can operate your data with one master key.

- **Per-app isolation** — every app has its own `rok_` key and its own
  `app_<id>_<name>` tables. Enforced at the storage layer: no cross-app access, ever.
- **One contract** — put / get / update / delete / query · idempotent writes
  (`request_id`, 24 h dedupe) · version-guarded updates (409 on conflict) · 20 KB items.
- **Strict limits you can watch** — single-point counters: the numbers the docs promise
  are the numbers enforced. 429s name their budget. LIVE METERS on every app.
- **MCP universal interface** — 21 tools, confirmation gate enforced server-side,
  master keys managed in the console (never by AI).
- **Free forever by design** — AWS always-free tier + Cloudflare free tier. No credit card.
  Every architectural number is derived from the free pools (see
  [docs/rate-limits.md](docs/rate-limits.md) and [docs/research-validation.md](docs/research-validation.md)).

---

## Features

| Capability | What you get |
|---|---|
| 🔑 **Per-app keys** | `rok_`-branded, hash-only at rest, shown once, 48 h view window, rotation |
| 🗂 **Per-app tables** | `app_<id>_<name>` physical isolation, 5 WCU/5 RCU, auto-provisioned |
| ✍️ **Items & queries** | put / get / update / delete / query with pagination, sk-prefix filters |
| 🔁 **Idempotency** | `request_id` dedupe with TTL auto-expiry (zero-cost) |
| 🛡 **Version guarding** | `expected_version` → 409 on conflict, never silent clobber |
| 📊 **Observability** | LIVE METERS per app: request budgets + storage (zero-cost peeks) |
| 🤖 **MCP for agents** | Streamable HTTP at `/mcp`, 21 tools, master keys, confirmation gate |
| 🚦 **Strict limits** | 600 total / 120 writes / 240 reads per app · 1000 platform · 60 admin — per minute |
| 👤 **Console** | React + Tailwind console: app board, key seals, live meters, MCP page |
| 🌐 **Public docs** | API reference, usage & limits, MCP manual — no login needed |

---

## How it stays free

```
AWS DynamoDB always-free tier   → 25 GB storage · 25 WCU · 25 RCU provisioned (ap-southeast-1)
Cloudflare Workers free plan    → gateway worker + Durable Object counters + 1/min purge cron
Cloudflare Pages free plan      → the console, static assets
```

The math is the product: every budget is *derived from* the free pools and enforced
strictly — one write ≤ 20 KB, per-app writes ≤ 120/min (~2/s), so the gateway never
asks DynamoDB for more than the free tier gives. **Never throttled by design.**
See [docs/rate-limits.md](docs/rate-limits.md) for the full math + live stress evidence.

---

## Quick start — local

> Zero AWS needed: the gateway runs against an in-memory mock.

```bash
git clone https://github.com/rakxdev/RodeX.git && cd RodeX
npm install
cp gateway/.dev.vars.example gateway/.dev.vars   # set ADMIN_PASSWORD (dev)
npm run dev                                       # gateway on :8787 (mock storage)
```

```bash
npm test                                          # 143 tests, mock storage
npm run typecheck                                 # strict TS
npm run lint                                      # eslint
cd dashboard && npm run dev                       # the console locally
```

---

## Deploy to Cloudflare

### ⚡ Click-to-deploy (gateway)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rakxdev/RodeX)

The button clones this repo into **your** Cloudflare account and walks you through
every secret as a form — each with a description of exactly what to paste
(defined in `gateway/package.json` → `cloudflare.bindings`).

**Prerequisites (5 minutes, one time):**

1. **AWS — IAM user** (~4 min): create `rodex-gateway` with the least-privilege
   inline policy from [docs/aws-setup.md](docs/aws-setup.md). Tables are
   **auto-provisioned** by the gateway on first use — nothing to create manually.
2. **GitHub OAuth app** (optional, for console login): callback URL
   `<your-worker>.workers.dev/v1/auth/github/callback`.
3. Run the button, paste the values it asks for, deploy.
4. **Console (Pages)** — 2 clicks: in Cloudflare dashboard → Pages → **Create project**
   → connect this GitHub repo → build preset **Vite**, output `dashboard/dist`,
   env `VITE_GATEWAY_URL` = your worker URL. (Your own Pages project name = your URL.)

**Then verify:** [docs/testing.md §Live](docs/testing.md) has the exact smoke script —
health → login → fabricate → key shown once → table → CRUD → 403 cross-app → 429.

### Manual deploy (the same thing, via CLI)

```bash
cd gateway
npx wrangler secret put ADMIN_PASSWORD        # and the other secrets — see docs/env.md
npx wrangler deploy                           # 🚀
# dashboard:
npm run deploy:dashboard                      # builds + publishes to Pages
```

CI note: pushing to `main` auto-deploys the gateway via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml); `main` is protected —
PRs only, required `quality` check.

---

## Environment variables

Full reference: **[docs/env.md](docs/env.md)**. Quick map:

| Secret (`wrangler secret put`) | What it is |
|---|---|
| `ADMIN_PASSWORD` | console fallback password (≥ 12 chars); changeable in-app |
| `SESSION_SECRET` | signs sessions + hashes keys (≥ 24 chars; rotating it is a big deal) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | console GitHub OAuth |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | DynamoDB access (IAM user above) |

| Var (`wrangler.toml [vars]`) | What it is |
|---|---|
| `STORAGE` | `"mock"` (local) / `"aws"` (production) |
| `DASHBOARD_ORIGIN` | console origin for CORS + OAuth callbacks |

---

## API & MCP — the developer surface

- **REST** — full reference on the live site: [rodexdb.pages.dev/docs](https://rodexdb.pages.dev/docs)
  (or [docs/api.md](docs/api.md) + [docs/openapi.yaml](docs/openapi.yaml) in-repo).
  Base: `<gateway>/v1` · auth: `X-App-Id` + `X-Api-Key` · budgets and error codes
  documented with evidence.
- **MCP** — one endpoint, one master key, every agent: **[docs/mcp.md](docs/mcp.md)**.
  21 tools (8 read + 13 mutation), server-enforced confirmation gate, own budgets.

```text
GET  /v1/health                    → ok
POST /v1/table/create              → your table, 5 WCU/5 RCU, registered
POST /v1/item/put                  → idempotent write, version starts at 1
POST /v1/item/get                  → read (sk defaults to "~")
POST /v1/query                     → pk + sk_prefix + pagination
POST /v1/admin/…                   → console surface (session auth)
POST /mcp                          → MCP (JSON-RPC, master-key auth)
```

---

## Security invariants

> Tested and non-negotiable — see the test suite.

- App tables are always `app_<app_id>_<name>`; unowned tables → **403, no existence leak**
- Keys stored as **HMAC hashes**; shown once; rotate instantly revokes; 48 h encrypted
  view window; MCP keys viewable anytime, **no rotation** (delete + recreate)
- MCP mutations require **`confirmed: true`** — enforced server-side, never by prompt
- Idempotency via `request_id` (24 h, TTL-expired); version-guarded updates (409)
- 20 KB write cap → always inside the free WCU budget
- Secrets only via `wrangler secret`; logs never contain keys or payloads
- Sessions: HMAC-signed, 12 h, dual-channel (cookie + bearer) — works in every browser
- `npm audit` — 0 vulnerabilities; CI runs security audit on every push

---

## Testing & evidence

- **143 tests** across the gateway: auth matrix, storage contract (mock + AWS marshaling),
  registry lifecycle, strict rate budgets + DO atomicity, full-stack HTTP, admin surface,
  **MCP integration over real JSON-RPC** (auth, gate refusals, every tool, write-burst stress)
- **Live stress evidence**: write burst 250 → exactly 120 allowed / 130 × 429 naming the
  budget; reads trip at #241; admin at 60 — the numbers the docs promise are the numbers
  enforced ([docs/rate-limits.md](docs/rate-limits.md))
- Every release: `quality` gate = lint → typecheck → tests → bundle → audit (green-blocked)

---

## Documentation

| Doc | What it covers |
|---|---|
| [SPEC.md](SPEC.md) · [PRODUCT.md](PRODUCT.md) | product spec, decisions |
| [docs/api.md](docs/api.md) · [docs/openapi.yaml](docs/openapi.yaml) | the full contract |
| [docs/rate-limits.md](docs/rate-limits.md) | capacity math + stress evidence |
| [docs/mcp.md](docs/mcp.md) | the MCP universal interface |
| [docs/env.md](docs/env.md) | every variable & secret |
| [docs/aws-setup.md](docs/aws-setup.md) | IAM + auto-provisioning |
| [docs/testing.md](docs/testing.md) | tests + live runbook |
| [docs/ci-cd.md](docs/ci-cd.md) | gates, deploy, rollback |
| [docs/research-validation.md](docs/research-validation.md) | verified sources |
| [docs/decisions/](docs/decisions/) | ADR-001 … ADR-006 |
| [CHANGELOG.md](CHANGELOG.md) | shipped history |
| [tasks/](tasks/) | plans & task lists |

Live: **console** rodexdb.pages.dev · **docs** rodexdb.pages.dev/docs ·
**usage & limits** rodexdb.pages.dev/usage.

---

## Credits

Built and operated by **rakxdev** — a one-person instrument-packet project.

- **Brand & design**: the PACKET-RETICLE-KEY mark (locked R3-14) — gold = seals/reveals,
  red = action/core, amber = state, ink = structure. All marks in [`brand/`](brand/).
- **Stack**: TypeScript · Hono · aws4fetch · Zod · React · Vite · Tailwind v4 ·
  Framer Motion · the official MCP TypeScript SDK · Cloudflare Workers/Pages/Durable
  Objects · AWS DynamoDB.
- **Fuel**: the AWS always-free tier and the Cloudflare free plan — the product exists
  *because* $0 is an architectural constraint, not a budget line.

<sub>RodexDB — all rights reserved. Not open source: the repo is private infrastructure
for its operator. If you found it, you're probably the operator. 😄</sub>