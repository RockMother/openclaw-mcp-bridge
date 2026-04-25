import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { BridgeConfig } from "./types.js";

export const serverNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "server names may only contain letters, numbers, underscores, and dashes");

export const authSchema = z.object({
  type: z.literal("bearer_env"),
  token_env: z.string().min(1),
});

export const baseServerSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(30_000),
});

export const stdioServerSchema = baseServerSchema.extend({
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const streamableHttpServerSchema = baseServerSchema.extend({
  transport: z.literal("streamable_http"),
  url: z.string().url(),
  auth: authSchema.optional(),
});

export const serverConfigSchema = z.discriminatedUnion("transport", [stdioServerSchema, streamableHttpServerSchema]);

export const bridgeConfigSchema = z.object({
  servers: z.record(serverNameSchema, serverConfigSchema),
});

export function parseBridgeConfig(value: unknown): BridgeConfig {
  return bridgeConfigSchema.parse(value) as BridgeConfig;
}

export function parseServerConfig(value: unknown) {
  return serverConfigSchema.parse(value);
}

export function stringifyBridgeConfig(config: BridgeConfig): string {
  return YAML.stringify(config);
}

export async function loadConfig(configPath = process.env.MCP_BRIDGE_CONFIG ?? "./servers.yaml"): Promise<BridgeConfig> {
  const resolvedPath = path.resolve(configPath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = YAML.parse(raw);
  return parseBridgeConfig(parsed);
}
