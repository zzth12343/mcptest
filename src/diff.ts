export type DiffChange =
  | { kind: "added"; path: string; after: unknown }
  | { kind: "removed"; path: string; before: unknown }
  | { kind: "changed"; path: string; before: unknown; after: unknown };

const MAX_VALUE_LENGTH = 120;

export function previewValue(value: unknown): string {
  const text =
    value === undefined ? "undefined" : JSON.stringify(value) ?? String(value);
  return text.length > MAX_VALUE_LENGTH
    ? `${text.slice(0, MAX_VALUE_LENGTH)}…`
    : text;
}

/** Path segment for an array element: use the tool name when available. */
function indexLabel(elements: unknown[], index: number): string {
  const element = elements[index];
  if (
    typeof element === "object" &&
    element !== null &&
    typeof (element as Record<string, unknown>).name === "string"
  ) {
    return `[${(element as Record<string, unknown>).name}]`;
  }
  return `[${index}]`;
}

export function deepDiff(
  before: unknown,
  after: unknown,
  path = "",
  out: DiffChange[] = [],
): DiffChange[] {
  if (before === after) return out;

  const beforeIsObj =
    typeof before === "object" && before !== null && !Array.isArray(before);
  const afterIsObj =
    typeof after === "object" && after !== null && !Array.isArray(after);

  if (beforeIsObj && afterIsObj) {
    const keys = [...new Set([
      ...Object.keys(before as object),
      ...Object.keys(after as object),
    ])].sort();
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      const beforeValue = (before as Record<string, unknown>)[key];
      const afterValue = (after as Record<string, unknown>)[key];
      if (!(key in (before as object))) {
        out.push({ kind: "added", path: childPath, after: afterValue });
      } else if (!(key in (after as object))) {
        out.push({ kind: "removed", path: childPath, before: beforeValue });
      } else {
        deepDiff(beforeValue, afterValue, childPath, out);
      }
    }
    return out;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const shared = Math.min(before.length, after.length);
    for (let i = 0; i < shared; i++) {
      deepDiff(before[i], after[i], `${path}${indexLabel(before, i)}`, out);
    }
    for (let i = shared; i < before.length; i++) {
      out.push({
        kind: "removed",
        path: `${path}${indexLabel(before, i)}`,
        before: before[i],
      });
    }
    for (let i = shared; i < after.length; i++) {
      out.push({
        kind: "added",
        path: `${path}${indexLabel(after, i)}`,
        after: after[i],
      });
    }
    return out;
  }

  out.push({ kind: "changed", path: path || "(root)", before, after });
  return out;
}

export function formatChange(change: DiffChange): string {
  switch (change.kind) {
    case "added":
      return `${change.path}: added ${previewValue(change.after)}`;
    case "removed":
      return `${change.path}: removed ${previewValue(change.before)}`;
    case "changed":
      return `${change.path}: ${previewValue(change.before)} → ${previewValue(change.after)}`;
  }
}
