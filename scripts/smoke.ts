import { loadConfig } from "../src/config.js";
import { McpRegistry } from "../src/mcpClient.js";

const config = await loadConfig(process.argv[2] ?? "./servers.example.yaml");
const registry = new McpRegistry(config.servers);
const smokeTool = process.env.MCP_BRIDGE_SMOKE_TOOL ?? "echo.echo";

try {
  await registry.connectAll();
  const tools = registry.listTools();
  const hasSmokeTool = tools.some((tool) => tool.bridgeName === smokeTool);
  const callResult = hasSmokeTool
    ? await registry.callTool(smokeTool, { message: "smoke-ok" })
    : { skipped: true, reason: `smoke tool not found: ${smokeTool}` };
  console.log(JSON.stringify({ servers: registry.listServers(), tools, callResult }, null, 2));
} finally {
  await registry.closeAll();
}
