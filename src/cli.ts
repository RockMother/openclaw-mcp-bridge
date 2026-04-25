#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { saveConfigAtomic } from "./configStore.js";
import type { BridgeConfig } from "./types.js";

type SetupOptions = {
  projectDir: string;
  configPath: string;
  automationDir: string;
  serverName: string;
  skipBuild: boolean;
  skipSmoke: boolean;
};

const command = process.argv[2];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (command !== "setup") {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const options = await parseSetupOptions(process.argv.slice(3));
await runSetup(options);

async function parseSetupOptions(args: string[]): Promise<SetupOptions> {
  const projectDir = await findProjectRoot();
  const home = process.env.HOME;
  if (!home) {
    throw new Error("HOME is not set");
  }

  const options: SetupOptions = {
    projectDir,
    configPath: join(projectDir, "servers.yaml"),
    automationDir: join(home, "automation"),
    serverName: "bridge",
    skipBuild: false,
    skipSmoke: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    switch (arg) {
      case "--config":
        options.configPath = requireValue(arg, next);
        index += 1;
        break;
      case "--automation-dir":
        options.automationDir = requireValue(arg, next);
        index += 1;
        break;
      case "--server-name":
        options.serverName = requireValue(arg, next);
        index += 1;
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      case "--skip-smoke":
        options.skipSmoke = true;
        break;
      default:
        throw new Error(`Unknown setup option: ${arg}`);
    }
  }

  options.configPath = resolve(options.configPath);
  options.automationDir = resolve(options.automationDir);
  return options;
}

async function runSetup(options: SetupOptions): Promise<void> {
  const mcpServerPath = join(options.projectDir, "dist", "src", "mcpServer.js");

  console.log("Setting up OpenClaw MCP Bridge");
  console.log(`Project: ${options.projectDir}`);
  console.log(`Config: ${options.configPath}`);
  console.log(`Automation directory: ${options.automationDir}`);

  await run("openclaw", ["--help"], { cwd: options.projectDir, quiet: true });
  await mkdir(options.automationDir, { recursive: true });

  const config: BridgeConfig = {
    servers: {
      files: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", options.automationDir],
        timeoutMs: 10000,
        enabled: true,
      },
    },
  };

  await saveConfigAtomic(config, options.configPath);
  console.log("Wrote servers.yaml");

  if (!options.skipBuild) {
    await run("npm", ["install"], { cwd: options.projectDir });
    await run("npm", ["run", "build"], { cwd: options.projectDir });
  } else {
    await access(mcpServerPath, constants.R_OK);
  }

  const openclawValue = JSON.stringify({
    command: "node",
    args: [mcpServerPath],
    env: {
      MCP_BRIDGE_CONFIG: options.configPath,
    },
  });

  await run("openclaw", ["mcp", "set", options.serverName, openclawValue], { cwd: options.projectDir });

  if (!options.skipSmoke) {
    await run("npm", ["run", "smoke:mcp"], {
      cwd: options.projectDir,
      env: {
        MCP_BRIDGE_CONFIG: options.configPath,
      },
    });
  }

  console.log("");
  console.log("Setup complete.");
  console.log(`Registered OpenClaw MCP server: ${options.serverName}`);
  console.log("Ask OpenClaw:");
  console.log(`Какие MCP tools тебе доступны с префиксом files_? Если видишь их, вызови files_list_directory для ${options.automationDir}.`);
}

async function findProjectRoot(): Promise<string> {
  let current = dirname(fileURLToPath(import.meta.url));

  for (let index = 0; index < 5; index += 1) {
    const packageJsonPath = join(current, "package.json");
    try {
      await access(packageJsonPath, constants.R_OK);
      return current;
    } catch {
      current = dirname(current);
    }
  }

  throw new Error("Could not find package.json");
}

async function run(
  commandName: string,
  args: string[],
  options: { cwd: string; env?: Record<string, string>; quiet?: boolean },
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(commandName, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: options.quiet ? "ignore" : "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${commandName} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function requireValue(option: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage:
  openclaw-mcp-bridge setup [options]
  npm run setup -- [options]

Options:
  --config <path>          Path to servers.yaml. Default: ./servers.yaml
  --automation-dir <path>  Filesystem MCP root. Default: ~/automation
  --server-name <name>     OpenClaw MCP registry name. Default: bridge
  --skip-build             Do not run npm install/build
  --skip-smoke             Do not run smoke:mcp after registration
`);
}
