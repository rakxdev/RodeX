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
});