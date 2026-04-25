import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { serverNameSchema } from "./config.js";
import { loadConfigFromPath, removeServerConfig, resolveConfigPath, setServerConfig } from "./configStore.js";
import { McpRegistry } from "./mcpClient.js";
import type { BridgeConfig, ServerConfig } from "./types.js";

type RuntimeState = {
  registry: McpRegistry;
  config: BridgeConfig;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
};

const adminTools = [
  {
    name: "bridge_config_list",
    description: "List configured backend MCP servers for this bridge.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "bridge_config_get",
    description: "Get one backend MCP server definition by name.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "bridge_config_set",
    description: "Add or replace one backend MCP server definition in servers.yaml.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        config: { type: "object" },
        reload: { type: "boolean", default: true },
      },
      required: ["name", "config"],
      additionalProperties: false,
    },
  },
  {
    name: "bridge_config_remove",
    description: "Remove one backend MCP server definition from servers.yaml.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        reload: { type: "boolean", default: true },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "bridge_config_reload",
    description: "Reload servers.yaml and rebuild the backend MCP registry.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] satisfies ToolDefinition[];

const adminToolNames = new Set(adminTools.map((tool) => tool.name));

const getConfigInputSchema = z.object({
  name: serverNameSchema,
});

const setConfigInputSchema = z.object({
  name: serverNameSchema,
  config: z.unknown(),
  reload: z.boolean().default(true),
});

const removeConfigInputSchema = z.object({
  name: serverNameSchema,
  reload: z.boolean().default(true),
});

async function main(): Promise<void> {
  const configPath = resolveConfigPath();
  let state = await createRuntimeState(configPath);

  const server = new Server(
    { name: "openclaw-mcp-bridge", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
      },
      instructions: "Aggregates configured MCP servers and exposes their tools as serverName_toolName.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...adminTools,
      ...state.registry
        .listTools()
        .filter((tool) => !adminToolNames.has(tool.bridgeName))
        .map((tool) => ({
          name: tool.bridgeName,
          description: tool.description,
          inputSchema: asToolInputSchema(tool.inputSchema),
        })),
    ],
  }));

  async function reloadRegistry(): Promise<RuntimeState> {
    const nextState = await createRuntimeState(configPath);
    const previousRegistry = state.registry;
    state = nextState;
    await previousRegistry.closeAll();
    await server.sendToolListChanged();
    return state;
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments ?? {};
    const result = adminToolNames.has(toolName)
      ? await callAdminTool(toolName, args, {
          configPath,
          getState: () => state,
          reloadRegistry,
        })
      : await state.registry.callTool(toolName, args);

    return asCallToolResult(result);
  });

  process.once("SIGINT", () => void shutdown(server, state.registry));
  process.once("SIGTERM", () => void shutdown(server, state.registry));

  await server.connect(new StdioServerTransport());
}

async function createRuntimeState(configPath: string): Promise<RuntimeState> {
  const config = await loadConfigFromPath(configPath);
  const registry = new McpRegistry(config.servers);
  await registry.connectAll();
  return { config, registry };
}

async function callAdminTool(
  toolName: string,
  args: unknown,
  context: {
    configPath: string;
    getState: () => RuntimeState;
    reloadRegistry: () => Promise<RuntimeState>;
  },
): Promise<unknown> {
  switch (toolName) {
    case "bridge_config_list":
      return {
        configPath: context.configPath,
        servers: redactConfig(context.getState().config).servers,
        status: context.getState().registry.listServers(),
      };

    case "bridge_config_get": {
      const input = getConfigInputSchema.parse(args);
      const serverConfig = context.getState().config.servers[input.name];
      if (!serverConfig) {
        throw new Error(`unknown server config: ${input.name}`);
      }

      return { name: input.name, config: redactServerConfig(serverConfig), status: context.getState().registry.listServers().find((server) => server.name === input.name) };
    }

    case "bridge_config_set": {
      const input = setConfigInputSchema.parse(args);
      const config = await setServerConfig(input.name, input.config, context.configPath);
      const state = input.reload ? await context.reloadRegistry() : context.getState();
      return {
        saved: true,
        reloaded: input.reload,
        config: redactConfig(config),
        status: state.registry.listServers(),
        tools: state.registry.listTools().map((tool) => tool.bridgeName),
      };
    }

    case "bridge_config_remove": {
      const input = removeConfigInputSchema.parse(args);
      const config = await removeServerConfig(input.name, context.configPath);
      const state = input.reload ? await context.reloadRegistry() : context.getState();
      return {
        removed: input.name,
        reloaded: input.reload,
        config: redactConfig(config),
        status: state.registry.listServers(),
        tools: state.registry.listTools().map((tool) => tool.bridgeName),
      };
    }

    case "bridge_config_reload": {
      const state = await context.reloadRegistry();
      return {
        reloaded: true,
        config: redactConfig(state.config),
        status: state.registry.listServers(),
        tools: state.registry.listTools().map((tool) => tool.bridgeName),
      };
    }

    default:
      throw new Error(`unknown admin tool: ${toolName}`);
  }
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

function redactConfig(config: BridgeConfig): BridgeConfig {
  return {
    servers: Object.fromEntries(Object.entries(config.servers).map(([name, serverConfig]) => [name, redactServerConfig(serverConfig)])),
  };
}

function redactServerConfig(config: ServerConfig): ServerConfig {
  if (config.transport === "stdio") {
    return {
      ...config,
      env: config.env ? Object.fromEntries(Object.keys(config.env).map((key) => [key, "<redacted>"])) : undefined,
    };
  }

  return config;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
