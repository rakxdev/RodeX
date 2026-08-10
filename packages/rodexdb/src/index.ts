/**
 * rodexdb — official TypeScript client for RodexDB.
 *
 * Thin, zero-dependency, URL-agnostic: you point it at ANY RodexDB gateway
 * (your own deploy via the Deploy button, or the live instance) and hand it
 * an app id + api key. It speaks the documented REST contract
 * (docs/api.md) — nothing more, nothing less.
 *
 * @example
 * ```ts
 * import { RodexDB } from "rodexdb";
 *
 * const db = new RodexDB({
 *   url: "https://my-own-name.workers.dev", // your gateway URL
 *   appId: "app_xxx",
 *   apiKey: "rok_...",
 * });
 *
 * await db.put("users", { pk: "u1", name: "Ada" });
 * const user = await db.get("users", "u1");
 * ```
 */

/** Gateway + credentials. `url` is always yours — never hardcoded by us. */
export interface RodexConfig {
  /** Base URL of a RodexDB gateway, e.g. https://my-name.workers.dev */
  url: string;
  /** App id (X-App-Id), e.g. app_xxxx */
  appId: string;
  /** App API key (X-Api-Key), e.g. rok_... */
  apiKey: string;
  /** Optional timeout per request in ms (default 15_000). */
  timeoutMs?: number;
}

/** An item as stored: pk/sk keys plus your data fields. */
export interface RodexItem {
  pk: string;
  sk?: string;
  [field: string]: unknown;
}

/** Stored item as returned by the gateway. */
export interface StoredItem {
  pk: string;
  sk: string;
  data: Record<string, unknown>;
  version: number;
  created: number;
  updated: number;
}

export interface QueryResult {
  items: StoredItem[];
  has_more: boolean;
  next_start_key?: string;
}

export interface TableInfo {
  name: string;
}

/** Structured error thrown for any non-2xx response. */
export class RodexError extends Error {
  readonly status: number;
  readonly code: number;
  constructor(status: number, code: number, message: string) {
    super(message);
    this.name = "RodexError";
    this.status = status;
    this.code = code;
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export class RodexDB {
  private readonly url: string;
  private readonly appId: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: RodexConfig) {
    const base = new URL(config.url);
    this.url = base.origin;
    this.appId = config.appId;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    if (!this.appId || !this.apiKey) {
      throw new RodexError(0, 0, "RodexDB requires appId and apiKey");
    }
  }

  // ── tables ────────────────────────────────────────────────────────────

  /** Create a table (name: ^[a-z0-9][a-z0-9_-]{0,41}$). */
  async createTable(name: string, requestId?: string): Promise<{ table: string; status: string }> {
    return this.post<{ table: string; status: string }>("/v1/table/create", { name, request_id: requestId });
  }

  /** List this app's tables. */
  async listTables(): Promise<TableInfo[]> {
    return this.getJson<{ tables: TableInfo[] }>("/v1/tables").then((r) => r.tables);
  }

  /** Delete a table and ALL its data — irreversible. */
  async deleteTable(name: string, requestId?: string): Promise<{ table: string; status: string }> {
    return this.post<{ table: string; status: string }>("/v1/table/delete", { name, request_id: requestId });
  }

  // ── items ─────────────────────────────────────────────────────────────

  /**
   * Write an item. `item.pk` is required; `item.sk` defaults to "~".
   * Pass `requestId` to make retries idempotent (24 h dedupe).
   * Pass `overwrite: true` to force-replace an existing pk/sk (resets version).
   */
  async put(table: string, item: RodexItem, opts?: { requestId?: string; overwrite?: boolean }): Promise<StoredItem & { table: string }> {
    return this.post<StoredItem & { table: string }>("/v1/item/put", {
      table,
      item,
      ...(opts?.requestId ? { request_id: opts.requestId } : {}),
      ...(opts?.overwrite ? { overwrite: true } : {}),
    });
  }

  /** Fetch one item (sk defaults to "~"). Returns null when missing. */
  async get(table: string, pk: string, sk?: string, strong = false): Promise<StoredItem | null> {
    try {
      return await this.post<StoredItem>("/v1/item/get", { table, pk, sk, strong });
    } catch (e) {
      if (e instanceof RodexError && e.status === 404) return null;
      throw e;
    }
  }

  /**
   * Update an item's data (REPLACES the stored payload). Pass
   * `expectedVersion` to get a 409 instead of silently clobbering changes.
   */
  async update(table: string, pk: string, sk: string, data: Record<string, unknown>, expectedVersion?: number, requestId?: string): Promise<StoredItem> {
    return this.post<StoredItem>("/v1/item/update", {
      table,
      pk,
      sk,
      data,
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
      ...(requestId ? { request_id: requestId } : {}),
    });
  }

  /** Delete one item. */
  async delete(table: string, pk: string, sk: string, expectedVersion?: number): Promise<{ deleted: boolean }> {
    return this.post<{ deleted: boolean }>("/v1/item/delete", {
      table,
      pk,
      sk,
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
    });
  }

  /** Query by pk with optional sk prefix, limit (≤100) and pagination. */
  async query(table: string, pk: string, opts?: { skPrefix?: string; limit?: number; startKey?: string }): Promise<QueryResult> {
    return this.post<QueryResult>("/v1/query", {
      table,
      pk,
      ...(opts?.skPrefix !== undefined ? { sk_prefix: opts.skPrefix } : {}),
      ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts?.startKey !== undefined ? { start_key: opts.startKey } : {}),
    });
  }

  // ── transport ─────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          ...JSON_HEADERS,
          "X-App-Id": this.appId,
          "X-Api-Key": this.apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        const err = (parsed as { error?: { code?: number; message?: string } } | null)?.error;
        throw new RodexError(res.status, err?.code ?? res.status, err?.message ?? `HTTP ${res.status}`);
      }
      const okBody = parsed as { ok?: boolean; result?: T } | null;
      return okBody?.result as T;
    } catch (e) {
      if (e instanceof RodexError) throw e;
      const msg = e instanceof Error && e.name === "AbortError" ? `Request timed out after ${this.timeoutMs}ms` : (e as Error).message;
      throw new RodexError(0, 0, msg);
    } finally {
      clearTimeout(timer);
    }
  }

  private getJson<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
}
