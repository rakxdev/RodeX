/**
 * sdk-bot.mjs — a minimal RodexDB bot using the official SDK.
 *
 * Run with YOUR OWN credentials (any RodexDB deployment):
 *
 *   RODEX_URL=https://your-name.workers.dev \
 *   RODEX_APP_ID=app_xxxx \
 *   RODEX_API_KEY=rok_... \
 *   node sdk-bot.mjs
 *
 * The SDK is URL-agnostic: the URL, app id and key always come from you.
 */
import { RodexDB, RodexError } from "rodexdb";

const url = process.env.RODEX_URL ?? "https://rodex-gateway.rakxdev.workers.dev";
const appId = process.env.RODEX_APP_ID;
const apiKey = process.env.RODEX_API_KEY;

if (!appId || !apiKey) {
  console.error("Set RODEX_APP_ID and RODEX_API_KEY first.");
  process.exit(1);
}

const db = new RodexDB({ url, appId, apiKey });

async function main() {
  // 1. ensure a table
  try {
    await db.createTable("visitors");
    console.log("✓ table ready: visitors");
  } catch (e) {
    if (e instanceof RodexError && e.status === 409) console.log("✓ table exists");
    else throw e;
  }

  // 2. write an item (idempotent retry via requestId)
  await db.put("visitors", { pk: "visit-1", ip: "203.0.113.7", page: "/home" }, { requestId: "job-1" });
  console.log("✓ wrote visit-1");

  // 3. read it back
  const row = await db.get("visitors", "visit-1");
  console.log("✓ read back:", row?.data, "version", row?.version);

  // 4. update (version-guarded — a 409 means someone else changed it)
  try {
    await db.update("visitors", "visit-1", "~", { ip: "203.0.113.7", page: "/docs", hits: 2 }, row?.version);
    console.log("✓ updated to version 2");
  } catch (e) {
    if (e instanceof RodexError && e.status === 409) console.log("⚠ conflict — someone else wrote; re-read and retry");
    else throw e;
  }

  // 5. query
  const page = await db.query("visitors", "visit-1");
  console.log("✓ query items:", page.items.length, "has_more:", page.has_more);

  console.log("Done. Your bot is talking to", url);
}

main().catch((e) => {
  console.error("✗ failed:", e instanceof RodexError ? `${e.status}: ${e.message}` : e.message);
  process.exit(1);
});
