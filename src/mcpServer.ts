import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { McpRegistry } from "./mcpClient.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const registry = new McpRegistry(config.servers);
  await registry.connectAll();

  const server = new Server(
    { name: "openclaw-mcp-bridge", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
      },
      instructions: "Aggregates configured MCP servers and exposes their tools as serverName.toolName.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.listTools().map((tool) => ({
      name: tool.bridgeName,
      description: tool.description,
      inputSchema: asToolInputSchema(tool.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await registry.callTool(request.params.name, request.params.arguments ?? {});
    return asCallToolResult(result);
  });

  process.once("SIGINT", () => void shutdown(server, registry));
  process.once("SIGTERM", () => void shutdown(server, registry));

  await server.connect(new StdioServerTransport());
}

async function shutdown(server: Server, registry: McpRegistry): Promise<void> {
  await registry.closeAll();
  await server.close();
}

function asToolInputSchema(inputSchema: unknown): { type: "object"; [key: string]: unknown } {
  if (isObject(inputSchema) && inputSchema.type === "object") {
    return inputSchema as { type: "object"; [key: string]: unknown };
  }

  return { type: "object", properties: {} };
}

function asCallToolResult(result: unknown): CallToolResult {
  if (isObject(result) && Array.isArray(result.content)) {
    return result as CallToolResult;
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
