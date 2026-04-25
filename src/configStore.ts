import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { parseBridgeConfig, parseServerConfig, stringifyBridgeConfig } from "./config.js";
import type { BridgeConfig, ServerConfig } from "./types.js";

export function resolveConfigPath(configPath = process.env.MCP_BRIDGE_CONFIG ?? "./servers.yaml"): string {
  return path.resolve(configPath);
}

export async function loadConfigFromPath(configPath = resolveConfigPath()): Promise<BridgeConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = YAML.parse(raw);
  return parseBridgeConfig(parsed);
}

export async function saveConfigAtomic(config: BridgeConfig, configPath = resolveConfigPath()): Promise<void> {
  const validated = parseBridgeConfig(config);
  const directory = path.dirname(configPath);
  const temporaryPath = path.join(directory, `.servers.${process.pid}.${Date.now()}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, stringifyBridgeConfig(validated), "utf8");
  await rename(temporaryPath, configPath);
}

export async function setServerConfig(name: string, serverConfig: unknown, configPath = resolveConfigPath()): Promise<BridgeConfig> {
  const config = await loadConfigFromPath(configPath);
  const nextConfig: BridgeConfig = {
    servers: {
      ...config.servers,
      [name]: parseServerConfig(serverConfig) as ServerConfig,
    },
  };

  await saveConfigAtomic(nextConfig, configPath);
  return nextConfig;
}

export async function removeServerConfig(name: string, configPath = resolveConfigPath()): Promise<BridgeConfig> {
  const config = await loadConfigFromPath(configPath);
  const nextServers = { ...config.servers };
  delete nextServers[name];

  const nextConfig = parseBridgeConfig({ servers: nextServers });
  await saveConfigAtomic(nextConfig, configPath);
  return nextConfig;
}
