import pc from "picocolors";
import { formatMs } from "./util.js";

export interface CheckResult {
  name: string;
  ok: boolean;
  summary: string;
  details: string[];
}

const LABEL_WIDTH = 10;

function label(name: string): string {
  return pc.bold(name.padEnd(LABEL_WIDTH));
}

export function printHeader(version: string, target: string): void {
  console.log(`${pc.bold(`mcptest v${version}`)}`);
  console.log(`${pc.dim("target:")} ${target}`);
  console.log();
}

export function printCheck(result: CheckResult, ms?: number): void {
  const mark = result.ok ? pc.green("✔") : pc.red("✘");
  const timing = ms === undefined ? "" : pc.dim(` (${formatMs(ms)})`);
  const summary = result.ok ? result.summary : pc.red(result.summary);
  console.log(`  ${mark} ${label(result.name)} ${summary}${timing}`);
  for (const detail of result.details) {
    const [first, ...rest] = detail.split("\n");
    console.log(`      ${pc.dim("·")} ${first}`);
    for (const line of rest) console.log(`        ${line}`);
  }
}

export function printSummary(passed: number, failed: number): void {
  console.log();
  const parts: string[] = [];
  if (passed > 0) parts.push(pc.green(`${passed} passed`));
  if (failed > 0) parts.push(pc.red(`${failed} failed`));
  console.log(`  ${parts.join(pc.dim(" · "))}`);
}

export function printStderrTail(lines: string[]): void {
  if (lines.length === 0) return;
  console.log(pc.dim("  server stderr (last lines):"));
  for (const line of lines.slice(-8)) {
    console.log(`    ${pc.dim(line)}`);
  }
}
