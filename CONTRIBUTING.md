# Contributing to RodexDB

Thanks for wanting to help! RodexDB is a personal project made public so
developers — especially juniors starting out — can read real production code,
learn from it, and use it for their own personal projects.

**Please read the [LICENSE](LICENSE) first.** RodexDB is free for personal
and educational use; commercial use is strictly forbidden.

## Ground rules

1. **Test-first.** Every change ships with tests. The suite is 143 tests and
   the CI `quality` gate blocks merge if any fail.
2. **One change per PR.** Small, focused, reviewable.
3. **Plain commit messages.** First line: short imperative sentence
   ("Add X", "Fix Y"). Body: what and why, in normal English.
4. **No secrets, ever.** Keys, tokens, and passwords never go in code, docs,
   or commit messages. Production secrets live in `wrangler secret` /
   GitHub Actions secrets only.
5. **No placeholders.** No TODOs, no "add your data here", no half-finished
   work. If a change isn't complete, it isn't a PR yet.
6. **Respect the brand.** Gold = seals/reveals only · red = action only ·
   amber = state only · ink = structure. See `brand/README.md`.

## How to contribute

1. **Fork** the repository.
2. **Branch** from `main`: `git checkout -b feat/your-change`.
3. **Make the change** with tests.
4. **Verify locally** — the exact CI gates:
   ```bash
   npm run lint              # eslint, 0 errors
   npm run typecheck         # strict TS
   npm test                  # 143 tests
   cd dashboard && npx tsc --noEmit
   npm run build:dashboard   # dashboard builds
   cd gateway && npx wrangler deploy --dry-run | grep -q "Total Upload"
   npm audit --audit-level=high
   ```
5. **Commit** (plain message, see above) and **push** to your fork.
6. **Open a pull request** against `main` using the template — the `quality`
   check must be green before merge. Squash-merge is the rule.

## What makes a great contribution

- Fixing a bug **with a regression test** that fails before your fix and
  passes after.
- Documentation that matches reality (docs are part of the product).
- A new test that proves an edge case we missed.

## What doesn't

- Changes that break the confirmation gate on MCP mutations.
- Changes that weaken per-app isolation (cross-app access is never allowed).
- Bumping dependencies in bulk — one dependency per PR, changelog read.
- Marketing copy in code comments. Comments explain *why*, not *what*.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting vulnerabilities

Do **not** open a public issue for security problems — see
[SECURITY.md](SECURITY.md).
