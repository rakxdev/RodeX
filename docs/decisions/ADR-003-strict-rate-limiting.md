# ADR-003: Strict rate limiting with single-point Durable Object counters

## Status
Accepted

## Date
2026-08-09

## Context
The gateway promises exact budgets (600 total / 120 writes / 240 reads per app,
1000 platform, 60 admin, per minute). The first implementation used Cloudflare's
`[[ratelimits]]` edge bindings — **eventually consistent and per-location**.
Live stress testing proved the gap: a 250-write sub-second burst passed ~223
requests (budget 120), reads tripped ~40 late, admin 70 all passed. The numbers
the docs promised were not the numbers enforced.

## Decision
All budgets are counted by a **single shared Durable Object**
(`RateLimiterDO`, one instance, single-threaded, SQLite-backed for the free
plan). Every request consumes all of its budgets atomically in one DO call
(total, kind, platform; admin separately). The first exhausted budget answers
`429` **naming it**: `"Rate limit exceeded — writes budget, retry in 59s"`,
with `retry_after` = seconds left in the window. A `peek` op (no consumption)
powers observability (ADR-005).

## Alternatives Considered
- **Edge `[[ratelimits]]` bindings**: keep; measured failures (above). Rejected.
- **In-memory per-isolate counters**: no cross-isolate authority; bursts on a
  second isolate pass. Rejected.
- **DynamoDB counters**: per-request writes cost WCU and add latency. Rejected.

## Consequences
- Exact enforcement, verified live: write burst 250 → exactly 120 allowed /
  130 × 429; reads trip at #241; admin at 60; app isolation holds.
- One DO round-trip per request (~10–30 ms) — acceptable at these budgets.
- A rare DO restart starts a fresh window (over-allow ≤ 1 min, never a lockout).
- The per-table DynamoDB ceiling (5 WCU/5 RCU) is a documented second limit,
  not a gateway one (docs/rate-limits.md §5).
