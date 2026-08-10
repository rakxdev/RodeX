# Security Policy

## Supported versions

RodexDB is a personal project deployed as a single production instance.
Security fixes land on `main` and deploy immediately; there are no
long-term-support branches.

## Reporting a vulnerability

**Please do NOT open a public issue for security problems.** That gives
attackers the same information you have, before a fix exists.

Instead, report privately:

1. **GitHub private vulnerability reporting** (preferred): repo →
   Security → Report a vulnerability.
2. Or open a **private** issue and mention `@rakxdev` / `rakxdev` in the
   title.

What to include:

- Which part is affected (gateway API, MCP, console, storage layer)
- Steps to reproduce, or a description of the weakness
- Impact (what an attacker could do) and severity estimate
- Any suggested fix, if you have one

## What happens next

- Acknowledgment within ~48 hours.
- A fix lands on `main` as soon as possible, with a regression test.
- The vulnerability is disclosed publicly (with credit, if you want it)
  after the fix is deployed.

## Security invariants that are tested and non-negotiable

- Per-app isolation: unowned tables → 403, no existence leak
- Keys stored as HMAC hashes, never in plaintext or logs
- MCP mutations require `confirmed: true` — enforced server-side
- Idempotency + version guarding (409 on conflict)
- 20 KB write cap, strict single-point rate budgets
- Secrets only via `wrangler secret` / Actions secrets

## Scope

This policy covers the gateway, the MCP server, the console, and the
deployment configuration in this repository. It does not cover AWS,
Cloudflare, GitHub, or any third-party service.
