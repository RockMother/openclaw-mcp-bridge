import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "openclaw-mcp-bridge-echo", version: "0.1.0" });

server.registerTool(
  "echo",
  {
    title: "Echo",
    description: "Returns the provided message.",
    inputSchema: {
      message: z.string(),
    },
  },
  async ({ message }) => ({
    content: [{ type: "text", text: message }],
  }),
);

await server.connect(new StdioServerTransport());
