#!/usr/bin/env node
/**
 * Toy MCP server used as a test target by mcptest's own test suite.
 *
 * Built with the low-level `Server` class so the exact tools/list payload is
 * under our control. Set MCPTEST_BREAK to simulate common authoring bugs:
 *
 *   MCPTEST_BREAK=schema  inputSchema.type becomes "string" (spec violation)
 *   MCPTEST_BREAK=typo    required references an undefined property
 *   MCPTEST_BREAK=remove  the `ping` tool disappears (snapshot regression)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const breakMode = process.env.MCPTEST_BREAK ?? "";

const echoSchema = {
  type: "object",
  properties: {
    message: { type: "string", description: "Text to send back" },
    uppercase: {
      type: "boolean",
      description: "Reply in upper case",
      default: false,
    },
  },
  required: ["message"],
};

if (breakMode === "schema") {
  echoSchema.type = "string";
}
if (breakMode === "typo") {
  echoSchema.required = ["mesage"];
}

const tools = [
  {
    name: "echo",
    description: "Echo a message back to the caller.",
    inputSchema: echoSchema,
  },
  {
    name: "ping",
    description: "Health check — replies with pong.",
    inputSchema: { type: "object", properties: {} },
  },
];
if (breakMode === "remove") {
  tools.splice(1, 1);
}

const server = new Server(
  { name: "echo", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};
  if (request.params.name === "echo") {
    const text = String(args.message ?? "");
    return {
      content: [{ type: "text", text: args.uppercase ? text.toUpperCase() : text }],
    };
  }
  if (request.params.name === "ping") {
    return { content: [{ type: "text", text: "pong" }] };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

await server.connect(new StdioServerTransport());
