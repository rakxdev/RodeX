import { describe, expect, it } from "vitest";
import { HttpError } from "../src/errors";
import { assertItemSize, MAX_ITEM_BYTES } from "../src/limits";
import { MockStorage } from "../src/storage-mock";
import type { AppRow } from "../src/storage";

function makeApp(over: Partial<AppRow> = {}): AppRow {
  return {
    appId: "app_test1",
    name: "testapp",
    keyHash: "h".repeat(64),
    keyPrefix: "abc123",
    status: "active",
    createdAt: 1_700_000_000,
    tables: [],
    ...over,
  };
}

function statusOf(e: unknown): number {
  return e instanceof HttpError ? e.status : -1;
}

describe("MockStorage — apps", () => {
  const s = new MockStorage();

  it("createApp + getApp + listApps round-trip", async () => {
    await s.createApp(makeApp());
    const got = await s.getApp("app_test1");
    expect(got?.name).toBe("testapp");
    expect(got?.tables).toEqual([]);
    expect((await s.listApps()).length).toBe(1);
  });

  it("createApp duplicate → 409", async () => {
    await expect(s.createApp(makeApp())).rejects.toSatisfy((e) => statusOf(e) === 409);
  });

  it("addTableToApp dedupes; removeTableToApp works", async () => {
    await s.addTableToApp("app_test1", "users");
    await expect(s.addTableToApp("app_test1", "users")).rejects.toSatisfy((e) => statusOf(e) === 409);
    await s.addTableToApp("app_test1", "logs");
    expect((await s.getApp("app_test1"))?.tables).toEqual(["users", "logs"]);
    await s.removeTableFromApp("app_test1", "users");
    expect((await s.getApp("app_test1"))?.tables).toEqual(["logs"]);
  });

  it("scanDeletingApps only returns due deletions", async () => {
    const s2 = new MockStorage();
    await s2.createApp(makeApp({ appId: "a1", status: "deleting", purgeAt: 100 }));
    await s2.createApp(makeApp({ appId: "a2", status: "deleting", purgeAt: 9999 }));
    await s2.createApp(makeApp({ appId: "a3", status: "active" }));
    const due = await s2.scanDeletingApps(500, 10);
    expect(due.map((a) => a.appId)).toEqual(["a1"]);
  });
});

describe("MockStorage — idempotency", () => {
  const s = new MockStorage();

  it("stores and returns response JSON; missing → null", async () => {
    expect(await s.idemGet("req1")).toBeNull();
    await s.idemPut("req1", JSON.stringify({ ok: true }), 60);
    expect(await s.idemGet("req1")).toBe(JSON.stringify({ ok: true }));
  });

  it("expired records behave as missing", async () => {
    await s.idemPut("req2", "x", 1); // 1s TTL
    await new Promise((r) => setTimeout(r, 1100));
    expect(await s.idemGet("req2")).toBeNull();
  });
});

describe("MockStorage — items & queries", () => {
  const s = new MockStorage();

  it("put → get → update (version bumps) → delete lifecycle", async () => {
    await s.ensureTable("app_t_users");
    const put = await s.putItem("app_t_users", { pk: "U#1", sk: "PROFILE", data: "{\"a\":1}" });
    expect(put.v).toBe(1);

    const got = await s.getItem("app_t_users", "U#1", "PROFILE");
    expect(got?.data).toBe('{"a":1}');

    const upd = await s.updateItem("app_t_users", "U#1", "PROFILE", '{"a":2}', 1);
    expect(upd.v).toBe(2);

    await s.deleteItem("app_t_users", "U#1", "PROFILE", 2);
    expect(await s.getItem("app_t_users", "U#1", "PROFILE")).toBeNull();
  });

  it("put duplicate → 409; overwrite works", async () => {
    await s.putItem("app_t_users", { pk: "U#9", sk: "A", data: "{}" });
    await expect(s.putItem("app_t_users", { pk: "U#9", sk: "A", data: "{}" })).rejects.toSatisfy((e) => statusOf(e) === 409);
    const o = await s.putItem("app_t_users", { pk: "U#9", sk: "A", data: "{}" }, { overwrite: true });
    expect(o.v).toBe(1);
  });

  it("update missing → 404; stale version → 409", async () => {
    await expect(s.updateItem("app_t_users", "U#x", "A", "{}")).rejects.toSatisfy((e) => statusOf(e) === 404);
    await s.putItem("app_t_users", { pk: "U#v", sk: "A", data: "{}" });
    await expect(s.updateItem("app_t_users", "U#v", "A", "{}", 99)).rejects.toSatisfy((e) => statusOf(e) === 409);
  });

  it("query: pk filter, sk prefix, limit + hasMore", async () => {
    const s2 = new MockStorage();
    await s2.ensureTable("t");
    for (let i = 0; i < 5; i++) await s2.putItem("t", { pk: "P1", sk: `MSG#${i}`, data: "{}" });
    await s2.putItem("t", { pk: "P2", sk: "MSG#0", data: "{}" });

    const all = await s2.queryItems("t", "P1", undefined, 100);
    expect(all.items.length).toBe(5);
    expect(all.hasMore).toBe(false);

    const prefixed = await s2.queryItems("t", "P1", "MSG#", 100);
    expect(prefixed.items.length).toBe(5);

    const paged = await s2.queryItems("t", "P1", undefined, 2);
    expect(paged.items.length).toBe(2);
    expect(paged.hasMore).toBe(true);
  });

  it("missing table → 404", async () => {
    await expect(s.getItem("no_such_table", "a", "b")).rejects.toSatisfy((e) => statusOf(e) === 404);
  });
});

describe("assertItemSize", () => {
  it("rejects payloads over the cap with 413", () => {
    expect(() => assertItemSize({ x: "y".repeat(MAX_ITEM_BYTES) })).toThrow();
    try {
      assertItemSize({ x: "y".repeat(MAX_ITEM_BYTES) });
    } catch (e) {
      expect(statusOf(e)).toBe(413);
    }
    expect(() => assertItemSize({ x: "small" })).not.toThrow();
  });
});