# Spec: RodeX Canonical Contract and Generated Documentation

## Status

**Proposed — awaiting approval.** This document is a design/specification only. No runtime code, dependency, deployment, or push should happen until the founder approves this scope.

## Objective

Create one canonical, machine-readable RodeX contract for public platform policy values and generate the repeated representations from it. The goal is to prevent drift between the gateway, dashboard, README, Markdown reference pages, OpenAPI metadata, MCP instructions, examples, and tests.

The system must preserve the current v0.5.0 behavior exactly while making future contract changes deliberate, reviewable, and automatically checked.

### Public contract values to centralize

- NORMAL capacity mode values
- PERFORMANCE capacity guardrails
- 400,000-byte item hard cap
- Batch item and byte limits
- Query limits
- Admin request limit
- Storage allowance
- MCP capacity values
- Public error/status facts related to these limits
- Human-readable labels and explanations needed by generated tables

### Explicitly not centralized as public limits

- The internal `TEST_PROFILE`, which intentionally uses smaller values to test rejection behavior
- Historical values in changelogs, dated reviews, and migration records
- General prose, tutorials, architecture rationale, and historical explanations
- AWS/Cloudflare pricing that is not part of the runtime contract

## Assumptions

1. The current v0.5.0 behavior is the baseline and must not change as a side effect.
2. The contract should use the exact implementation byte value `400_000`; displayed text may say `400 KB`.
3. NORMAL and PERFORMANCE remain platform-wide modes with the existing values.
4. The current TypeScript gateway and Vite dashboard must continue to build without introducing a new package-workspace dependency unless implementation proves it necessary.
5. Generated files may be committed, but humans must edit only the canonical source and generator templates—not generated output.
6. Existing public URLs and API endpoint names must not change.
7. This work must be reversible with a normal Git revert and must not require a database migration.

## Proposed Source of Truth

Create:

```text
contract/rodex-contract.json
```

This JSON file contains policy data only. A generator will validate it and produce typed/runtime and documentation outputs.

Proposed sections:

```text
metadata
commonLimits
capacityModes.normal
capacityModes.performance
mcp
errors
rendering
```

The source file must include machine values and stable identifiers, not duplicated paragraphs of prose.

## Proposed Generated Outputs

The generator should produce or update only marked/generated sections in:

```text
gateway/src/generated/contract.ts
dashboard/src/generated/contract.ts
docs/generated/capacity.md
docs/generated/rate-limits.md
docs/generated/mcp-capacity.md
```

The generator should also update marked capacity metadata in:

```text
docs/openapi.yaml
```

The gateway MCP manual and dashboard pages should consume generated contract values at runtime/build time instead of hardcoding public limit numbers.

README and human-authored pages may contain generated tables between markers, while their surrounding explanation remains manually written.

## Commands

The implementation must add or document these commands:

```bash
npm run contract:generate
npm run contract:check
npm run contract:test
npm run openapi:lint
npm test
npm run typecheck
npm run lint
npm run build:dashboard
```

`contract:check` must regenerate into a temporary or working output and fail when committed generated files differ.

## Project Structure

```text
RodeX/
├── contract/
│   └── rodex-contract.json          # canonical public policy values
├── scripts/
│   ├── generate-contract.mjs        # deterministic generator
│   ├── check-contract.mjs           # no-drift check
│   └── validate-contract.mjs        # schema/value validation
├── gateway/src/generated/
│   └── contract.ts                  # generated gateway representation
├── dashboard/src/generated/
│   └── contract.ts                  # generated dashboard representation
├── docs/generated/
│   ├── capacity.md
│   ├── rate-limits.md
│   └── mcp-capacity.md
├── docs/openapi.yaml                # endpoint contract plus generated metadata
└── tasks/
    ├── contract-source-of-truth-spec.md
    ├── contract-source-of-truth-plan.md
    └── contract-source-of-truth-todo.md
```

The final exact layout may be simplified if implementation evidence shows a safer option, but the canonical source must remain one file and generated outputs must be clearly marked.

## Code Style

- TypeScript strict mode remains enabled.
- Generator output must be deterministic: stable ordering, stable whitespace, no timestamps.
- Generated files must contain a header such as:

```text
// GENERATED FILE — DO NOT EDIT.
// Source: contract/rodex-contract.json
// Run: npm run contract:generate
```

- Gateway code imports generated typed values.
- Dashboard code imports generated typed values or uses generated page data.
- Test-only values remain in test-only source and are labeled explicitly.
- Human documentation uses clear mode labels: `NORMAL`, `PERFORMANCE`, and `TEST-ONLY`.
- Do not replace explanatory prose with unreadable generated text.

## Testing Strategy

### Contract validation

- Validate all required keys exist.
- Validate values are positive integers.
- Validate NORMAL and PERFORMANCE profiles contain all required dimensions.
- Validate PERFORMANCE values are not lower than NORMAL values where that is a policy invariant.
- Validate item cap and batch cap are consistent with the intended implementation values.

### Runtime parity

- Assert generated NORMAL/PERFORMANCE values match the gateway’s exported rate profiles.
- Assert the gateway uses the generated item and batch limits.
- Preserve and separately test `TEST_PROFILE` behavior.
- Execute boundary tests for item size, write-unit weight, reads, total requests, platform limits, and MCP limits.

### Documentation parity

- Regenerate all outputs and fail CI if Git reports a diff.
- Scan active public documentation and dashboard source for forbidden stale contract strings.
- Permit old numbers only in explicitly marked historical documents and test-only profiles.
- Validate OpenAPI with an OpenAPI linter.
- Add a check that generated docs contain the current contract identifiers and values.

### Browser verification

After dashboard generation:

- Build the dashboard.
- Open `/`, `/usage`, `/docs`, `/mcp`, and `/apps` in a real browser.
- Confirm NORMAL, PERFORMANCE, 400 KB, MCP, and error-limit text render correctly.
- Confirm no active page contains the old public values.
- Confirm browser console has no errors or warnings.

### Release verification

- Run gateway tests: 179 existing tests must remain green unless a test change is directly required by the contract architecture.
- Run TypeScript checks and ESLint.
- Deploy gateway and dashboard only after local checks pass.
- Recheck the production gateway and dashboard after deployment.

## Boundaries

### Always do

- Preserve current v0.5.0 runtime values and API behavior.
- Keep generated output deterministic and reviewable.
- Run contract generation, drift checks, tests, typecheck, lint, and dashboard build before commit.
- Verify public pages in a real browser after deployment.
- Keep test-only and historical values explicitly labeled.
- Commit the contract, generator, generated outputs, tests, and documentation together.

### Ask first

- Adding a new runtime dependency or changing the workspace structure.
- Changing a public limit or capacity value.
- Changing OpenAPI endpoint behavior or response schemas.
- Changing the meaning of `400_000` bytes or write-unit accounting.
- Changing CI, deployment order, or release policy.
- Rewriting historical documents.

### Never do

- Never manually edit generated files.
- Never silently change public limits while centralizing them.
- Never delete failing tests to make parity pass.
- Never use the canonical public contract to weaken the test profile.
- Never deploy generated output that was not regenerated from the checked-in source.
- Never push or deploy during the planning/specification phase without approval.

## Success Criteria

1. There is exactly one canonical source for public capacity and limit values.
2. Gateway and dashboard consume generated values rather than duplicating public numbers.
3. README, public Markdown tables, MCP capacity text, and OpenAPI metadata can be regenerated.
4. `npm run contract:check` fails when generated output is stale.
5. Runtime behavior remains unchanged from the current v0.5.0 behavior.
6. The existing test suite remains green, including deliberate test-only profile tests.
7. Active public pages contain no stale public capacity values.
8. Historical documents remain historically accurate and explicitly identifiable.
9. A contract change produces one understandable diff containing source, generated output, tests, and docs.
10. Rollback requires only reverting the contract-system commit; no data migration is needed.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Gateway/dashboard import or bundling failure | High | Start with generated local modules; typecheck and build before switching runtime consumers |
| Contract accidentally changes runtime values | High | Snapshot current values; parity tests; no behavior change in first implementation |
| Test profile gets replaced by public profile | High | Keep `TEST_PROFILE` outside the public contract and test it explicitly |
| OpenAPI is treated as complete when it is not | Medium | Validate endpoint schemas separately; centralize only policy metadata initially |
| Generated Markdown becomes unreadable | Medium | Generate tables only; keep explanations human-authored |
| CI drift check creates noisy diffs | Medium | Deterministic generator, marked sections, stable ordering, temporary-output comparison |
| Existing stale historical text is incorrectly deleted | Low | Explicit historical/test allowlist and labels |
| Dependency/workspace changes break install | Medium | Avoid new dependency initially; ask before workspace/package changes |
| Dashboard and gateway deploy out of sync | Medium | Keep generated contract backward-compatible; deploy gateway first, then dashboard; verify both |

## Rollback Plan

If implementation causes a build or runtime problem:

1. Stop before deployment if local checks fail.
2. Revert the contract-system commit if already committed.
3. Redeploy the previous known-good gateway and dashboard versions if already deployed.
4. Do not modify DynamoDB data or capacity settings as part of rollback.
5. Keep the canonical contract work in a separate follow-up commit/branch for diagnosis.

## Open Questions for Approval

1. Approve `contract/rodex-contract.json` as the canonical source rather than a new shared npm package?
2. Approve generated files being committed to Git for the gateway, dashboard, and docs?
3. Approve keeping human explanations outside generated markers instead of generating entire Markdown pages?
4. Approve no public behavior or limit changes in the first implementation?
5. Approve adding a CI drift check before the next push?
