import { describe, expect, it } from "vitest";
import { HttpError } from "../src/errors";
import { createApp, forceDelete, getApp, physicalName, purgeDue, recover, rotateKey, softDelete, toPublic } from "../src/registry";
import { MockStorage } from "../src/storage-mock";

const SECRET = "test-secret-0123456789abcdef";

function statusOf(e: unknown): number {
  return e instanceof HttpError ? e.status : -1;
}

describe("registry — lifecycle", () => {
  it("createApp issues one-time key and stores only a hash", async () => {
    const s = new MockStorage();
    const { app, api_key } = await createApp(s, SECRET, "mybot");
    expect(app.status).toBe("active");
    expect(api_key).toMatch(/^rok_[A-Za-z0-9_-]{43}$/);
    const row = await s.getApp(app.app_id);
    expect(row?.keyHash).not.toContain(api_key);
    expect(row?.keyPrefix).toBe(api_key.slice(0, 6));
  });

  it("rotateKey replaces the hash", async () => {
    const s = new MockStorage();
    const { app, api_key } = await createApp(s, SECRET, "bot");
    const before = (await s.getApp(app.app_id))!.keyHash;
    const { api_key: newKey } = await rotateKey(s, SECRET, app.app_id);
    expect(newKey).not.toBe(api_key);
    const after = (await s.getApp(app.app_id))!;
    expect(after.keyHash).not.toBe(before);
    expect(after.keyHash.length).toBe(64);
  });

  it("soft delete → recover works in window", async () => {
    const s = new MockStorage();
    const { app } = await createApp(s, SECRET, "bot");
    const deleting = await softDelete(s, app.app_id);
    expect(deleting.status).toBe("deleting");
    expect(deleting.purge_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const restored = await recover(s, app.app_id);
    expect(restored.status).toBe("active");
    expect(restored.purge_at).toBeUndefined();
  });

  it("recover on non-deleting app → 409; double soft-delete → 409", async () => {
    const s = new MockStorage();
    const { app } = await createApp(s, SECRET, "bot");
    await expect(recover(s, app.app_id)).rejects.toSatisfy((e) => statusOf(e) === 409);
    await softDelete(s, app.app_id);
    await expect(softDelete(s, app.app_id)).rejects.toSatisfy((e) => statusOf(e) === 409);
  });

  it("forceDelete drops tables and registry row", async () => {
    const s = new MockStorage();
    const { app } = await createApp(s, SECRET, "bot");
    await s.ensureTable(physicalName(app.app_id, "users"));
    await s.addTableToApp(app.app_id, "users");
    await s.putItem(physicalName(app.app_id, "users"), { pk: "U#1", sk: "P", data: "{}" });
    await forceDelete(s, app.app_id);
    expect(await s.getApp(app.app_id)).toBeNull();
    await expect(s.getItem(physicalName(app.app_id, "users"), "U#1", "P")).rejects.toSatisfy((e) => statusOf(e) === 404);
  });

  it("purgeDue only removes expired deletions, bounded by limit", async () => {
    const s = new MockStorage();
    const a = await createApp(s, SECRET, "a");
    const b = await createApp(s, SECRET, "b");
    const c = await createApp(s, SECRET, "c");

    const rowA = await getApp(s, a.app.app_id);
    rowA.status = "deleting";
    rowA.purgeAt = 1;
    await s.putApp(rowA);
    const rowB = await getApp(s, b.app.app_id);
    rowB.status = "deleting";
    rowB.purgeAt = 1;
    await s.putApp(rowB);
    const rowC = await getApp(s, c.app.app_id);
    rowC.status = "deleting";
    rowC.purgeAt = 9_999_999_999;
    await s.putApp(rowC);

    expect(await purgeDue(s, 1_000, 1)).toBe(1);
    expect(await s.getApp(a.app.app_id)).toBeNull();
    expect(await s.getApp(b.app.app_id)).not.toBeNull();
    expect(await purgeDue(s, 1_000, 10)).toBe(1);
    expect(await s.getApp(b.app.app_id)).toBeNull();
    expect(await s.getApp(c.app.app_id)).not.toBeNull(); // not yet due
  });

  it("physicalName is deterministic", () => {
    expect(physicalName("app_abc", "users")).toBe("app_app_abc_users");
  });

  it("toPublic never exposes keyHash", async () => {
    const s = new MockStorage();
    const { app } = await createApp(s, SECRET, "safe");
    const pub = toPublic((await s.getApp(app.app_id))!);
    expect(JSON.stringify(pub)).not.toContain("keyHash");
    expect(pub).not.toHaveProperty("keyHash");
  });
});