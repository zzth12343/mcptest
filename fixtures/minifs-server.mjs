#!/usr/bin/env node
/**
 * A slightly more realistic toy MCP server: a sandboxed mini file system.
 * Built with the high-level McpServer API and zod schemas.
 *
 * Usage: node fixtures/minifs-server.mjs [rootDir]
 * Root defaults to a fresh temp directory, so it is safe to run anywhere.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const root = resolve(
  process.argv[2] ?? join(tmpdir(), `mcptest-minifs-${Date.now()}`),
);
await mkdir(root, { recursive: true });

/** Resolves a path inside the root, refusing escapes like "../secrets". */
function safePath(relative) {
  const full = resolve(root, relative);
  if (full !== root && !full.startsWith(root + "/")) {
    throw new Error(`path escapes the workspace root: ${relative}`);
  }
  return full;
}

const server = new McpServer({ name: "minifs", version: "1.0.0" });

server.registerTool(
  "list_files",
  {
    description: "List files and directories directly under the workspace root.",
    inputSchema: {},
  },
  async () => {
    const entries = await readdir(root, { withFileTypes: true });
    return {
      content: [
        {
          type: "text",
          text:
            entries.length === 0
              ? "(empty)"
              : entries.map((e) => `${e.isDirectory() ? "dir " : "file"} ${e.name}`).join("\n"),
        },
      ],
    };
  },
);

server.registerTool(
  "read_file",
  {
    description: "Read a UTF-8 text file from the workspace.",
    inputSchema: { path: z.string().describe("Relative path within the workspace") },
  },
  async ({ path }) => {
    const content = await readFile(safePath(path), "utf8");
    return { content: [{ type: "text", text: content }] };
  },
);

server.registerTool(
  "write_file",
  {
    description: "Write a UTF-8 text file into the workspace (overwrites).",
    inputSchema: {
      path: z.string().describe("Relative path within the workspace"),
      content: z.string().describe("Full file content to write"),
    },
  },
  async ({ path, content }) => {
    await writeFile(safePath(path), content, "utf8");
    return { content: [{ type: "text", text: `wrote ${content.length} chars to ${path}` }] };
  },
);

await server.connect(new StdioServerTransport());
