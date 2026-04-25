import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const configPath = process.env.MCP_BRIDGE_CONFIG ?? "./servers.example.yaml";
const smokeTool = process.env.MCP_BRIDGE_SMOKE_TOOL ?? "echo_echo";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/src/mcpServer.js"],
  env: mergeEnv({ MCP_BRIDGE_CONFIG: configPath }),
});

const client = new Client({ name: "openclaw-mcp-bridge-smoke", version: "0.1.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const adminResult = await client.callTool({ name: "bridge_config_list", arguments: {} });
  const hasSmokeTool = tools.tools.some((tool) => tool.name === smokeTool);
  const callResult = hasSmokeTool
    ? await client.callTool({ name: smokeTool, arguments: { message: "native-mcp-ok" } })
    : { skipped: true, reason: `smoke tool not found: ${smokeTool}` };
  console.log(JSON.stringify({ tools: tools.tools, adminResult, callResult }, null, 2));
} finally {
  await client.close();
}

function mergeEnv(extraEnv: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...process.env, ...extraEnv }).filter((entry): entry is [string, string] => Boolean(entry[1])));
}
