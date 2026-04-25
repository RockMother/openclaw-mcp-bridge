import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-mcp-bridge-"));
const configPath = path.join(tempDir, "servers.yaml");

await writeFile(configPath, "servers: {}\n", "utf8");

const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/src/mcpServer.js"],
  env: mergeEnv({ MCP_BRIDGE_CONFIG: configPath }),
});

const client = new Client({ name: "openclaw-mcp-bridge-admin-smoke", version: "0.1.0" });

try {
  await client.connect(transport);

  await client.callTool({
    name: "bridge_config_set",
    arguments: {
      name: "admin_echo",
      config: {
        transport: "stdio",
        command: "node",
        args: ["./dist/src/dev/echoMcpServer.js"],
        timeoutMs: 10000,
      },
    },
  });

  const toolsAfterSet = await client.listTools();
  if (!toolsAfterSet.tools.some((tool) => tool.name === "admin_echo_echo")) {
    throw new Error("admin_echo_echo was not exposed after bridge_config_set");
  }

  const callResult = await client.callTool({
    name: "admin_echo_echo",
    arguments: { message: "admin-hot-reload-ok" },
  });

  await client.callTool({ name: "bridge_config_remove", arguments: { name: "admin_echo" } });

  const toolsAfterRemove = await client.listTools();
  if (toolsAfterRemove.tools.some((tool) => tool.name === "admin_echo_echo")) {
    throw new Error("admin_echo_echo was still exposed after bridge_config_remove");
  }

  console.log(JSON.stringify({ toolsAfterSet: toolsAfterSet.tools.map((tool) => tool.name), callResult, toolsAfterRemove: toolsAfterRemove.tools.map((tool) => tool.name) }, null, 2));
} finally {
  await client.close();
  await rm(tempDir, { recursive: true, force: true });
}

function mergeEnv(extraEnv: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...process.env, ...extraEnv }).filter((entry): entry is [string, string] => Boolean(entry[1])));
}
