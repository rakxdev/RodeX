/**
 * storage-aws.test.ts — pure-unit tests for the DynamoDB marshaling layer
 * (no network). Guards the empty-string-set rule and value round-trips.
 */
import { describe, expect, it } from "vitest";
import { badRequest } from "../src/errors";
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

  it("maps DynamoDB validation errors to 400", async () => {
    (s as any).call = async () => {
      throw badRequest("boom");
    };
    await expect((s as any).createApp({ tables: [] })).rejects.toMatchObject({ status: 400 });
  });
});