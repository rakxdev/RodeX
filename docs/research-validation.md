# RodeX v1 — Research Validation Notes

All limits/claims below were verified against official documentation
(AWS + Cloudflare) before being baked into the design. Dates: May–2026.

## DynamoDB (aws.amazon.com/dynamodb/pricing, docs.aws.amazon.com ServiceQuotas)

| Claim | Status | Notes |
|---|---|---|
| Always-free: 25 GB + 25 WCU + 25 RCU, never expires | ✅ | Standard table class, **provisioned mode only** |
| On-demand mode has NO free capacity | ✅ | AWS re:Post: storage free, requests billed |
| Free tier is per account, per region | ✅ | 2 accounts = 2 separate pools |
| Max item size 400 KB (names + values) | ✅ | Quotas page |
| 400 KB is NOT usable on the free pool (needs 400 WCU in 1 s vs 25) | ✅ | Math: ceil(bytes/1024) WCU |
| Tables default 2,500 / account / region | ✅ | Quotas page |
| Table size effectively unbounded | ✅ | horizontal partitioning |
| Conditional writes / transactions / TTL / vertical partitioning exist | ✅ | official docs + Database Blog |
| AWS recommends S3 (not DDB) for > 400 KB blobs | ✅ | `bp-use-s3-too` — v2 R2 feature planned |

**Design consequence:** write cap = 20 KB/item → max 20 WCU per write → never throttled.

## Cloudflare Workers (developers.cloudflare.com/workers/platform/limits)

| Claim | Status | Notes |
|---|---|---|
| Free: 100,000 requests/day | ✅ | resets 00:00 UTC, Error 1027 over |
| Free CPU: 10 ms/invocation; memory 128 MB | ✅ | network waits don't count toward CPU |
| Free subrequests: 50 external + 1,000 internal per invocation | ✅ | Feb-2026 changelog; no daily subrequest cap anymore |
| Request body ≤ 100 MB (free CF plan) | ✅ | 413 above |
| No response body limit; cache object ≤ 512 MB | ✅ | |
| Workers Rate Limiting binding GA (Sept 2025) | ✅ | key-based, 10 s/60 s windows, per-location, eventually consistent |
| Real-time logs + `wrangler tail`; free 200k log events/day, 3-day retention | ✅ | pricing page |
| Remote MCP servers on Workers (future v2) | ✅ | blog.cloudflare.com/remote-model-context-protocol-servers-mcp |
| Calling AWS from a Worker | ✅ | official template cloudflare/workers-aws-template + aws4fetch |

## Known approximations (documented, not hidden)

1. **Rate limiter is per Cloudflare location** — global intent enforced by
   conservative per-app caps + DynamoDB throttle→429 mapping.
2. **Eventually-consistent reads by default** — `strong: true` opt-in per request.
3. **Scan-based purge** is bounded per cron run (≤ 5 apps) to stay inside
   free-plan subrequest/CPU budgets; large tables drain over multiple runs.

## Sources (primary)

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/
- https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/
- https://aws.amazon.com/dynamodb/pricing/
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-use-s3-too.html
- https://github.com/cloudflare/workers-aws-template
- https://github.com/mhart/aws4fetch
- https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/
