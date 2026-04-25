import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerConfig, ToolRef } from "./types.js";

type ConnectedServer = {
  name: string;
  config: ServerConfig;
  client?: Client;
  tools: ToolRef[];
  error?: string;
};

export class McpRegistry {
  private servers = new Map<string, ConnectedServer>();
  private tools = new Map<string, ToolRef>();

  constructor(private readonly config: Record<string, ServerConfig>) {}

  async connectAll(): Promise<void> {
    await Promise.all(
      Object.entries(this.config).map(async ([name, serverConfig]) => {
        if (!serverConfig.enabled) {
          this.servers.set(name, { name, config: serverConfig, tools: [] });
          return;
        }

        try {
          const client = new Client({ name: "openclaw-mcp-bridge", version: "0.1.0" });
          const transport = createTransport(serverConfig);
          await client.connect(transport);

          const response = await withTimeout(client.listTools(), serverConfig.timeoutMs, `tools/list timed out for ${name}`);
          const tools = response.tools.map((tool) => ({
            bridgeName: normalizeToolName(name, tool.name),
            serverName: name,
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          }));

          for (const tool of tools) {
            if (this.tools.has(tool.bridgeName)) {
              throw new Error(`duplicate normalized tool name: ${tool.bridgeName}`);
            }
            this.tools.set(tool.bridgeName, tool);
          }

          this.servers.set(name, { name, config: serverConfig, client, tools });
        } catch (error) {
          this.servers.set(name, { name, config: serverConfig, tools: [], error: getErrorMessage(error) });
        }
      }),
    );
  }

  listTools(): ToolRef[] {
    return Array.from(this.tools.values()).sort((a, b) => a.bridgeName.localeCompare(b.bridgeName));
  }

  listServers() {
    return Array.from(this.servers.values())
      .map((server) => ({
        name: server.name,
        transport: server.config.transport,
        enabled: server.config.enabled,
        connected: Boolean(server.client && !server.error),
        toolCount: server.tools.length,
        error: server.error,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async callTool(bridgeName: string, args: unknown): Promise<unknown> {
    const tool = this.tools.get(bridgeName);
    if (!tool) {
      throw new Error(`unknown tool: ${bridgeName}`);
    }

    const server = this.servers.get(tool.serverName);
    if (!server?.client) {
      throw new Error(`server is not connected: ${tool.serverName}`);
    }

    return withTimeout(
      server.client.callTool({ name: tool.toolName, arguments: args as Record<string, unknown> }),
      server.config.timeoutMs,
      `tools/call timed out for ${bridgeName}`,
    );
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.values()).map(async (server) => {
        await server.client?.close();
      }),
    );
  }
}

function createTransport(config: ServerConfig): StdioClientTransport | StreamableHTTPClientTransport {
  if (config.transport === "stdio") {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: mergeEnv(config.env),
    });
  }

  const headers: HeadersInit = {};
  if (config.auth?.type === "bearer_env") {
    const token = process.env[config.auth.token_env];
    if (!token) {
      throw new Error(`missing bearer token env var: ${config.auth.token_env}`);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  return new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers } });
}

function normalizeToolName(serverName: string, toolName: string): string {
  return `${serverName}_${toolName}`.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function mergeEnv(extraEnv: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...process.env, ...extraEnv }).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
