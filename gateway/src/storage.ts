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
}

export interface StoredItem {
  pk: string;
  sk: string;
  /** JSON string of the app's payload (everything except pk/sk) */
  data: string;
  /** version, bumped on every update (conditional writes use this) */
  v: number;
  created: number;
  updated: number;
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

  // data tables (physical names are app_<appId>_<logical>, built by tables.ts)
  ensureTable(physical: string): Promise<void>; // create if missing; 409→ok
  dropTable(physical: string): Promise<void>; // empty (paginated) then delete

  // items
  putItem(physical: string, item: { pk: string; sk: string; data: string }, opts?: PutOptions): Promise<StoredItem>;
  getItem(physical: string, pk: string, sk: string, strong?: boolean): Promise<StoredItem | null>;
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