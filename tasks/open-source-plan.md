# Implementation Plan: Open-Sourcing RodexDB (public, discoverable, community-ready)

Status: **READY-FOR-REVIEW** · Research: GitHub official best-practices docs + license guides (2026)

## Why (founder directive)
Make the project **fully public and open source** so junior developers and
beginners can use it, edit it, and learn from it. Repo must be **indexed in
searches** (description, topics, README keywords), legally open (license),
community-ready (contributing/security/conduct), and the README must clarify
**backend vs frontend deployment** and carry a **designed founder credit**.

## Research summary (evidence)

1. **License**: MIT is the simplest, most permissive license — anyone can use,
   modify, sell, sublicense. Best for beginner adoption ("use it and edit
   anything"). Apache-2.0 adds a patent grant (matters for big-company
   adoption) but is longer. GPL is copyleft (derivatives must stay GPL) —
   against the founder's "use it perfectly" goal. → **Recommend MIT.**
2. **Discoverability** (GitHub official docs): README + LICENSE +
   CONTRIBUTING + CODE_OF_CONDUCT + SECURITY are the expected community files;
   **description with keywords** + **5–8 topics** (not more) is the practical
   sweet spot; public repos unlock free secret scanning + code scanning +
   push protection; Dependabot already enabled.

## Phase 0 — SECURITY PRE-FLIGHT (do FIRST, before anything goes public)

- [ ] Scan ALL git history (every branch, every commit) for real secrets:
      `rok_mcp_`, `rok_` keys, AWS keys, CF API tokens, admin passwords,
      `.dev.vars` contents. Any hit → rotate that secret + scrub history
      before going public.
- [ ] Verify `.gitignore` covers `.dev.vars`, `.wrangler/`, `dashboard/dist`.
- [ ] Verify workflows only use `secrets.*` (never literal tokens).
- [ ] Verify the repo contains no private personal data (emails, passwords).
- [ ] Enable repo security: secret scanning + push protection + code
      scanning (free once public), dependabot already on.

## Phase 1 — Legal (the license)

- [ ] Add `LICENSE` — MIT, `Copyright (c) 2026 Rakesh (rakxdev)` (name to
      confirm).
- [ ] README: swap the "private / all rights reserved / you're probably the
      operator" footer for an open-source statement + license link; add an
      MIT license shield to the hero badge row.
- [ ] `docs/` note in README docs table stays unchanged (docs are the product).

## Phase 2 — Community files (what "professional open source" looks like)

- [ ] `CONTRIBUTING.md` — the flow: fork → branch → PR → quality gate (lint →
      typecheck → 143 tests → bundle → audit) → squash merge; test-first;
      plain-English commit messages; no secrets in code.
- [ ] `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1.
- [ ] `SECURITY.md` — how to report a vulnerability privately (GitHub
      security advisories; never in issues).
- [ ] Issue templates: `bug_report.yml` + `feature_request.yml`;
      `pull_request_template.md` (checklist mirroring the quality gate).
- [ ] Enable **Discussions** (Q&A / ideas) — one click in settings.

## Phase 3 — Repo settings (the "indexed in all searches" part)

- [ ] **Visibility → public** (founder's explicit click, or API on approval).
- [ ] **Description** (with keywords):
      `RodexDB — your own database platform: per-app keys & tables on DynamoDB,
      one clean API + MCP for every coding agent. Serverless, TypeScript,
      $0 forever (AWS always-free + Cloudflare free tier).`
- [ ] **Homepage** → `https://rodexdb.pages.dev`
- [ ] **Topics (8)**: `dynamodb` · `cloudflare-workers` · `serverless` ·
      `database` · `mcp` · `hono` · `typescript` · `react`

## Phase 4 — README v2.1 (deployment clarity + credits)

### 4a. Deployment section rebuilt — BACKEND and FRONTEND clearly separated
- **1 · BACKEND (gateway Worker)** — what to create and which credentials:
  - Click-deploy button walkthrough: what it clones, what it asks, in order
    (each secret + where to get it: ADMIN_PASSWORD/SESSION_SECRET/AWS keys/
    GitHub OAuth) — links to docs/aws-setup.md for the IAM step.
  - Manual alternative: the exact `wrangler secret put` sequence, one line
    per credential, each annotated.
  - Output: your backend URL (workers.dev).
- **2 · FRONTEND (console Pages)** — connecting to the backend:
  - Create Pages project → connect repo → build preset Vite, output
    `dashboard/dist`.
  - The ONE connection setting: `VITE_GATEWAY_URL = <backend URL>`.
  - Then the two-way contract table:

| Who | Variable | Set to |
|---|---|---|
| backend | `DASHBOARD_ORIGIN` (wrangler.toml) | your Pages URL |
| frontend build | `VITE_GATEWAY_URL` | your backend workers.dev URL |
| GitHub OAuth app | callback URL | `<backend>/v1/auth/github/callback` |

- **3 · Verify** — pointer to docs/testing.md smoke script (health → login →
  fabricate → CRUD → 429).

### 4b. Credits section — designed founder card
- New `brand/founder-card.svg`: brand-styled (carbon panel, gold rules, the
  mark, "FOUNDER & OPERATOR"), with the founder's name + `@rakxdev` +
  `github.com/rakxdev`.
- README Credits: the card (hyperlinked to the GitHub profile), a short
  "built by" line, stack credits stay.
- The site `/credits` page: add the same founder card + GitHub link
  (deploy dashboard).

## Phase 5 — Site touches (only what public-facing changes need)

- [ ] `/credits` page: founder card SVG + profile link (reuses brand assets).
- [ ] Public header: add a GITHUB link (next to DOCS/USAGE/CREDITS) —
      optional but helps reachability.
- [ ] Deploy dashboard after changes.

## Phase 6 — Verification (prove it works before reporting done)

- [ ] History secret scan script runs clean (Phase 0).
- [ ] README link audit (all internal refs resolve) + SVG well-formed.
- [ ] `quality` gate green on the PR (lint/typecheck/143 tests/bundle/audit).
- [ ] After public: description + topics visible on the repo card; GitHub
      search finds the repo by a keyword (e.g. `dynamodb mcp`);
      Deploy-button URL responds.
- [ ] Deploy dashboard (credits change) and verify bundle.

## Ship flow (our standing process)
Branch (`feat/open-source`) → PR → quality green → squash merge → push after
founder's explicit "push". Visibility change = founder's click (or API with
explicit approval).

## Honest risks (open-sourcing is a real decision)

| Risk | Reality / mitigation |
|---|---|
| Anyone can fork & deploy their own instance | **Intended.** Their instance is theirs; your prod is protected by login + allowlist. |
| Live URLs (rodexdb.pages.dev) become visible in a public repo | Docs are already public; console is behind admin auth (allowlist: rakxdev/newylbot/luminoxpp). Portfolio value > exposure. |
| A leaked secret in git history gets scraped | Phase 0 scan + rotation FIRST; secret scanning enabled. |
| Maintenance expectations (issues/PRs from strangers) | CONTRIBUTING + issue templates + quality gate set the bar; you can decline anything. |
| License can't be undone for copies | MIT is final once merged — hence your review first. |

## Open questions for the founder
1. **License: MIT** (recommended) or Apache-2.0? (One sentence each: MIT =
   simplest, anyone can do anything; Apache = same + explicit patent
   protection, longer text.)
2. Founder card name: **"Rakesh"** + handle `rakxdev` — confirm spelling /
   display name.
3. Make-public: **you click** it (Settings → Danger zone) or **I do it via
   API** when you approve?
4. GitHub **Discussions**: on or off?
5. Site header GITHUB link: yes/no?
