# ADR-001: Free-tier-only architecture (DynamoDB + Cloudflare)

## Status
Accepted

## Date
2026-08-09 (originally May 2026, validated through REV H)

## Context
Personal gateway platform with a hard budget: **$0 forever**. The platform must
host many small apps (bots, websites) with per-app isolation, and never
silently hit a throttle.

## Decision
- DynamoDB **provisioned** mode, ap-southeast-1, on the always-free tier
  (25 GB, 25 WCU, 25 RCU). On-demand mode is NOT free — banned.
- Items capped at **20 KB** so one write never needs more than 20 WCU.
- Tables provisioned **5 WCU / 5 RCU** (up to 5 tables stay inside the pool);
  legacy 1/1 tables auto-upgrade.
- Cloudflare Workers + Pages on the free tier; a 1/min cron purges soft-deleted
  apps; Durable Objects for strict rate counters (free-plan SQLite classes).

## Alternatives Considered
- **D1 (SQLite)**: free, but a single shared database cannot give per-app
  table-level isolation; SQL model was rejected for the single-table key-value
  contract.
- **Supabase/Neon**: free tiers exist (500 MB-ish) but cap per-app data and add
  a third party; rejected for the isolation + "you own it" requirement.
- **On-demand DynamoDB**: no free tier (AWS re:Post confirmed) — rejected.

## Consequences
- Storage math is the product: every budget (120 writes/min, 240 reads/min,
  20 KB rows) is derived from the free pools, documented in docs/rate-limits.md,
  and enforced strictly by the gateway (ADR-003).
- A second AWS account or R2 is the documented escape hatch if 25 GB is ever
  exceeded — decided later, never silently.
