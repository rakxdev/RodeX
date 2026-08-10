# ADR-005: Zero-cost observability (limiter peek + DescribeTable)

## Status
Accepted

## Date
2026-08-09

## Context
The console should show live per-app request budgets and storage. Candidates
measured against the $0 constraint: CloudWatch `GetMetricData` reads are
**always charged** (excluded from the free tier — verified on the AWS pricing
page), and DynamoDB Streams carries per-read charges.

## Decision
- **Request meters**: a `peek` op on the rate-limiter DO (ADR-003) returns
  current counter values **without consuming** — the same numbers the limits
  are enforced with, at zero cost and zero extra latency.
- **Storage**: `DescribeTable → TableSizeBytes/ItemCount` (control-plane,
  free), summed per app with a 60 s cache. ItemCount lags ~6 h by DynamoDB
  design — documented as approximate.
- Exposed as `GET /v1/admin/apps/:id/usage` (admin session) and rendered by
  the LIVE METERS panel (30 s refresh, IST stamp, offline state).

## Alternatives Considered
- CloudWatch `GetMetricData`: charged per read — rejected for the dashboard's
  polling cadence.
- DynamoDB Streams: per-read charges — deferred to the future events phase.
- In-worker counters: per-isolate drift — rejected (ADR-003).

## Consequences
- Meters are exact for requests (same counters as enforcement) and
  approximate for storage (DynamoDB's ~6 h ItemCount lag; bytes are accurate).
- One extra DO call + cached DescribeTable per refresh — negligible.
