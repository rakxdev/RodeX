# rodex-mcp

RodexDB as a **stdio MCP server** — connect ANY local MCP client (Claude
Desktop, VS Code, local agents) to a RodexDB gateway. The endpoint URL is
always yours: point it at your own deploy, or default to the live instance.

## Install / run

```bash
# with the live instance (get a master key from the console MCP page):
npx -y rodex-mcp --key $RODEX_MCP_KEY

# with YOUR OWN deployment:
npx -y rodex-mcp --url https://my-own.workers.dev/mcp --key $RODEX_MCP_KEY
```

The key is required — via `--key` or the `RODEX_MCP_KEY` env var.

## MCP client config

```json
{
  "mcpServers": {
    "rodexdb": {
      "command": "npx",
      "args": ["-y", "rodex-mcp", "--key", "your-rok_mcp-key"]
    }
  }
}
```

That gives the agent the full RodexDB tool surface (list_apps, get_item,
query, put_item, …) with the server-side confirmation gate intact.

## What it is

A ~150-line bridge: reads JSON-RPC from stdin, forwards it to the remote
Streamable-HTTP endpoint with your Bearer key, and relays responses back.
No sessions, no state, no dependencies.

## License

Free for personal and educational use — commercial use strictly forbidden.
See the [RodexDB license](https://github.com/rakxdev/RodeX/blob/main/LICENSE).
