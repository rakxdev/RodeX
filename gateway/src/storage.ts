/**
 * storage.ts — storage interface + shared types.
 * Two implementations: storage-mock (local dev/tests, zero AWS) and
 * storage-aws (real DynamoDB via aws4fetch). Handlers depend ONLY on this
 * interface, so all logic is testable without AWS credentials.
 */
import type { Env } from "./env";
import { AwsStorage } from "./storage-aws";
import { getMockSingleton } from "./storage-mock";

// ── Records ──────────────────────────────────────────────────────────────────

export type AppStatus = "active" | "suspended" | "deleting";

/** Console-managed MCP master key (full platform access). Hash-only at rest +
 *  AES-GCM cipher for anytime view (no expiry — founder decision). */
export interface McpKeyRow {
  keyId: string;
  /** human name, 1–40 chars */
  name: string;
  /** optional note, ≤ 200 chars */
  description?: string;
  /** HMAC-SHA256(SESSION_SECRET, key) — never the raw key */
  keyHash: string;
  /** AES-GCM ciphertext of the raw key — decryptable ANYTIME */
  keyCipher?: string;
  createdAt: number;
}

export interface AppRow {
  appId: string;
  name: string;
  /** HMAC-SHA256(SESSION_SECRET, apiKey) — never the raw key */
  keyHash: string;
  /** first 6 chars of the raw key, for display only */
  keyPrefix: string;
  status: AppStatus;
  /** unix seconds; set while status === "deleting" */
  purgeAt?: number;
  createdAt: number;
  rotatedAt?: number;
  /** logical table names this app owns */
  tables: string[];
  /** optional human note (≤ 200 chars), free-form */
  description?: string;
  /** AES-GCM ciphertext of the raw key (viewable inside the recovery window only) */
  keyCipher?: string;
  /** unix seconds until which keyCipher may be decrypted */
  keyCipherUntil?: number;
}

export interface StoredItem {
  pk: string;
  sk: string;
  /** JSON string of the app's payload (everything except pk/sk/ttl) */
  data: string;
  /** version, bumped on every update (conditional writes use this) */
  v: number;
  created: number;
  updated: number;
  /** unix seconds — row expires after this (DynamoDB TTL; gateway filters on read) */
  ttl?: number;
  /** atomic counter value (increment rows) */
  counter?: number;
}

export interface QueryResult {
  items: StoredItem[];
  hasMore: boolean;
  /** opaque pagination token; pass back as startKey */
  startKey?: string;
}

export interface PutOptions {
  /** true → unconditional overwrite (resets version to 1) */
  overwrite?: boolean;
}

// ── Interface ────────────────────────────────────────────────────────────────

export interface Storage {
  // apps / registry
  createApp(row: AppRow): Promise<void>; // 409 if appId exists
  getApp(appId: string): Promise<AppRow | null>;
  listApps(): Promise<AppRow[]>;
  putApp(row: AppRow): Promise<void>; // unconditional upsert (rotate/status)
  deleteAppRow(appId: string): Promise<void>;
  /** apps in status=deleting with purgeAt <= now (cron purge) */
  scanDeletingApps(nowSec: number, limit: number): Promise<AppRow[]>;
  addTableToApp(appId: string, logical: string): Promise<void>; // 409 on dup
  removeTableFromApp(appId: string, logical: string): Promise<void>;

  // idempotency (24 h TTL)
  idemGet(requestId: string): Promise<string | null>; // stored response JSON
  /** true if stored; false if requestId already exists (caller must idemGet) */
  idemPut(requestId: string, responseJson: string, ttlSeconds: number): Promise<boolean>;

  // platform settings (admin password hash lives here; env ADMIN_PASSWORD is fallback)
  getSetting(key: string): Promise<string | null>;
  putSetting(key: string, value: string): Promise<void>;

  // MCP master keys (console-managed, full platform access)
  mcpKeyCreate(row: McpKeyRow): Promise<void>; // 409 if keyId exists
  mcpKeyGet(keyId: string): Promise<McpKeyRow | null>;
  /** find a key by its hash (MCP Bearer auth — never scans raw keys) */
  mcpKeyFindByHash(keyHash: string): Promise<McpKeyRow | null>;
  mcpKeyList(): Promise<McpKeyRow[]>;
  mcpKeyDelete(keyId: string): Promise<void>;

  // data tables (physical names are app_<appId>_<logical>, built by tables.ts)
  ensureTable(physical: string, billingMode?: "on-demand" | "provisioned"): Promise<void>; // create if missing; 409→ok
  dropTable(physical: string): Promise<void>; // empty (paginated) then delete
  /** switch a table between billing modes (on-demand = PAY_PER_REQUEST). Takes minutes at AWS. */
  setTableCapacity(physical: string, mode: "on-demand" | "provisioned"): Promise<void>;
  /** current billing mode of a table (null = unknown/absent). */
  tableCapacityMode(physical: string): Promise<"on-demand" | "provisioned" | null>;
  /** observability: approximate size + item count (DynamoDB ItemCount lags ~6 h) */
  storageSize(physical: string): Promise<{ bytes: number; items: number } | null>;

  // items
  putItem(physical: string, item: { pk: string; sk: string; data: string; ttl?: number }, opts?: PutOptions): Promise<StoredItem>;
  getItem(physical: string, pk: string, sk: string, strong?: boolean): Promise<StoredItem | null>;
  /** multi-get: one call for up to 50 keys; null = missing (or expired) */
  getItems(physical: string, keys: Array<{ pk: string; sk: string }>, strong?: boolean): Promise<Array<StoredItem | null>>;
  /** atomic counter: ADD by to the row's numeric `ctr` (creates the row if missing). Returns the new counter. */
  increment(physical: string, pk: string, sk: string, by: number): Promise<StoredItem>;
  updateItem(physical: string, pk: string, sk: string, data: string, expectedVersion?: number): Promise<StoredItem>;
  deleteItem(physical: string, pk: string, sk: string, expectedVersion?: number): Promise<void>;
  queryItems(physical: string, pk: string, skPrefix: string | undefined, limit: number, startKey?: string): Promise<QueryResult>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createStorage(env: Env): Storage {
  if (env.STORAGE === "aws") {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE=aws requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY secrets");
    }
    return new AwsStorage(env as Required<Pick<Env, "AWS_ACCESS_KEY_ID" | "AWS_SECRET_ACCESS_KEY">>);
  }
  return getMockSingleton();
}