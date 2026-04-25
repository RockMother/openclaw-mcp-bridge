export type ServerTransport = "stdio" | "streamable_http";

export type BearerEnvAuth = {
  type: "bearer_env";
  token_env: string;
};

export type BaseServerConfig = {
  enabled: boolean;
  timeoutMs: number;
};

export type StdioServerConfig = BaseServerConfig & {
  transport: "stdio";
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type StreamableHttpServerConfig = BaseServerConfig & {
  transport: "streamable_http";
  url: string;
  auth?: BearerEnvAuth;
};

export type ServerConfig = StdioServerConfig | StreamableHttpServerConfig;

export type BridgeConfig = {
  servers: Record<string, ServerConfig>;
};

export type ToolRef = {
  bridgeName: string;
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema?: unknown;
};

export type ServerStatus = {
  name: string;
  transport: ServerTransport;
  enabled: boolean;
  connected: boolean;
  toolCount: number;
  error?: string;
};
