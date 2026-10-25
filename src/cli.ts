#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command, InvalidArgumentError } from "commander";
import pc from "picocolors";
import { probeServer, ProbeError } from "./client.js";
import { validateTools } from "./checks/schema.js";
import { runSnapshotCheck, resolveSnapshotDir } from "./checks/snapshot.js";
import { normalizeTools } from "./normalize.js";
import { printCheck, printHeader, printStderrTail, printSummary, CheckResult } from "./report.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("mcptest")
  .description("Black-box smoke & snapshot tests for MCP servers — the pytest of MCP.")
  .version(version);

program
  .command("test", { isDefault: true })
  .description("run all checks against a server started over stdio")
  .argument("<command...>", "command line that starts the MCP server (e.g. `node server.mjs`)")
  .option("--timeout <ms>", "per-request timeout in milliseconds", parseMs, 20000)
  .option("--snapshot-dir <dir>", "directory holding snapshot baselines", "__snapshots__")
  .option("-u, --update-snapshot", "record the current tools/list result as the baseline")
  .addHelpText(
    "after",
    `
Examples:
  $ mcptest test node fixtures/echo-server.mjs
  $ mcptest test --update-snapshot -- npx -y @modelcontextprotocol/server-memory`,
  )
  .action(async (command: string[], options) => {
    await run(command, options);
  });

function parseMs(value: string): number {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new InvalidArgumentError("expected a positive number of milliseconds");
  }
  return ms;
}

async function run(
  command: string[],
  options: { timeout: number; snapshotDir: string; updateSnapshot: boolean },
): Promise<void> {
  const target = command.join(" ");
  printHeader(version, target);

  const results: CheckResult[] = [];

  // 1. Handshake smoke test (also fetches tools/list while the child is alive).
  const startedAt = Date.now();
  let probe;
  try {
    probe = await probeServer(command, { timeoutMs: options.timeout });
  } catch (error) {
    const stderrTail = error instanceof ProbeError ? error.stderrTail : [];
    const reason = error instanceof Error ? error.message : String(error);
    results.push({
      name: "handshake",
      ok: false,
      summary: reason,
      details: [],
    });
    printCheck(results[0]!, Date.now() - startedAt);
    printStderrTail(stderrTail);
    printSummary(0, 1);
    process.exitCode = 1;
    return;
  }

  const caps =
    probe.capabilities.length > 0 ? probe.capabilities.join(", ") : "none declared";
  results.push({
    name: "handshake",
    ok: true,
    summary: `server "${probe.serverName}" v${probe.serverVersion} · capabilities: ${caps}`,
    details: [],
  });
  printCheck(results[0]!, Date.now() - startedAt);

  // 2. Tool schema validation.
  const schemaIssues = validateTools(probe.tools);
  const schemaResult: CheckResult = {
    name: "schema",
    ok: schemaIssues.length === 0,
    summary:
      schemaIssues.length === 0
        ? `${probe.tools.length} tool(s), no issues`
        : `${schemaIssues.length} issue(s) in ${probe.tools.length} tool(s)`,
    details: schemaIssues.map((issue) => `${issue.path}: ${issue.message}`),
  };
  results.push(schemaResult);
  printCheck(schemaResult);

  // 3. Snapshot regression test.
  const snapshotResult = await runSnapshotCheck({
    dir: resolveSnapshotDir(options.snapshotDir),
    command,
    tools: normalizeTools(probe.tools),
    update: options.updateSnapshot,
  });
  const snapshotCheck: CheckResult = {
    name: "snapshot",
    ok: snapshotResult.ok,
    summary: snapshotResult.summary,
    details: snapshotResult.details,
  };
  results.push(snapshotCheck);
  printCheck(snapshotCheck);
  if (!snapshotResult.ok) {
    console.log(pc.dim(`      baseline file: ${snapshotResult.snapshotFile}`));
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  printSummary(passed, failed);
  if (failed > 0) process.exitCode = 1;
}

process.on("SIGINT", () => {
  // The probe closes its child in a finally block; nothing to reap here.
  process.exit(130);
});

program.parseAsync(process.argv).catch((error) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
