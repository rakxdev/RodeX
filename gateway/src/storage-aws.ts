/**
 * storage-aws.ts — real DynamoDB adapter (ap-southeast-1) via aws4fetch.
 * Talks to the DynamoDB JSON API directly (X-Amz-Target), so it runs inside
 * Cloudflare Workers without the AWS SDK. All operations map to the same
 * error contract as MockStorage (409/404/429/413).
 */
import { AwsClient } from "aws4fetch";
import { badRequest, conflict, forbidden, gatewayError, HttpError, notFound, serviceUnavailable, tooManyRequests } from "./errors";
import { IDEMPOTENCY_TTL_SECONDS } from "./limits";
import type { AppRow, PutOptions, QueryResult, Storage, StoredItem } from "./storage";

const REGION = "ap-southeast-1";
const ENDPOINT = `https://dynamodb.${REGION}.amazonaws.com/`;
const API = "DynamoDB_20120810";

const APPS_TABLE = "rodex_apps";
const IDEM_TABLE = "rodex_idem";
const META_TABLE = "rodex_meta";

interface AwsCreds {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

type DdbItem = Record<string, { S?: string; N?: string; SS?: string[] }>;

function marshal(item: Record<string, unknown>): DdbItem {
  const out: DdbItem = {};
  for (const [k, v] of Object.entries(item)) {
    if (typeof v === "string") out[k] = { S: v };
    else if (typeof v === "number") out[k] = { N: String(v) };
    else if (Array.isArray(v)) {
      // DynamoDB rejects EMPTY string sets (SS: []) — omit instead.
      if (v.length > 0) out[k] = { SS: v.map(String) };
    } else if (v === undefined) continue;
    else throw new Error(`Unsupported attribute type for ${k}`);
  }
  return out;
}

function unmarshal(item: DdbItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (v.S !== undefined) out[k] = v.S;
    else if (v.N !== undefined) out[k] = Number(v.N);
    else if (v.SS !== undefined) out[k] = v.SS;
  }
  return out;
}

export class AwsStorage implements Storage {
  private aws: AwsClient;

  constructor(creds: AwsCreds) {
    this.aws = new AwsClient({
      accessKeyId: creds.AWS_ACCESS_KEY_ID,
      secretAccessKey: creds.AWS_SECRET_ACCESS_KEY,
      service: "dynamodb",
      region: REGION,
    });
  }

  /** Single entry point for all DynamoDB calls. */
  private async call<T = Record<string, unknown>>(op: string, params: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.aws.fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-amz-json-1.0", "X-Amz-Target": `${API}.${op}` },
        body: JSON.stringify(params),
      });
    } catch (e) {
      console.error("dynamodb network error", (e as Error).message);
      throw serviceUnavailable("DynamoDB unreachable — try again in a moment");
    }
    const body = (await res.json().catch(() => null)) as { __type?: string; message?: string } | null;
    if (res.ok) return body as T;
    this.mapError(body?.__type, body?.message);
    throw gatewayError("Unexpected DynamoDB failure");
  }

  private mapError(type?: string, message?: string): never {
    const t = (type || "").split("#").pop() || "";
    switch (t) {
      case "ConditionalCheckFailedException":
        throw conflict(message || "Condition not met — item changed or does not exist");
      case "ProvisionedThroughputExceededException":
        throw tooManyRequests(1, "DynamoDB capacity reached — retry shortly");
      case "ResourceNotFoundException":
        throw notFound(message || "Resource not found");
      case "ResourceInUseException":
        throw conflict(message || "Resource already exists");
      case "ValidationException":
        throw badRequest(message || "Invalid request to storage");
      case "AccessDeniedException":
        throw forbidden("Storage access denied — check IAM policy (docs/iam.md)");
      case "InternalServerError":
      case "ThrottlingException":
        throw serviceUnavailable(message || "Storage throttled, retry later");
      default:
        console.error("dynamodb error", type, message);
        throw gatewayError(message || "Storage error");
    }
  }

  // ── apps ────────────────────────────────────────────────────────────────────

  async createApp(row: AppRow): Promise<void> {
    await this.call("PutItem", {
      TableName: APPS_TABLE,
      Item: marshal(row as unknown as Record<string, unknown>),
      ConditionExpression: "attribute_not_exists(appId)",
    });
  }

  private appFromItem(item: DdbItem): AppRow {
    const u = unmarshal(item);
    return {
      appId: u.appId as string,
      name: u.name as string,
      keyHash: u.keyHash as string,
      keyPrefix: u.keyPrefix as string,
      status: (u.status as AppRow["status"]) || "active",
      purgeAt: u.purgeAt as number | undefined,
      createdAt: u.createdAt as number,
      rotatedAt: u.rotatedAt as number | undefined,
      tables: (u.tables as string[]) || [],
    };
  }

  async getApp(appId: string): Promise<AppRow | null> {
    const out = await this.call<{ Item?: DdbItem }>("GetItem", { TableName: APPS_TABLE, Key: marshal({ appId }) });
    return out.Item ? this.appFromItem(out.Item) : null;
  }

  async listApps(): Promise<AppRow[]> {
    const out = await this.call<{ Items?: DdbItem[] }>("Scan", { TableName: APPS_TABLE });
    return (out.Items || []).map((i) => this.appFromItem(i));
  }

  async putApp(row: AppRow): Promise<void> {
    await this.call("PutItem", { TableName: APPS_TABLE, Item: marshal(row as unknown as Record<string, unknown>) });
  }

  async deleteAppRow(appId: string): Promise<void> {
    await this.call("DeleteItem", { TableName: APPS_TABLE, Key: marshal({ appId }) });
  }

  async scanDeletingApps(nowSec: number, limit: number): Promise<AppRow[]> {
    const out = await this.call<{ Items?: DdbItem[] }>("Scan", {
      TableName: APPS_TABLE,
      FilterExpression: "#s = :del AND #p <= :now",
      ExpressionAttributeNames: { "#s": "status", "#p": "purgeAt" },
      ExpressionAttributeValues: marshal({ ":del": "deleting", ":now": nowSec }),
      Limit: limit,
    });
    return (out.Items || []).map((i) => this.appFromItem(i));
  }

  async addTableToApp(appId: string, logical: string): Promise<void> {
    await this.call("UpdateItem", {
      TableName: APPS_TABLE,
      Key: marshal({ appId }),
      UpdateExpression: "ADD tables :t",
      ExpressionAttributeValues: marshal({ ":t": [logical] }),
      ConditionExpression: "attribute_exists(appId) AND NOT contains(tables, :t)",
    });
  }

  async removeTableFromApp(appId: string, logical: string): Promise<void> {
    await this.call("UpdateItem", {
      TableName: APPS_TABLE,
      Key: marshal({ appId }),
      UpdateExpression: "DELETE tables :t",
      ExpressionAttributeValues: marshal({ ":t": [logical] }),
    });
  }

  // ── settings (rodex_meta) ───────────────────────────────────────────────────
  private metaTableReady: Promise<void> | null = null;

  private ensureMetaTable(): Promise<void> {
    if (!this.metaTableReady) {
      this.metaTableReady = this.ensureMetaTableInner().catch((e) => {
        this.metaTableReady = null;
        throw e;
      });
    }
    return this.metaTableReady;
  }

  private async ensureMetaTableInner(): Promise<void> {
    try {
      await this.call("DescribeTable", { TableName: META_TABLE });
    } catch {
      await this.call("CreateTable", {
        TableName: META_TABLE,
        KeySchema: [{ AttributeName: "k", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "k", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      });
    }
  }

  async getSetting(key: string): Promise<string | null> {
    await this.ensureMetaTable();
    const out = await this.call<{ Item?: DdbItem }>("GetItem", { TableName: META_TABLE, Key: marshal({ k: key }) });
    if (!out.Item) return null;
    return (unmarshal(out.Item).v as string) ?? null;
  }

  async putSetting(key: string, value: string): Promise<void> {
    await this.ensureMetaTable();
    await this.call("PutItem", { TableName: META_TABLE, Item: marshal({ k: key, v: value }) });
  }

  // ── idempotency ─────────────────────────────────────────────────────────────

  private idemTableReady: Promise<void> | null = null;

  /**
   * Lazy one-time bootstrap: ensure the idempotency table exists AND that
   * DynamoDB TTL is enabled on the `exp` attribute. TTL deletion is free and
   * consumes no write capacity — without it, expired idempotency records would
   * linger in storage forever (verified against official AWS docs).
   */
  private ensureIdemTable(): Promise<void> {
    if (!this.idemTableReady) {
      this.idemTableReady = this.ensureIdemTableInner().catch((e) => {
        this.idemTableReady = null; // allow retry on next call
        throw e;
      });
    }
    return this.idemTableReady;
  }

  private async ensureIdemTableInner(): Promise<void> {
    let ttl: { TimeToLiveDescription?: { TimeToLiveStatus?: string; AttributeName?: string } } | null = null;
    try {
      ttl = await this.call("DescribeTimeToLive", { TableName: IDEM_TABLE });
    } catch {
      // table missing — created below
    }
    if (!ttl) {
      await this.call("CreateTable", {
        TableName: IDEM_TABLE,
        KeySchema: [{ AttributeName: "requestId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "requestId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      });
    }
    const status = ttl?.TimeToLiveDescription?.TimeToLiveStatus;
    if (status !== "ENABLED" || ttl?.TimeToLiveDescription?.AttributeName !== "exp") {
      await this.call("UpdateTimeToLive", {
        TableName: IDEM_TABLE,
        TimeToLiveSpecification: { Enabled: true, AttributeName: "exp" },
      });
    }
  }

  async idemGet(requestId: string): Promise<string | null> {
    const out = await this.call<{ Item?: DdbItem }>("GetItem", {
      TableName: IDEM_TABLE,
      Key: marshal({ requestId }),
    });
    if (!out.Item) return null;
    const u = unmarshal(out.Item);
    const exp = u.exp as number;
    if (exp < Date.now() / 1000) return null; // TTL will remove it
    return u.response as string;
  }

  async idemPut(requestId: string, responseJson: string, ttlSeconds = IDEMPOTENCY_TTL_SECONDS): Promise<boolean> {
    await this.ensureIdemTable();
    try {
      await this.call("PutItem", {
        TableName: IDEM_TABLE,
        Item: marshal({
          requestId,
          response: responseJson,
          exp: Math.floor(Date.now() / 1000) + ttlSeconds,
        }),
        ConditionExpression: "attribute_not_exists(requestId)",
      });
      return true;
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) return false; // raced: winner stored it
      throw e;
    }
  }

  // ── data tables ─────────────────────────────────────────────────────────────

  async ensureTable(physical: string): Promise<void> {
    const status = await this.tableStatus(physical);
    if (status === "ACTIVE") return;
    if (status === null) {
      // create it, then poll until ACTIVE (data ops are rejected while CREATING)
      await this.call("CreateTable", {
        TableName: physical,
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      });
    }
    // poll up to ~20 s (max 10 extra subrequests — free-plan budget safe)
    for (let i = 0; i < 10; i++) {
      const s = await this.tableStatus(physical);
      if (s === "ACTIVE") return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw serviceUnavailable("Table did not become ready in time");
  }

  /** Returns "ACTIVE" / "CREATING" / … or null when the table doesn't exist. */
  private async tableStatus(physical: string): Promise<string | null> {
    try {
      const out = await this.call<{ Table?: { TableStatus?: string } }>("DescribeTable", { TableName: physical });
      return out.Table?.TableStatus ?? null;
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  }

  async dropTable(physical: string): Promise<void> {
    // empty the table first (DynamoDB cannot delete non-empty tables)
    for (let guard = 0; guard < 10; guard++) {
      const out = await this.call<{ Items?: DdbItem[]; LastEvaluatedKey?: DdbItem }>("Scan", {
        TableName: physical,
        ProjectionExpression: "pk, sk",
      });
      const items = out.Items || [];
      if (items.length === 0) break;
      for (let i = 0; i < items.length; i += 25) {
        await this.call("BatchWriteItem", {
          RequestItems: {
            [physical]: items.slice(i, i + 25).map((it) => ({
              DeleteRequest: { Key: { pk: it.pk, sk: it.sk } },
            })),
          },
        });
      }
      if (!out.LastEvaluatedKey) break;
    }
    await this.call("DeleteTable", { TableName: physical });
  }

  // ── items ───────────────────────────────────────────────────────────────────

  private itemFromDdb(item: DdbItem): StoredItem {
    const u = unmarshal(item);
    return {
      pk: u.pk as string,
      sk: u.sk as string,
      data: u.data as string,
      v: u.v as number,
      created: u.created as number,
      updated: u.updated as number,
    };
  }

  async putItem(physical: string, item: { pk: string; sk: string; data: string }, opts: PutOptions = {}): Promise<StoredItem> {
    const now = Math.floor(Date.now() / 1000);
    await this.call("PutItem", {
      TableName: physical,
      Item: marshal({ pk: item.pk, sk: item.sk, data: item.data, v: 1, created: now, updated: now }),
      ...(opts.overwrite
        ? {}
        : { ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)" }),
    });
    return { pk: item.pk, sk: item.sk, data: item.data, v: 1, created: now, updated: now };
  }

  async getItem(physical: string, pk: string, sk: string, strong?: boolean): Promise<StoredItem | null> {
    const out = await this.call<{ Item?: DdbItem }>("GetItem", {
      TableName: physical,
      Key: marshal({ pk, sk }),
      ...(strong ? { ConsistentRead: true } : {}),
    });
    return out.Item ? this.itemFromDdb(out.Item) : null;
  }

  async updateItem(physical: string, pk: string, sk: string, data: string, expectedVersion?: number): Promise<StoredItem> {
    const now = Math.floor(Date.now() / 1000);
    const values = marshal({ ":d": data, ":u": now, ":one": 1, ...(expectedVersion !== undefined ? { ":ev": expectedVersion } : {}) });
    const condition = expectedVersion !== undefined
      ? "attribute_exists(pk) AND v = :ev"
      : "attribute_exists(pk)";
    const out = await this.call<{ Attributes?: DdbItem }>("UpdateItem", {
      TableName: physical,
      Key: marshal({ pk, sk }),
      // `data` and `updated` are DynamoDB RESERVED WORDS → alias with #d/#u
      UpdateExpression: "SET #d = :d, #u = :u, v = v + :one",
      ExpressionAttributeNames: { "#d": "data", "#u": "updated" },
      ConditionExpression: condition,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    });
    if (!out.Attributes) throw notFound("Item not found");
    return this.itemFromDdb(out.Attributes);
  }

  async deleteItem(physical: string, pk: string, sk: string, expectedVersion?: number): Promise<void> {
    await this.call("DeleteItem", {
      TableName: physical,
      Key: marshal({ pk, sk }),
      ...(expectedVersion !== undefined
        ? { ConditionExpression: "attribute_exists(pk) AND v = :ev", ExpressionAttributeValues: marshal({ ":ev": expectedVersion }) }
        : { ConditionExpression: "attribute_exists(pk)" }),
    });
  }

  async queryItems(physical: string, pk: string, skPrefix: string | undefined, limit: number, startKey?: string): Promise<QueryResult> {
    const params: Record<string, unknown> = {
      TableName: physical,
      Limit: limit,
    };
    if (skPrefix) {
      params.KeyConditionExpression = "pk = :pk AND begins_with(sk, :p)";
      params.ExpressionAttributeValues = marshal({ ":pk": pk, ":p": skPrefix });
    } else {
      params.KeyConditionExpression = "pk = :pk";
      params.ExpressionAttributeValues = marshal({ ":pk": pk });
    }
    if (startKey) {
      try {
        params.ExclusiveStartKey = JSON.parse(startKey);
      } catch {
        // invalid token → start from beginning (documented behavior)
      }
    }
    const out = await this.call<{ Items?: DdbItem[]; LastEvaluatedKey?: DdbItem }>("Query", params);
    return {
      items: (out.Items || []).map((i) => this.itemFromDdb(i)),
      hasMore: Boolean(out.LastEvaluatedKey),
      startKey: out.LastEvaluatedKey ? JSON.stringify(out.LastEvaluatedKey) : undefined,
    };
  }
}