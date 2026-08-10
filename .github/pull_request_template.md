## What does this change?

<!-- One or two sentences: what and why. Link to the issue it closes, if any. -->

## Type of change

- [ ] Bug fix (with regression test)
- [ ] New feature
- [ ] Docs
- [ ] Refactor

## Verification (must all pass — the CI `quality` gate checks these)

- [ ] `npm run lint` — 0 errors
- [ ] `npm run typecheck` — clean
- [ ] `npm test` — 143/143 pass (new tests added for this change)
- [ ] `cd dashboard && npx tsc --noEmit` and dashboard builds
- [ ] `npx wrangler deploy --dry-run` shows `Total Upload`
- [ ] `npm audit --audit-level=high` — 0 vulnerabilities

## Checklist

- [ ] No secrets or real keys in code, docs, or commit message
- [ ] One focused change (no unrelated edits)
- [ ] MCP mutations still require `confirmed: true` (if touched)
- [ ] Per-app isolation untouched (if touched)
- [ ] README/docs updated if the change affects them
