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
