import { stableStringify } from "./util.js";

export interface NormalizedTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
}

const SNAPSHOT_FIELDS = [
  "name",
  "title",
  "description",
  "inputSchema",
  "outputSchema",
  "annotations",
] as const;

/**
 * Canonical form of a tools/list result: only the fields that define the
 * server's public contract, sorted by tool name, so two semantically equal
 * listings always produce byte-identical snapshots.
 */
export function normalizeTools(tools: unknown[]): NormalizedTool[] {
  const normalized = tools
    .filter((tool): tool is Record<string, unknown> => typeof tool === "object" && tool !== null)
    .map((tool) => {
      const picked: Record<string, unknown> = {};
      for (const field of SNAPSHOT_FIELDS) {
        if (tool[field] !== undefined) picked[field] = tool[field];
      }
      return picked as unknown as NormalizedTool;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return normalized;
}

export function renderNormalized(envelope: unknown): string {
  return stableStringify(envelope);
}
