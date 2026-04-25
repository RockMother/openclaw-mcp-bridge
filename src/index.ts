import { loadConfig } from "./config.js";
import { startHttpServer } from "./httpServer.js";
import { McpRegistry } from "./mcpClient.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const registry = new McpRegistry(config.servers);
  await registry.connectAll();

  const connected = registry.listServers().filter((server) => server.connected).length;
  console.log(`loaded ${registry.listTools().length} tools from ${connected} connected MCP servers`);

  startHttpServer(registry);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
