# Task for reviewer

Perform an adversarial five-axis review of the RodexDB repo at /home/ubuntu/rakxdev/RodeX. Scope: gateway/src/** (Hono Worker: REST API, MCP server at /mcp, Durable-Object rate limiting, DynamoDB storage via aws4fetch), dashboard/src/** (React console), packages/rodexdb + packages/rodex-mcp (npm SDK + MCP stdio bridge), .github/workflows/*. Read the key files yourself. Look for REAL issues only (no style nits), ranked by severity: 1. Correctness: edge cases, race conditions, error paths, off-by-ones (rate limiter window math, idempotency, DynamoDB marshaling, SSE parsing in the MCP bridge, abort/timeout handling). 2. Security: auth bypass paths, key handling (hash-only claims, ciphertext), MCP confirmation gate bypass, SSRF (the MCP bridge takes a --url - any risk?), header injection, secrets in logs. 3. Architecture: module boundaries, duplicated logic, shared-state pitfalls (module-level caches/maps in the Worker), anything that breaks under multiple isolates/instances. 4. Performance: unbounded loops, N+1 patterns, cache behavior, bundle concerns. 5. Review the 3 unpushed commits on main (53a9342, 4451a78, 9a5a987) diffs too. Output: findings each as [SEVERITY: Critical/High/Medium/Low] title + file:line + one-paragraph explanation + suggested fix. End with a verdict. Be concrete and skeptical; do not rubber-stamp.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```