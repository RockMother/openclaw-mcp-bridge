import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { McpRegistry } from "./mcpClient.js";

type JsonBody = Record<string, unknown>;

export function startHttpServer(registry: McpRegistry, port = Number(process.env.PORT ?? 8787)) {
  const server = createServer(async (req, res) => {
    const correlationId = req.headers["x-correlation-id"]?.toString() ?? randomUUID();
    res.setHeader("x-correlation-id", correlationId);

    try {
      await routeRequest(registry, req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(res, 500, { error: message, correlationId });
    }
  });

  server.listen(port, () => {
    console.log(`openclaw-mcp-bridge listening on http://127.0.0.1:${port}`);
  });

  return server;
}

async function routeRequest(registry: McpRegistry, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/healthz") {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/servers") {
    writeJson(res, 200, { servers: registry.listServers() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/tools") {
    writeJson(res, 200, { tools: registry.listTools() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/tools/call") {
    const body = await readJson(req);
    const tool = typeof body.tool === "string" ? body.tool : undefined;
    if (!tool) {
      writeJson(res, 400, { error: "request body must include string field: tool" });
      return;
    }

    const result = await registry.callTool(tool, body.arguments ?? {});
    writeJson(res, 200, { tool, result });
    return;
  }

  writeJson(res, 404, { error: "not found" });
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonBody;
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}
