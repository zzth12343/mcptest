#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import pc from "picocolors";
import { probeServer, ProbeError } from "./client.js";
import { validateTools } from "./checks/schema.js";
import { runSnapshotCheck, resolveSnapshotDir } from "./checks/snapshot.js";
import { normalizeTools } from "./normalize.js";
import { printCheck, printHeader, printStderrTail, printSummary, CheckResult } from "./report.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("mcptest")
  .description("Black-box smoke & snapshot tests for MCP servers — the pytest of MCP.")
  .version(VERSION);

program
  .command("test", { isDefault: true })
  .description("run all checks against a server started over stdio")
  .argument("<command...>", "command line that starts the MCP server (e.g. `node server.mjs`)")
  .option("--timeout <ms>", "per-request timeout in milliseconds", parseMs, 20000)
  .option("--snapshot-dir <dir>", "directory holding snapshot baselines", "__snapshots__")
  .option("-u, --update-snapshot", "record the current tools/list result as the baseline")
  .option("--strict", "fail when no snapshot baseline exists yet (always enforced in CI)", false)
  .addHelpText(
    "after",
    `
Examples:
  $ mcptest test node fixtures/echo-server.mjs
  $ mcptest call --tool echo --args '{"message":"hi"}' --expect-text hi -- node fixtures/echo-server.mjs
  $ mcptest test --update-snapshot -- npx -y @modelcontextprotocol/server-memory`,
  )
  .action(async (command: string[], options) => {
    await run(command, options);
  });

program
  .command("call")
  .description("start a server, call one tool, and assert on the result")
  .argument("<command...>", "command line that starts the MCP server")
  .requiredOption("--tool <name>", "name of the tool to call")
  .option("--args <json>", "tool arguments as a JSON object", "{}")
  .option("--expect-text <substring>", "assert the text result contains this substring")
  .option("--expect-error", "assert that the call errors", false)
  .option("--timeout <ms>", "per-request timeout in milliseconds", parseMs, 20000)
  .addHelpText(
    "after",
    `
Examples:
  $ mcptest call --tool ping --expect-text pong -- node fixtures/echo-server.mjs
  $ mcptest call --tool echo --args '{"message":"hi"}' --expect-text hi -- node fixtures/echo-server.mjs`,
  )
  .action(async (command: string[], options) => {
    await runCall(command, options);
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
  options: {
    timeout: number;
    snapshotDir: string;
    updateSnapshot: boolean;
    strict: boolean;
  },
): Promise<void> {
  const target = command.join(" ");
  printHeader(VERSION, target);

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
    strict: options.strict,
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

async function runCall(
  command: string[],
  options: {
    tool: string;
    args: string;
    expectText?: string;
    expectError: boolean;
    timeout: number;
  },
): Promise<void> {
  const target = command.join(" ");
  printHeader(VERSION, target);

  let parsedArgs: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(options.args);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("expected a JSON object");
    }
    parsedArgs = value as Record<string, unknown>;
  } catch (error) {
    console.error(
      pc.red(`--args must be a JSON object: ${error instanceof Error ? error.message : String(error)}`),
    );
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  let probe;
  try {
    probe = await probeServer(command, {
      timeoutMs: options.timeout,
      toolCall: { name: options.tool, args: parsedArgs },
    });
  } catch (error) {
    const stderrTail = error instanceof ProbeError ? error.stderrTail : [];
    const reason = error instanceof Error ? error.message : String(error);
    printCheck({ name: "call", ok: false, summary: reason, details: [] });
    printStderrTail(stderrTail);
    printSummary(0, 1);
    process.exitCode = 1;
    return;
  }

  const results: CheckResult[] = [];
  const call = probe.toolCall!;
  const textPreview = call.text.length > 160 ? `${call.text.slice(0, 160)}…` : call.text;

  const errored = call.isError;
  const errorExpectation: CheckResult = {
    name: "call",
    ok: options.expectError ? errored : !errored,
    summary: options.expectError
      ? errored
        ? "errored as expected"
        : "expected an error but the call succeeded"
      : errored
        ? "call errored (remove --expect-error or fix the server)"
        : "no error",
    details: errored ? [textPreview || "(no text output)"] : [],
  };
  results.push(errorExpectation);
  printCheck(errorExpectation);

  if (options.expectText !== undefined) {
    const contains = call.text.includes(options.expectText);
    const textCheck: CheckResult = {
      name: "expect",
      ok: contains,
      summary: contains
        ? `result contains ${JSON.stringify(options.expectText)}`
        : `result does not contain ${JSON.stringify(options.expectText)}`,
      details: contains ? [] : [`got: ${textPreview || "(empty result)"}`],
    };
    results.push(textCheck);
    printCheck(textCheck);
  }

  if (!options.expectError && !errored && call.text.length > 0) {
    console.log(pc.dim(`  result: ${textPreview}`));
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
