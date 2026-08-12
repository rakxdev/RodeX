<!-- BEGIN GENERATED: rate-limits -->
### Common caps (both modes)
| Cap | Value |
|---|---|
| Item size (hard) | ≤ 400 KB (413 above) |
| Recommended row | ≤ 20 KB (1 unit per KB — cost-friendly) |
| Batch put | ≤ 50 items · ≤ 400 KB total |
| Query limit | ≤ 100 rows |
| Admin surface | 60 req/min |
| Storage | 25 GB free (ap-southeast-1) |

### Per-app budgets (per 60 s window)
| Budget | NORMAL | PERFORMANCE |
|---|---:|---:|
| Total req/min | 2 000 | 500 000 guardrail |
| Write units/min | 800 | 100 000 guardrail |
| Reads/min | 800 | 400 000 guardrail |
| Platform pool/min | 2 400 | 2 000 000 guardrail |
<!-- END GENERATED: rate-limits -->
