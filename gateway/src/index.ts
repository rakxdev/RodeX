/**
 * index.ts — entry point. v1 scaffolding: health + cron hook only;
 * routes are added as tasks progress (T5–T7).
 */
import { Hono } from "hono";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.get("/v1/health", (c) => c.json({ ok: true, service: "rodex-gateway", version: 1 }));

export default {
  fetch: app.fetch,
  async scheduled(_ctrl: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // purge task wired in T4
    console.log("rodex purge tick", new Date().toISOString());
  },
} satisfies ExportedHandler<Env>;