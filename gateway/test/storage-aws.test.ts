/**
 * storage-aws.test.ts — pure-unit tests for the DynamoDB marshaling layer
 * (no network). Guards the empty-string-set rule and value round-trips.
 */
import { describe, expect, it } from "vitest";
import { badRequest, HttpError } from "../src/errors";
import { AwsStorage } from "../src/storage-aws";

// marshal/unmarshal are module-private; exercise them through public ops that
// don't touch the network by reaching into the class via any.
const s = new AwsStorage({ AWS_ACCESS_KEY_ID: "x", AWS_SECRET_ACCESS_KEY: "y" }) as unknown as {
  call: (op: string, params: Record<string, unknown>) => Promise<unknown>;
};

// a DynamoDB item as the wire format delivers it (attribute maps)
const marshalRow = {
  appId: { S: "app_x" },
  name: { S: "n" },
  keyHash: { S: "h" },
  keyPrefix: { S: "p" },
  status: { S: "active" },
  createdAt: { N: "1" },
  tables: { L: [] },
  description: { S: "weather pipeline" },
  keyCipher: { S: "ivB64.ctB64" },
  keyCipherUntil: { N: "1786480151" },
};

describe("AwsStorage capacity-mode rules", () => {
  it("ensureTable skips the 5/5 throughput upgrade on on-demand tables (regression: writes 400'd)", async () => {
    const storage = s as unknown as { ensureTable: (physical: string, mode?: string) => Promise<void> };
    const ops: string[] = [];
    (s as any).call = async (op: string, params: Record<string, unknown>) => {
      ops.push(op);
      if (op === "DescribeTable") {
        if (String(params.TableName).includes("ondemand")) {
          return { Table: { TableStatus: "ACTIVE", BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" } } };
        }
        return { Table: { TableStatus: "ACTIVE", ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } } };
      }
      return {};
    };
    // on-demand table: describe only — NO UpdateTable
    await storage.ensureTable("app_x_ondemand");
    expect(ops.filter((o) => o === "UpdateTable").length).toBe(0);
    ops.length = 0;
    // provisioned 1/1 table: upgrade still happens
    await storage.ensureTable("app_x_prov");
    expect(ops.filter((o) => o === "UpdateTable").length).toBe(1);
    expect(ops).toContain("UpdateTable");
  });

  it("setTableCapacity switches billing modes (PAY_PER_REQUEST / PROVISIONED 5/5)", async () => {
    const storage = s as unknown as { setTableCapacity: (p: string, m: string) => Promise<void> };
    const calls: Array<{ mode?: string; wcu?: number }> = [];
    (s as any).call = async (_op: string, params: Record<string, unknown>) => {
      calls.push({ mode: params.BillingMode as string, wcu: (params.ProvisionedThroughput as { WriteCapacityUnits: number } | undefined)?.WriteCapacityUnits });
      return {};
    };
    await storage.setTableCapacity("app_x_t", "on-demand");
    await storage.setTableCapacity("app_x_t", "provisioned");
    expect(calls[0].mode).toBe("PAY_PER_REQUEST");
    expect(calls[1].mode).toBe("PROVISIONED");
    expect(calls[1].wcu).toBe(5);
  });
});

describe("AwsStorage marshaling rules", () => {
  it("never emits an empty string set (DynamoDB rejects SS: [])", async () => {
    let captured: any = null;
    (s as any).call = async (_op: string, params: Record<string, unknown>) => {
      captured = params;
      return {};
    };
    await (s as any).createApp({
      appId: "app_x",
      name: "n",
      keyHash: "h",
      keyPrefix: "p",
      status: "active",
      createdAt: 1,
      tables: [], // ← the regression: empty SS
    });
    expect(captured).not.toBeNull();
    const item = captured.Item as Record<string, unknown>;
    expect(item["tables"]).toBeUndefined();
    expect(JSON.stringify(item)).not.toContain("SS");
  });

  it("emits string sets when non-empty", async () => {
    let captured: any = null;
    (s as any).call = async (_op: string, params: Record<string, unknown>) => {
      captured = params;
      return {};
    };
    await (s as any).addTableToApp("app_x", "users");
    const values = (captured as any).ExpressionAttributeValues;
    expect(values[":t"]).toEqual({ SS: ["users"] });
  });

  it("ensureTable waits for ACTIVE before returning (CREATING race)", async () => {
    let describes = 0;
    (s as any).call = async (op: string) => {
      if (op.includes("DescribeTable")) {
        describes++;
        if (describes === 1) throw new HttpError(404, "not found yet"); // doesn't exist → create below
        if (describes === 2) return { Table: { TableStatus: "CREATING" } }; // created, still warming
        return { Table: { TableStatus: "ACTIVE" } }; // ready on the next poll
      }
      if (op.includes("CreateTable")) return {};
      return {};
    };
    await expect((s as any).ensureTable("t")).resolves.toBeUndefined();
    expect(describes).toBeGreaterThanOrEqual(3);
  });

  it("maps DynamoDB validation errors to 400", async () => {
    (s as any).call = async () => {
      throw badRequest("boom");
    };
    await expect((s as any).createApp({ tables: [] })).rejects.toMatchObject({ status: 400 });
  });

  it("auto-upgrades legacy 1/1 tables to 5/5 (free-tier optimal)", async () => {
    let updated = false;
    (s as any).call = async (op: string) => {
      if (op === "DescribeTable") return { Table: { TableStatus: "ACTIVE", ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } } };
      if (op === "UpdateTable") { updated = true; return {}; }
      return {};
    };
    await (s as any).ensureTable("app_x_t");
    expect(updated).toBe(true);
  });

  it("leaves already-5/5 tables untouched", async () => {
    let updated = false;
    (s as any).call = async (op: string) => {
      if (op === "DescribeTable") return { Table: { TableStatus: "ACTIVE", ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } } };
      if (op === "UpdateTable") { updated = true; return {}; }
      return {};
    };
    await (s as any).ensureTable("app_x_t");
    expect(updated).toBe(false);
  });

  it("round-trips newer AppRow fields (description/keyCipher/keyCipherUntil) — regression: view-key 'expired' on read", async () => {
    (s as any).call = async (op: string) => {
      if (op === "GetItem") {
        // simulate DynamoDB returning every attribute the row was written with
        return { Item: marshalRow };
      }
      return {};
    };
    const row = await (s as any).getApp("app_x");
    expect(row.description).toBe("weather pipeline");
    expect(row.keyCipher).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(row.keyCipherUntil).toBe(1786480151);
  });
});