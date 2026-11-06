import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { deepDiff, formatChange } from "../diff.js";
import { NormalizedTool, renderNormalized } from "../normalize.js";
import { shortHash, slugify } from "../util.js";

export interface SnapshotCheckResult {
  ok: boolean;
  summary: string;
  details: string[];
  snapshotFile: string;
  created: boolean;
}

export interface SnapshotOptions {
  dir: string;
  command: string[];
  tools: NormalizedTool[];
  update: boolean;
  /** Fail instead of warning when no baseline exists yet (implied in CI). */
  strict?: boolean;
}

const SNAPSHOT_FORMAT = "mcptest/1";
const MAX_DISPLAYED_CHANGES = 20;

export function snapshotFileFor(dir: string, command: string[]): string {
  const id = `${slugify(command)}-${shortHash(command.join(" "))}`;
  return join(dir, `${id}.snap.json`);
}

export async function runSnapshotCheck(
  options: SnapshotOptions,
): Promise<SnapshotCheckResult> {
  const file = snapshotFileFor(options.dir, options.command);
  const target = options.command.join(" ");
  const content = renderNormalized({
    $snapshot: SNAPSHOT_FORMAT,
    target,
    tools: options.tools,
  });

  let previous: unknown;
  try {
    previous = JSON.parse(await readFile(file, "utf8"));
  } catch {
    previous = undefined;
  }

  if (previous === undefined) {
    if (!options.update) {
      const enforce = options.strict === true || Boolean(process.env.CI);
      return {
        ok: !enforce,
        created: false,
        snapshotFile: file,
        summary: enforce
          ? `no snapshot yet for this target`
          : `no baseline yet — run with --update-snapshot to record one`,
        details: [
          `run again with --update-snapshot to record the current ${options.tools.length} tool(s) as the baseline`,
          `CI runs (or --strict) fail until a baseline exists`,
        ],
      };
    }
    await writeSnapshot(file, content);
    return {
      ok: true,
      created: true,
      snapshotFile: file,
      summary: `snapshot created — ${options.tools.length} tool(s) recorded`,
      details: [file],
    };
  }

  const next = JSON.parse(content);
  const changes = deepDiff(previous, next);

  if (options.update) {
    await writeSnapshot(file, content);
    return {
      ok: true,
      created: false,
      snapshotFile: file,
      summary:
        changes.length === 0
          ? `snapshot already up to date (${options.tools.length} tools)`
          : `snapshot updated — ${changes.length} change(s) written`,
      details: changes.length > 0 ? changes.map(formatChange) : [],
    };
  }

  if (changes.length === 0) {
    return {
      ok: true,
      created: false,
      snapshotFile: file,
      summary: `matches baseline (${options.tools.length} tools)`,
      details: [],
    };
  }

  const shown = changes.slice(0, MAX_DISPLAYED_CHANGES).map(formatChange);
  if (changes.length > MAX_DISPLAYED_CHANGES) {
    shown.push(`… and ${changes.length - MAX_DISPLAYED_CHANGES} more change(s)`);
  }
  shown.push(`if these changes are intentional, re-run with --update-snapshot`);
  return {
    ok: false,
    created: false,
    snapshotFile: file,
    summary: `${changes.length} difference(s) against baseline`,
    details: shown,
  };
}

async function writeSnapshot(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${content}\n`, "utf8");
}

export function resolveSnapshotDir(dir: string | undefined): string {
  return resolve(dir ?? "__snapshots__");
}
