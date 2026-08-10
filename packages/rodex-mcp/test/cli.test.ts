/**
 * CLI tests — spawn the built binary against a local stub MCP server and
 * drive real JSON-RPC over stdio (the way Claude Desktop / VS Code would).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

let server: Server;
let endpoint = "";
let lastAuth: string | undefined;
let toolsSeen = 0;

function sse(data: unknown): string {
  return `event: message\ndata: ${JSON.stringify(data)}\n\n`;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastAuth = req.headers["authorization"];
      const msg = JSON.parse(raw) as { id?: number; method?: string; params?: { name?: string } };
      if (msg.method === "initialize") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end(sse({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "rodexdb", version: "1.0.0" } } }));
        return;
      }
      if (msg.method === "tools/list") {
        toolsSeen++;
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end(sse({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "list_apps", description: "lists apps" }] } }));
        return;
      }
      if (msg.method === "notifications/initialized") {
        res.writeHead(202); // notifications → 202, no body
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(sse({ jsonrpc: "2.0", id: msg.id, result: { ok: true, name: msg.params?.name } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function runCli(args: string[], input: string[], env: Record<string, string> = {}): Promise<{ stdout: string[]; stderr: string; code: number | null }> {
  const child: ChildProcess = spawn(process.execPath, [new URL("../dist/esm/cli.js", import.meta.url).pathname, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  const lines: string[] = [];
  child.stdout?.on("data", (c) => lines.push(...c.toString().split("\n")));
  let stderr = "";
  child.stderr?.on("data", (c) => (stderr += c.toString()));
  for (const line of input) child.stdin?.write(`${line}\n`);
  child.stdin?.end();
  await once(child, "close");
  return { stdout: lines, stderr, code: child.exitCode };
}

describe("rodex-mcp CLI", () => {
  it("requires a key (flag or env)", async () => {
    const missing = await runCli([], ["{}"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("master key is required");

    const viaEnv = await runCli(["--url", endpoint], ['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'], { RODEX_MCP_KEY: "rok_mcp_env" });
    expect(viaEnv.code).toBe(0);
  });

  it("relays initialize + tools/list and sends the Bearer key", async () => {
    const out = await runCli(["--url", endpoint, "--key", "rok_mcp_test"], [
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}',
      '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}',
      '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}',
    ]);
    expect(lastAuth).toBe("Bearer rok_mcp_test");
    const parsed = out.stdout.filter(Boolean).map((l) => JSON.parse(l) as { id?: number; result?: { serverInfo?: { name: string } } | { tools?: unknown[] } });
    const init = parsed.find((m) => m.id === 1);
    expect((init?.result as { serverInfo?: { name: string } }).serverInfo?.name).toBe("rodexdb");
    const list = parsed.find((m) => m.id === 2);
    expect((list?.result as { tools?: unknown[] }).tools).toHaveLength(1);
    expect(toolsSeen).toBeGreaterThan(0);
  });

  it("relays tool calls", async () => {
    const out = await runCli(["--url", endpoint, "--key", "rok_mcp_test"], [
      '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_apps","arguments":{}}}',
    ]);
    const call = out.stdout.filter(Boolean).map((l) => JSON.parse(l) as { id?: number; result?: { ok?: boolean } }).find((m) => m.id === 3);
    expect(call?.result).toMatchObject({ ok: true });
  });

  it("--help prints usage and exits cleanly", async () => {
    const out = await runCli(["--help"], []);
    expect(out.stdout.join("")).toContain("Usage:");
    expect(out.code).toBe(0);
  });
});
