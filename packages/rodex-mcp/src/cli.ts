#!/usr/bin/env node
/**
 * rodex-mcp — RodexDB as a stdio MCP server.
 *
 * Bridges any local MCP client (Claude Desktop, VS Code, local agents) to a
 * remote RodexDB gateway over Streamable HTTP. The URL is always YOURS:
 * pass --url (your own deploy) or default to the live instance; the master
 * key comes from --key or the RODEX_MCP_KEY env var.
 *
 * Usage:
 *   rodex-mcp --key $RODEX_MCP_KEY
 *   rodex-mcp --url https://my-own.workers.dev/mcp --key rok_mcp_...
 *
 * In an MCP client config:
 *   { "mcpServers": { "rodex": { "command": "npx", "args": ["-y", "rodex-mcp", "--key", "..." ] } } }
 */
import { createInterface } from "node:readline";

const DEFAULT_URL = "https://rodex-gateway.rakxdev.workers.dev/mcp";
const REQUEST_TIMEOUT_MS = 60_000;

function usage(): void {
  process.stdout.write(
    [
      "rodex-mcp — RodexDB stdio MCP bridge",
      "",
      "Usage:",
      "  rodex-mcp [--url <mcp-endpoint>] [--key <master-key>]",
      "",
      "Options:",
      "  --url   Remote MCP endpoint (default: the live RodexDB instance)",
      "  --key   Master key (rok_mcp_...) — or set RODEX_MCP_KEY",
      "  --help  Show this help",
      "",
    ].join("\n"),
  );
}

interface JsonRpc {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: unknown;
  params?: unknown;
}

/** Parse a Streamable-HTTP response body (JSON or SSE) into JSON-RPC messages. */
function parseResponse(ct: string | null, text: string): JsonRpc[] {
  if (ct && ct.includes("text/event-stream")) {
    const out: JsonRpc[] = [];
    for (const block of text.split("\n\n")) {
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (data) {
        try {
          out.push(JSON.parse(data) as JsonRpc);
        } catch {
          /* keep-alive or malformed events are ignored */
        }
      }
    }
    return out;
  }
  try {
    return [JSON.parse(text) as JsonRpc];
  } catch {
    return [];
  }
}

async function forward(url: string, key: string, message: JsonRpc): Promise<JsonRpc[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    const text = await res.text();
    const messages = parseResponse(res.headers.get("content-type") ?? "", text);
    if (messages.length > 0) return messages;
    if (!res.ok) {
      return [
        {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32001, message: `RodexDB gateway responded HTTP ${res.status}: ${text.slice(0, 200)}` },
        },
      ];
    }
    return []; // 202 for notifications — nothing to relay
  } catch (e) {
    return [
      {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: `rodex-mcp: ${(e as Error).message}` },
      },
    ];
  } finally {
    clearTimeout(timer);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  let url = DEFAULT_URL;
  let key = process.env.RODEX_MCP_KEY ?? "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") return usage();
    if (args[i] === "--url" && args[i + 1]) url = args[++i];
    else if (args[i] === "--key" && args[i + 1]) key = args[++i];
  }

  if (!key) {
    process.stderr.write("rodex-mcp: a master key is required — pass --key <rok_mcp_...> or set RODEX_MCP_KEY\n");
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: JsonRpc;
    try {
      message = JSON.parse(trimmed) as JsonRpc;
    } catch {
      return; // not JSON-RPC — ignore
    }
    const task = forward(url, key, message).then((responses) => {
      for (const r of responses) {
        if (r.id !== undefined) process.stdout.write(`${JSON.stringify(r)}\n`);
      }
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });

  // never exit while forwards are still in flight (stdin may close first)
  rl.on("close", async () => {
    if (pending.size > 0) await Promise.allSettled([...pending]);
    process.exit(0);
  });
}

main();
