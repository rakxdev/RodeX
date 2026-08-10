# rodexdb

Official TypeScript client for [RodexDB](https://github.com/rakxdev/RodeX) —
per-app keys & tables on DynamoDB through one clean API.

Thin, **zero-dependency**, and **URL-agnostic**: point it at *any* RodexDB
gateway — your own deploy, or the live instance — and hand it an app id and
key. It speaks the documented REST contract; nothing more.

## Install

```bash
npm install rodexdb
```

## Usage

```ts
import { RodexDB } from "rodexdb";

const db = new RodexDB({
  url: "https://my-own-name.workers.dev", // ← your gateway URL (or the live instance)
  appId: "app_xxxx",
  apiKey: "rok_...",
});

// tables
await db.createTable("users");
const tables = await db.listTables();

// items
await db.put("users", { pk: "u1", name: "Ada", role: "admin" });
const user = await db.get("users", "u1");           // null when missing
await db.update("users", "u1", "~", { name: "Grace" }, 1); // version-guarded
await db.delete("users", "u1", "~");

// query (pk + optional sk prefix, pagination)
const page = await db.query("users", "u1", { limit: 10 });

// idempotent retries
await db.put("users", { pk: "u2", name: "Lin" }, { requestId: "job-42" });
```

## Errors

Every failure throws `RodexError` with `status` and `code`
(`429` = rate limit, `409` = version conflict, `413` = item too large, …).

## License

Free for personal and educational use — commercial use strictly forbidden.
See the [RodexDB license](https://github.com/rakxdev/RodeX/blob/main/LICENSE).
