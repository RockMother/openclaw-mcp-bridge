import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/src/mcpServer.js"],
  env: mergeEnv({ MCP_BRIDGE_CONFIG: "./servers.example.yaml" }),
});

const client = new Client({ name: "openclaw-mcp-bridge-smoke", version: "0.1.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const callResult = await client.callTool({ name: "echo.echo", arguments: { message: "native-mcp-ok" } });
  console.log(JSON.stringify({ tools: tools.tools, callResult }, null, 2));
} finally {
  await client.close();
}

function mergeEnv(extraEnv: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...process.env, ...extraEnv }).filter((entry): entry is [string, string] => Boolean(entry[1])));
}
