import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "dist", "cli.js");
const ECHO = join(ROOT, "fixtures", "echo-server.mjs");
const MINIFS = join(ROOT, "fixtures", "minifs-server.mjs");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  options: { cwd: string; env?: Record<string, string> },
): RunResult {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

async function freshDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), `mcptest-it-${randomUUID().slice(0, 8)}-`));
}

const workdirs: string[] = [];
afterAll(() => {
  // OS temp dirs clean themselves; we only hold references to avoid GC churn.
  workdirs.length = 0;
});

describe("mcptest CLI (black-box, against fixtures)", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  }, 60_000);

  it(
    "fails fast with exit 1 when the server binary does not exist",
    async () => {
      const cwd = await freshDir();
      workdirs.push(cwd);
      const result = runCli(["test", "--", "definitely-not-a-real-binary"], { cwd });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("handshake");
    },
    30_000,
  );

  it(
    "passes end-to-end on the echo fixture and honours --update-snapshot",
    async () => {
      const cwd = await freshDir();
      workdirs.push(cwd);

      const baseline = runCli(["test", "--update-snapshot", "--", "node", ECHO], { cwd });
      expect(baseline.code).toBe(0);
      expect(baseline.stdout).toContain("snapshot created");

      const clean = runCli(["test", "--", "node", ECHO], { cwd });
      expect(clean.code).toBe(0);
      expect(clean.stdout).toContain("3 passed");
      expect(clean.stdout).toContain('server "echo" v1.0.0');
      expect(clean.stdout).toContain("no issues");
    },
    30_000,
  );

  it(
    "catches a removed tool as a snapshot regression",
    async () => {
      const cwd = await freshDir();
      workdirs.push(cwd);
      runCli(["test", "--update-snapshot", "--", "node", ECHO], { cwd });

      const result = runCli(["test", "--", "node", ECHO], {
        cwd,
        env: { MCPTEST_BREAK: "remove" },
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("tools[ping]: removed");
    },
    30_000,
  );

  it(
    "catches a required/property typo in the schema check",
    async () => {
      const cwd = await freshDir();
      workdirs.push(cwd);
      runCli(["test", "--update-snapshot", "--", "node", ECHO], { cwd });

      const result = runCli(["test", "--", "node", ECHO], {
        cwd,
        env: { MCPTEST_BREAK: "typo" },
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        '"mesage" is required but is not defined in properties',
      );
    },
    30_000,
  );

  it(
    "reports a spec-violating payload the official SDK rejects",
    async () => {
      const cwd = await freshDir();
      workdirs.push(cwd);
      const result = runCli(["test", "--", "node", ECHO], {
        cwd,
        env: { MCPTEST_BREAK: "schema" },
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("official SDK rejected");
    },
    30_000,
  );

  it(
    "passes on the minifs fixture (high-level SDK server style)",
    async () => {
      const cwd = await freshDir();
      workdirs.push(cwd);
      const result = runCli(
        ["test", "--update-snapshot", "--", "node", MINIFS],
        { cwd },
      );
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("3 tool(s)");
    },
    30_000,
  );
});
