import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { BridgeConfig } from "./types.js";

const serverNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "server names may only contain letters, numbers, underscores, and dashes");

const authSchema = z.object({
  type: z.literal("bearer_env"),
  token_env: z.string().min(1),
});

const baseServerSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(30_000),
});

const stdioServerSchema = baseServerSchema.extend({
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const streamableHttpServerSchema = baseServerSchema.extend({
  transport: z.literal("streamable_http"),
  url: z.string().url(),
  auth: authSchema.optional(),
});

const bridgeConfigSchema = z.object({
  servers: z.record(serverNameSchema, z.discriminatedUnion("transport", [stdioServerSchema, streamableHttpServerSchema])),
});

export async function loadConfig(configPath = process.env.MCP_BRIDGE_CONFIG ?? "./servers.yaml"): Promise<BridgeConfig> {
  const resolvedPath = path.resolve(configPath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = YAML.parse(raw);
  return bridgeConfigSchema.parse(parsed) as BridgeConfig;
}
