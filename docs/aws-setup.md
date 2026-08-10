# RodeX v1 — AWS Setup (one time, ~10 minutes)

> Region: **ap-southeast-1 (Singapore)**. Everything must be created in this region.
> Free tier: 25 GB storage + 25 WCU + 25 RCU **provisioned** (on-demand is NOT free).

## 1. IAM user (least privilege)

1. AWS Console → IAM → Users → **Create user** → name `rodex-gateway`
2. Don't give console access. Attach this **inline policy** (replaces the full-policy
   alternative; never give AdministratorAccess):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RodexTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem",
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTimeToLive"
      ],
      "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/*"
    },
    {
      "Sid": "RodexTags",
      "Effect": "Allow",
      "Action": ["dynamodb:TagResource"],
      "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/*"
    }
  ]
}
```

> ⚠️ `CreateTable`/`DeleteTable` on `table/*` lets the gateway create and purge
> app tables at runtime (that's the product). `DeleteTable` also means the IAM
> key can delete ANY table in the account — keep the key in `wrangler secret`,
> never in code, and rotate it if ever leaked.

3. **Create access key** (Application outside AWS) → save `AWS_ACCESS_KEY_ID` /
   `AWS_SECRET_ACCESS_KEY` → these go into `wrangler secret put` (step 3 of README).

## 2. Control-plane tables — AUTO-PROVISIONED (nothing to create)

The gateway **creates everything on first use** (no CLI steps needed):
- `rodex_apps` — app registry (PROVISIONED 1/1)
- `rodex_idem` — idempotency records, **TTL on `exp` auto-enabled**
- `rodex_meta` — platform settings (e.g. the admin password hash, PAY_PER_REQUEST)
- data tables (`app_<appId>_<name>`) at **5 WCU / 5 RCU** (auto-upgrade from
  legacy 1/1 on first touch)

If you ever provision them manually (e.g. to pre-create before first deploy),
use the shapes below — otherwise skip straight to §3.

```bash
# apps registry
aws dynamodb create-table \
  --region ap-southeast-1 \
  --table-name rodex_apps \
  --key-schema AttributeName=appId,KeyType=HASH \
  --attribute-definitions AttributeName=appId,AttributeType=S \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1

# idempotency store (auto-expires via TTL)
aws dynamodb create-table \
  --region ap-southeast-1 \
  --table-name rodex_idem \
  --key-schema AttributeName=requestId,KeyType=HASH \
  --attribute-definitions AttributeName=requestId,AttributeType=S \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1

aws dynamodb update-time-to-live \
  --region ap-southeast-1 \
  --table-name rodex_idem \
  --time-to-live-specification Enabled=true,AttributeName=exp
```

> Data tables (`app_<appId>_<name>`) are created automatically by the gateway
> when an app calls `/v1/table/create` — nothing to do manually.

## 3. Capacity budget check (free tier math — docs/rate-limits.md)

- Each data table provisions **5/5**; up to 5 tables stay inside the 25+25 pool.
- Gateway per-app limits keep aggregate writes ≤ 20 WCU/s and reads ≤ 25 RCU/s.
- Watch CloudWatch: `ConsumedWriteCapacityUnits` / `ProvisionedThroughputExceeded`.
