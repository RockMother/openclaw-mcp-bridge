---
name: openclaw-mcp-bridge
description: Manage MCP servers through openclaw-mcp-bridge. Use when the user wants to inspect bridge status, add or remove backend MCP servers, reload the bridge registry, or call tools exposed through the bridge.
---

# OpenClaw MCP Bridge Operator

Use this skill when working with `openclaw-mcp-bridge`, an MCP aggregator registered in OpenClaw as the `bridge` MCP server.

## Tool Naming

Backend MCP tools are exposed with normalized names:

```text
serverName_toolName
```

Examples:

- `files_list_directory`
- `files_read_file`
- `github_search_repositories`

OpenClaw accepts only letters, numbers, underscores, and dashes in MCP tool names.

## Standard Workflow

1. Call `bridge_config_list` to inspect configured backend MCP servers and connection status.
2. If adding or replacing a server, call `bridge_config_set`.
3. After changes, call `bridge_config_reload` unless `bridge_config_set` already reloaded.
4. Confirm the new tools by checking for the expected `serverName_` prefix.
5. Use the normalized tool names to perform the user's requested task.

## Admin Tools

- `bridge_config_list`: list configured backend MCP servers and live status.
- `bridge_config_get`: inspect one backend MCP server definition.
- `bridge_config_set`: add or replace one backend MCP server definition in `servers.yaml`.
- `bridge_config_remove`: remove one backend MCP server definition.
- `bridge_config_reload`: reread `servers.yaml` and rebuild the live registry.

## Add Filesystem Access

Use this pattern when the user wants OpenClaw to access a folder:

```json
{
  "name": "files",
  "config": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/ks/automation"],
    "timeoutMs": 10000
  }
}
```

Then verify with `files_list_directory`.

## Add Remote MCP Server

For remote streamable HTTP MCP servers:

```json
{
  "name": "remote_docs",
  "config": {
    "transport": "streamable_http",
    "url": "https://example.com/mcp",
    "auth": {
      "type": "bearer_env",
      "token_env": "REMOTE_DOCS_MCP_TOKEN"
    },
    "timeoutMs": 30000
  }
}
```

Use env vars for secrets. Do not store raw tokens in `servers.yaml`.

## Safety

Treat `stdio` server configuration as a trusted admin operation. A stdio MCP server is a command the bridge will launch on the host.

Before adding a new stdio server:

- Confirm the user trusts the package/command.
- Prefer specific folders over broad filesystem access.
- Prefer env var references over inline secrets.
- Explain that newly exposed write/action tools may affect the host or external services.

## Troubleshooting

- If a backend server is present but tools are missing, call `bridge_config_list` and check `connected`, `toolCount`, and `error`.
- If tools were just changed but OpenClaw does not see them, call `bridge_config_reload`. If still missing, start a new OpenClaw session because some runtimes cache tool lists.
- If a tool name with dots fails, use the normalized underscore name.
