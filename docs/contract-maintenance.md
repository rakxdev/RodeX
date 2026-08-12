# Contract maintenance — how to change a public limit

Every public limit and capacity value has ONE source:

```
contract/rodex-contract.json
```

Never edit generated outputs directly — they are overwritten by the generator
and CI fails if they drift.

## The golden flow

1. **Edit the contract** — `contract/rodex-contract.json` (e.g. change
   `capacityModes.normal.writeUnitsPerAppPerMinute`).
2. **Validate** — `npm run contract:validate`
3. **Regenerate everything** — `npm run contract:generate`
   This rewrites:
   - `gateway/src/generated/contract.ts`
   - `dashboard/src/generated/contract.ts`
   - generated tables inside `docs/capacity.md`, `docs/rate-limits.md`,
     `docs/mcp.md`, `README.md`, and `docs/openapi.yaml`
   - `docs/generated/*.md` fragments
4. **Review the diff** — it should be: contract change + generated outputs +
   (tests if you added a behavioral test). If a human-written page still has a
   stale number, fix the page too (prose is NOT generated).
5. **Verify** — `npm run contract:check`, `npm test`, `npm run typecheck`,
   `npm run lint`, `npm run build:dashboard`.

## What the checks protect

| Check | Command | Fails when |
|---|---|---|
| Contract validity | `contract:validate` | missing/invalid keys, broken invariants (e.g. PERFORMANCE < NORMAL) |
| Drift | `generate --check` | a generated file or marked region is stale |
| Active text | `check-stale-strings` | old public numbers appear in active docs/pages |
| Parity | `gateway/test/contract.test.ts` | runtime values ≠ generated values |

## What is intentionally NOT in the contract

- `TEST_PROFILE` (gateway test-only, smaller numbers to test 429 behavior)
- Historical values in `CHANGELOG.md`, `docs/REAL_USER_REVIEW.md`,
  `docs/BULKLOAD_REVIEW.md`, `docs/decisions/`
- Internal engineering constants (window size, purge batch, key lengths)
- Prose/explanations (Diátaxis: tutorials, how-to, explanation stay human)

The stale-text scanner excludes those paths on purpose — do not remove the
exclusions to "fix" a scan finding; instead fix the actual stale text.

## Adding a new public value

1. Add the key to `contract/rodex-contract.json` + a validation rule in
   `scripts/validate-contract.mjs`.
2. If a surface should show it, add the string/table entry to
   `scripts/generate-contract.mjs` (the generator is the only writer of
   generated output).
3. Regenerate and add a parity test in `gateway/test/contract.test.ts`.
