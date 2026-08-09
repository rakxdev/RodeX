# RodeX — CI/CD Runbook (Version 1)

## Quality gates (every push / PR — `.github/workflows/ci.yml`)

```
Lint (eslint) → Type check (tsc strict) → Unit tests (vitest) → Build gate (wrangler dry-run) → Security audit (npm audit)
```

Runs on every push to `main` and every pull request. A red gate blocks merge —
fix locally, push again (the failing output is the feedback loop).

Run all gates locally before pushing:

```bash
npm run lint          # npx eslint gateway/src gateway/test
npm run typecheck     # npx tsc --noEmit -p .
npm test              # vitest
cd gateway && npx wrangler deploy --dry-run   # bundle gate
npm audit --audit-level=high                  # supply chain
```

## Auto-deploy (opt-in, 2 minutes)

`.github/workflows/deploy.yml` deploys the gateway to Cloudflare on every `main`
push (after CI passes). It stays **disabled until you add two repo secrets**:

1. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Add:
   - `CLOUDFLARE_API_TOKEN` = your `cfut_...` token
   - `CLOUDFLARE_ACCOUNT_ID` = `25bff71e7781196feac6d6e48b84e54c`
3. Next push to main auto-deploys. Until then, deploys are manual (below).

## Manual deploy (current)

```bash
cd gateway
export CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account id>
npx wrangler deploy
```

Then run the live smoke (docs/testing.md §Live).

## Rollback

Cloudflare Workers keeps deploy history. To undo the latest deploy:

```bash
cd gateway
export CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account id>
npx wrangler rollback
```

Rollback restores the previous worker version; worker **secrets are NOT affected**
(they persist across versions). Use it within the 15-minute monitoring window
after any deploy if live checks fail.

## Dependabot

`.github/dependabot.yml` opens weekly PRs for npm dependency updates. Review the
changelog, let CI judge (green suite before and after), and merge one at a time.
Never bulk-bump: one dependency per PR keeps the cause and revert obvious.

## Deployment strategy (current)

- **Deploys are small and frequent** (one feature per commit → push → deploy).
- **Verification is mandatory post-deploy**: health → login → app flow → headers
  (docs/testing.md §Live). CI guards quality; the live smoke guards reality.
- **Staging**: not used in v1 (single personal environment; rollback is the
  safety net). Revisit if a second environment ever appears.
