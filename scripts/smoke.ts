import { loadConfig } from "../src/config.js";
import { McpRegistry } from "../src/mcpClient.js";

const config = await loadConfig(process.argv[2] ?? "./servers.example.yaml");
const registry = new McpRegistry(config.servers);

try {
  await registry.connectAll();
  const callResult = await registry.callTool("echo.echo", { message: "smoke-ok" });
  console.log(JSON.stringify({ servers: registry.listServers(), tools: registry.listTools(), callResult }, null, 2));
} finally {
  await registry.closeAll();
}
