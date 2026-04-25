# OpenClaw MCP Bridge

`openclaw-mcp-bridge` is a small service that aggregates local and remote MCP servers behind one stable interface for OpenClaw.

OpenClaw 2026.3.23 has native outbound MCP server definitions, so the primary integration path is the stdio MCP server entrypoint:

- `npm run mcp` exposes one aggregated MCP server for OpenClaw.
- Tool names are normalized as `serverName.toolName`.
- The HTTP server remains useful for diagnostics and fallback integrations.

OpenClaw's `mcp set/list/show/unset` commands manage saved config only. They do not start the MCP server or prove it is reachable at registration time.

Diagnostic HTTP endpoints:

- `GET /healthz` checks that the bridge is alive.
- `GET /servers` returns configured MCP server status.
- `GET /tools` returns normalized tools as `serverName.toolName`.
- `POST /tools/call` calls a normalized tool with JSON arguments.

## Development

```bash
npm install
cp servers.example.yaml servers.yaml
npm run build
npm run smoke
npm run smoke:mcp
MCP_BRIDGE_CONFIG=./servers.yaml npm run smoke:mcp
MCP_BRIDGE_CONFIG=./servers.yaml npm run dev
```

## Configuration

Create `servers.yaml` from `servers.example.yaml`.

```yaml
servers:
  local_files:
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/srv/automation"]
    timeoutMs: 10000

  remote_example:
    transport: streamable_http
    url: https://example.com/mcp
    auth:
      type: bearer_env
      token_env: EXAMPLE_MCP_TOKEN
```

Tokens should live in environment variables or a systemd env file, not in `servers.yaml`.

## OpenClaw Outbound MCP Registry

Build the bridge and save it into OpenClaw's outbound MCP registry:

```bash
npm run build
openclaw mcp set bridge '{"command":"node","args":["/opt/openclaw-mcp-bridge/dist/src/mcpServer.js"],"env":{"MCP_BRIDGE_CONFIG":"/etc/openclaw-mcp-bridge/servers.yaml"}}'
openclaw mcp list
```

This stores the definition under OpenClaw config. A runtime that consumes OpenClaw-managed MCP definitions will launch the bridge later. In OpenClaw's current docs, embedded Pi exposes configured MCP tools in normal `coding` and `messaging` tool profiles; `minimal` hides them, and `tools.deny: ["bundle-mcp"]` disables them explicitly.

Do not confuse this with `openclaw mcp serve`: that command is the opposite direction, where OpenClaw itself acts as an MCP server for external clients.

## HTTP Tool Call

```bash
curl -s http://127.0.0.1:8787/tools

curl -s http://127.0.0.1:8787/tools/call \
  -H 'content-type: application/json' \
  -d '{"tool":"local_files.list_directory","arguments":{"path":"/srv/automation"}}'
```

## OpenClaw Integration Phases

1. Register this bridge with `openclaw mcp set bridge ...`.
2. Confirm the OpenClaw runtime profile that should consume configured MCP servers is `coding` or `messaging`, not `minimal`.
3. Ask OpenClaw to use the test `echo.echo` tool through that runtime.
4. If the runtime cannot consume the saved MCP registry yet, use the HTTP fallback path with a custom `mcp_call` tool.
5. Start with safe read-only tools, then add write/action tools behind explicit confirmation.
