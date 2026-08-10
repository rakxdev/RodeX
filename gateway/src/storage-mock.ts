/**
 * storage-mock.ts — in-memory implementation with the SAME error semantics
 * as the AWS adapter (409/404/413/429 behavior), so tests are meaningful.
 * Local dev: STORAGE=mock (default). Not durable — dev/tests only.
 */
import { conflict, notFound } from "./errors";
import type { AppRow, McpKeyRow, PutOptions, QueryResult, Storage, StoredItem } from "./storage";

const KEY_SEP = "\u0000";

// Singleton: mock mode behaves like a long-lived dev server (state persists
// across requests within the process). Tests call resetMockStorage().
let singleton: MockStorage | null = null;

export function getMockSingleton(): MockStorage {
  if (!singleton) singleton = new MockStorage();
  return singleton;
}

export function resetMockStorage(): void {
  singleton = null;
}

export class MockStorage implements Storage {
  private apps = new Map<string, AppRow>();
  private idem = new Map<string, { resp: string; exp: number }>();
  private settings = new Map<string, string>();
  private mcpKeys = new Map<string, McpKeyRow>();
  private tables = new Map<string, Map<string, StoredItem>>();

  private table(name: string): Map<string, StoredItem> {
    const t = this.tables.get(name);
    if (!t) throw notFound(`Table does not exist (${name})`);
    return t;
  }

  // ── apps ────────────────────────────────────────────────────────────────────
  async createApp(row: AppRow): Promise<void> {
    if (this.apps.has(row.appId)) throw conflict("App already exists");
    this.apps.set(row.appId, { ...row, tables: [...row.tables] });
  }
  async getApp(appId: string): Promise<AppRow | null> {
    const a = this.apps.get(appId);
    return a ? { ...a, tables: [...a.tables] } : null;
  }
  async listApps(): Promise<AppRow[]> {
    return [...this.apps.values()].map((a) => ({ ...a, tables: [...a.tables] }));
  }
  async putApp(row: AppRow): Promise<void> {
    this.apps.set(row.appId, { ...row, tables: [...row.tables] });
  }
  async deleteAppRow(appId: string): Promise<void> {
    this.apps.delete(appId);
  }
  async scanDeletingApps(nowSec: number, limit: number): Promise<AppRow[]> {
    return [...this.apps.values()]
      .filter((a) => a.status === "deleting" && (a.purgeAt ?? Infinity) <= nowSec)
      .slice(0, limit)
      .map((a) => ({ ...a, tables: [...a.tables] }));
  }
  async addTableToApp(appId: string, logical: string): Promise<void> {
    const a = this.apps.get(appId);
    if (!a) throw notFound("App not found");
    if (a.tables.includes(logical)) throw conflict(`Table already exists (${logical})`);
    a.tables = [...a.tables, logical];
  }
  async removeTableFromApp(appId: string, logical: string): Promise<void> {
    const a = this.apps.get(appId);
    if (!a) return;
    a.tables = a.tables.filter((t) => t !== logical);
  }

  // ── settings ────────────────────────────────────────────────────────────────
  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async putSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  // ── MCP master keys ─────────────────────────────────────────────────────────
  async mcpKeyCreate(row: McpKeyRow): Promise<void> {
    if (this.mcpKeys.has(row.keyId)) throw conflict("MCP key already exists");
    this.mcpKeys.set(row.keyId, { ...row });
  }

  async mcpKeyGet(keyId: string): Promise<McpKeyRow | null> {
    const k = this.mcpKeys.get(keyId);
    return k ? { ...k } : null;
  }

  async mcpKeyFindByHash(keyHash: string): Promise<McpKeyRow | null> {
    for (const k of this.mcpKeys.values()) {
      if (k.keyHash === keyHash) return { ...k };
    }
    return null;
  }

  async mcpKeyList(): Promise<McpKeyRow[]> {
    return [...this.mcpKeys.values()].map((k) => ({ ...k }));
  }

  async mcpKeyDelete(keyId: string): Promise<void> {
    if (!this.mcpKeys.has(keyId)) throw notFound("MCP key not found");
    this.mcpKeys.delete(keyId);
  }

  // ── idempotency ─────────────────────────────────────────────────────────────
  async idemGet(requestId: string): Promise<string | null> {
    const r = this.idem.get(requestId);
    if (!r) return null;
    if (r.exp < Date.now() / 1000) {
      this.idem.delete(requestId);
      return null;
    }
    return r.resp;
  }
  async idemPut(requestId: string, responseJson: string, ttlSeconds: number): Promise<boolean> {
    const existing = this.idem.get(requestId);
    if (existing && existing.exp >= Date.now() / 1000) return false; // already stored
    this.idem.set(requestId, { resp: responseJson, exp: Date.now() / 1000 + ttlSeconds });
    return true;
  }

  // ── tables ──────────────────────────────────────────────────────────────────
  async ensureTable(physical: string): Promise<void> {
    if (!this.tables.has(physical)) this.tables.set(physical, new Map());
  }
  async dropTable(physical: string): Promise<void> {
    this.tables.delete(physical);
  }

  async storageSize(physical: string): Promise<{ bytes: number; items: number } | null> {
    const t = this.tables.get(physical);
    if (!t) return null;
    let bytes = 0;
    for (const [, item] of t) {
      bytes += JSON.stringify(item).length;
    }
    return { bytes, items: t.size };
  }

  // ── items ───────────────────────────────────────────────────────────────────
  private key(pk: string, sk: string) {
    return pk + KEY_SEP + sk;
  }

  async putItem(physical: string, item: { pk: string; sk: string; data: string }, opts: PutOptions = {}): Promise<StoredItem> {
    const t = this.table(physical);
    const k = this.key(item.pk, item.sk);
    if (!opts.overwrite && t.has(k)) throw conflict("Item already exists — use update or overwrite:true");
    const now = Math.floor(Date.now() / 1000);
    const stored: StoredItem = { pk: item.pk, sk: item.sk, data: item.data, v: 1, created: now, updated: now };
    t.set(k, stored);
    return { ...stored };
  }

  async getItem(physical: string, pk: string, sk: string): Promise<StoredItem | null> {
    const it = this.table(physical).get(this.key(pk, sk));
    return it ? { ...it } : null;
  }

  async updateItem(physical: string, pk: string, sk: string, data: string, expectedVersion?: number): Promise<StoredItem> {
    const t = this.table(physical);
    const k = this.key(pk, sk);
    const cur = t.get(k);
    if (!cur) throw notFound("Item not found");
    if (expectedVersion !== undefined && cur.v !== expectedVersion) {
      throw conflict(`Version mismatch: item is at v${cur.v}, expected v${expectedVersion}`);
    }
    const next: StoredItem = { ...cur, data, v: cur.v + 1, updated: Math.floor(Date.now() / 1000) };
    t.set(k, next);
    return { ...next };
  }

  async deleteItem(physical: string, pk: string, sk: string, expectedVersion?: number): Promise<void> {
    const t = this.table(physical);
    const k = this.key(pk, sk);
    const cur = t.get(k);
    if (!cur) throw notFound("Item not found");
    if (expectedVersion !== undefined && cur.v !== expectedVersion) {
      throw conflict(`Version mismatch: item is at v${cur.v}, expected v${expectedVersion}`);
    }
    t.delete(k);
  }

  async queryItems(physical: string, pk: string, skPrefix: string | undefined, limit: number): Promise<QueryResult> {
    const t = this.table(physical);
    const rows = [...t.values()].filter((i) => i.pk === pk && (!skPrefix || i.sk.startsWith(skPrefix)));
    rows.sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
    const page = rows.slice(0, limit);
    return {
      items: page.map((i) => ({ ...i })),
      hasMore: rows.length > limit,
    };
  }
}