# Capacity Modes — NORMAL ($0) ↔ PERFORMANCE (unlimited)

RodexDB runs in one of two platform-wide capacity modes. **Modes change only
speed and billing — never data rules**: item sizes, shapes, validation,
idempotency and per-item results are IDENTICAL in both modes, so switching
can never strand or break existing rows.

## The two modes

<!-- BEGIN GENERATED: capacity -->
|  | NORMAL (provisioned) | PERFORMANCE (on-demand) |
|---|---:|---:|
| DynamoDB billing | provisioned 5/5 per table — $0 (free tier) | on-demand — pay-per-request |
| Item size (both modes) | ≤ 400 KB | ≤ 400 KB |
| Per-app write budget | 800 write-units/min (~13/s — half the free pool) | Guardrail only: 100 000 units/min |
| Per-app read budget | 800/min | Guardrail only: 400 000/min |
| Total per app | 2 000/min | 500 000/min |
| Platform pool | 2 400/min | 2 000 000/min |
| Batch/put | ≤ 50 items, ≤ 400 KB total | same |
| 429s | Yes — name the budget + retry_after | Practically never (runaway protection only) |
<!-- END GENERATED: capacity -->

## Cost honesty (why PERFORMANCE is nearly free at real scale)

| Row size | Write cost | 1 500-row backfill | Reads of everything |
|---|---|---|---|
| ≤ 1 KB | 1 unit | ~$0.001 | ~$0.001 |
| 20 KB | 20 units | ~$0.019 | ~$0.001 |
| 400 KB (max) | 400 units | ~$0.38 | ~$0.02 |

Even 5M writes + 20M reads in a month ≈ **$3–4** (credits cover years).
A "runaway" script is still caught by the per-app guardrails and AWS's
per-table max-throughput — a bill backstop, not a wall.

## Switching (mechanics, AWS-verified)

- Switch via **dashboard** (AppsPage strip) or **MCP** (`set_platform_capacity`,
  confirmation-gated) or **REST** (`POST /v1/admin/capacity {mode}`).
- Every table switches; takes **several minutes** at AWS; reads/writes keep
  working during the transition (at the old throughput). The dashboard/MCP
  show "SWITCHING…" — poll until ALL ACTIVE before bursting.
- Limit: **max 4 switches to on-demand per table per 24 h** (switching back to
  provisioned is unlimited, and returns tables to 5/5 = $0).
- New tables created while PERFORMANCE are on-demand directly.

## The zero-error guarantee (why switching is always safe)

1. **Item cap is 400 KB in BOTH modes** — a row written in PERFORMANCE is
   readable, updatable and deletable in NORMAL. Nothing is ever stranded.
2. **Reads are never size-gated in any mode** — a `get`/`query`/`batch/get`
   returns the full row in ONE call, whatever its size.
3. Validation, `all_ok`, batch caps, idempotency — unchanged in both modes.
4. The only thing a mode changes: **how fast you can go and what it costs.**

## Legacy note

The old 20 KB "cap" and 120 writes/min were free-tier optimizations. They are
now: 20 KB = a documented cost recommendation (1 unit per KB), and
120 units/min = a subset of the NORMAL budget. Nothing that worked before
behaves differently; big rows simply became first-class citizens.