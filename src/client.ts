import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withTimeout } from "./util.js";

export interface ProbeOptions {
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface ProbeResult {
  serverName: string;
  serverVersion: string;
  capabilities: string[];
  tools: unknown[];
  stderrTail: string[];
}

const MAX_STDERR_LINES = 30;
const MAX_TOOL_PAGES = 100;

export class ProbeError extends Error {
  readonly stderrTail: string[];
  constructor(message: string, stderrTail: string[] = []) {
    super(message);
    this.stderrTail = stderrTail;
  }
}

/**
 * The official SDK client validates every response against the MCP schema.
 * When it rejects a payload it throws a JSON array of Zod issues — turn that
 * into one readable line instead of dumping raw JSON at the user.
 */
function formatValidationError(reason: string): string {
  try {
    const issues = JSON.parse(reason) as Array<{
      path?: Array<string | number>;
      message?: string;
    }>;
    if (!Array.isArray(issues) || issues.length === 0) return reason;
    const first = issues[0]!;
    const path = (first.path ?? []).join(".");
    const suffix =
      issues.length > 1 ? ` (+${issues.length - 1} more issue(s))` : "";
    return `the official SDK rejected the response — ${path}: ${first.message}${suffix} (see https://modelcontextprotocol.io for the spec)`;
  } catch {
    return reason;
  }
}

/**
 * Spawns the server under test over stdio, performs the MCP handshake, and
 * fetches the full tools/list result (following pagination). The child
 * process is always terminated before this returns — no zombies left behind.
 */
export async function probeServer(
  command: string[],
  options: ProbeOptions,
): Promise<ProbeResult> {
  const commandName = command[0];
  if (commandName === undefined) {
    throw new ProbeError("empty command: nothing to spawn");
  }
  const args = command.slice(1);
  const stderrTail: string[] = [];
  let buffer = "";

  const transport = new StdioClientTransport({
    command: commandName,
    args,
    env: { ...(options.env ?? process.env) } as Record<string, string>,
    stderr: "pipe",
  });

  transport.stderr?.on("data", (chunk: Buffer) => {
    buffer = (buffer + chunk.toString("utf8")).split("\n").slice(-MAX_STDERR_LINES).join("\n");
  });

  const client = new Client({ name: "mcptest", version: "0.1.0" });

  try {
    const flushStderr = () => {
      const lines = buffer.split("\n").filter((line) => line.trim().length > 0);
      stderrTail.push(...lines.slice(-MAX_STDERR_LINES));
      buffer = "";
    };

    try {
      await withTimeout(client.connect(transport), options.timeoutMs, "handshake");
    } catch (error) {
      flushStderr();
      const reason = error instanceof Error ? error.message : String(error);
      throw new ProbeError(
        `handshake failed: ${reason}`,
        stderrTail,
      );
    }

    const serverVersion = client.getServerVersion();
    const capabilities = Object.keys(client.getServerCapabilities() ?? {}).sort();

    const tools: unknown[] = [];
    let cursor: string | undefined;
    let pages = 0;
    try {
      do {
        const page = await withTimeout(
          client.listTools(cursor ? { cursor } : undefined),
          options.timeoutMs,
          "tools/list",
        );
        tools.push(...page.tools);
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor !== undefined && pages < MAX_TOOL_PAGES);
      if (cursor !== undefined) {
        throw new ProbeError(
          `tools/list pagination did not terminate after ${MAX_TOOL_PAGES} pages`,
        );
      }
    } catch (error) {
      flushStderr();
      if (error instanceof ProbeError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new ProbeError(
        `tools/list failed: ${formatValidationError(reason)}`,
        stderrTail,
      );
    }

    flushStderr();
    return {
      serverName: serverVersion?.name ?? "(unnamed)",
      serverVersion: serverVersion?.version ?? "?",
      capabilities,
      tools,
      stderrTail,
    };
  } finally {
    try {
      await client.close();
    } catch {
      // Best effort: the transport may already be dead.
    }
  }
}
