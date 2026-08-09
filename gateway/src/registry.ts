/**
 * registry.ts — app lifecycle + authentication against the registry.
 * Soft-delete state machine lives here:
 *   active ──delete──▶ deleting (purge_at = now + 5 min)
 *   deleting ──recover──▶ active        deleting ──force-delete──▶ gone
 *   deleting ──(cron: purge_at passed)──▶ gone
 */
import { constantTimeEqual, generateApiKey, hashKey } from "./auth";
import { conflict, forbidden, notFound, unauthorized } from "./errors";
import { SOFT_DELETE_WINDOW_MINUTES } from "./limits";
import type { AppRow, Storage } from "./storage";

export interface PublicApp {
  app_id: string;
  name: string;
  status: AppRow["status"];
  created_at: number;
  tables: string[];
  key_prefix: string;
  purge_at?: number;
}

export function toPublic(row: AppRow): PublicApp {
  return {
    app_id: row.appId,
    name: row.name,
    status: row.status,
    created_at: row.createdAt,
    tables: [...row.tables],
    key_prefix: row.keyPrefix,
    ...(row.purgeAt !== undefined ? { purge_at: row.purgeAt } : {}),
  };
}

function newAppId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "app_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create an app; returns the app row AND the one-time raw API key. */
export async function createApp(storage: Storage, secret: string, name: string): Promise<{ app: PublicApp; api_key: string }> {
  const appId = newAppId();
  const apiKey = generateApiKey();
  const keyHash = await hashKey(secret, apiKey);
  const row: AppRow = {
    appId,
    name,
    keyHash,
    keyPrefix: apiKey.slice(0, 6),
    status: "active",
    createdAt: Math.floor(Date.now() / 1000),
    tables: [],
  };
  await storage.createApp(row); // 409 on astronomically-unlikely collision
  return { app: toPublic(row), api_key: apiKey };
}

export async function getApp(storage: Storage, appId: string): Promise<AppRow> {
  const row = await storage.getApp(appId);
  if (!row) throw notFound("App not found");
  return row;
}

/** Authenticate an app request (X-App-Id + X-Api-Key). Throws 401/403. */
export async function authenticateApp(
  storage: Storage,
  secret: string,
  appId: string | undefined,
  apiKey: string | undefined,
): Promise<AppRow> {
  if (!appId || !apiKey) throw unauthorized("Missing X-App-Id or X-Api-Key");
  const row = await storage.getApp(appId);
  if (!row) throw unauthorized("Unknown app or invalid key");
  const expected = await hashKey(secret, apiKey);
  if (!constantTimeEqual(expected, row.keyHash)) throw unauthorized("Unknown app or invalid key");
  if (row.status === "suspended") throw forbidden("App is suspended");
  if (row.status === "deleting") throw forbidden("App is being deleted — recover it in the dashboard or wait");
  return row;
}

/** Rotate key: new key returned once; old one stops working immediately. */
export async function rotateKey(storage: Storage, secret: string, appId: string): Promise<{ api_key: string; key_prefix: string } & PublicApp> {
  const row = await getApp(storage, appId);
  const apiKey = generateApiKey();
  row.keyHash = await hashKey(secret, apiKey);
  row.keyPrefix = apiKey.slice(0, 6);
  row.rotatedAt = Math.floor(Date.now() / 1000);
  await storage.putApp(row);
  // flatten the full public app so clients can re-render the detail page
  return { api_key: apiKey, ...toPublic(row) };
}

export async function setStatus(storage: Storage, appId: string, status: AppRow["status"]): Promise<PublicApp> {
  const row = await getApp(storage, appId);
  row.status = status;
  if (status !== "deleting") row.purgeAt = undefined;
  await storage.putApp(row);
  return toPublic(row);
}

/** Soft delete: enter the recoverable window. */
export async function softDelete(storage: Storage, appId: string): Promise<PublicApp> {
  const row = await getApp(storage, appId);
  if (row.status === "deleting") throw conflict("App is already being deleted");
  row.status = "deleting";
  row.purgeAt = Math.floor(Date.now() / 1000) + SOFT_DELETE_WINDOW_MINUTES * 60;
  await storage.putApp(row);
  return toPublic(row);
}

/** Recover from soft delete (only inside the window — enforced by cron after it). */
export async function recover(storage: Storage, appId: string): Promise<PublicApp> {
  const row = await getApp(storage, appId);
  if (row.status !== "deleting") throw conflict("App is not in deleting state");
  row.status = "active";
  row.purgeAt = undefined;
  await storage.putApp(row);
  return toPublic(row);
}

/** Immediate purge: empty+drop every data table, then remove the registry row. */
export async function forceDelete(storage: Storage, appId: string): Promise<void> {
  const row = await getApp(storage, appId);
  for (const logical of row.tables) {
    await storage.dropTable(physicalName(appId, logical));
  }
  await storage.deleteAppRow(appId);
}

/** Cron/lazy purge: finalize all due soft deletions (bounded per run). */
export async function purgeDue(storage: Storage, nowSec: number, limit = 5): Promise<number> {
  const due = await storage.scanDeletingApps(nowSec, limit);
  for (const row of due) {
    try {
      await forceDelete(storage, row.appId);
    } catch (e) {
      console.error("purge failed for", row.appId, (e as Error).message);
    }
  }
  return due.length;
}

/** Physical DynamoDB table name for an app's logical table. */
export function physicalName(appId: string, logical: string): string {
  return `app_${appId}_${logical}`;
}