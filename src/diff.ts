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

function nameKey(element: unknown): string | null {
  if (
    typeof element === "object" &&
    element !== null &&
    !Array.isArray(element) &&
    typeof (element as Record<string, unknown>).name === "string"
  ) {
    return (element as Record<string, unknown>).name as string;
  }
  return null;
}

/**
 * Keys an array by its elements' `name` fields so inserting or removing an
 * item does not misalign every following element (index diffing would report
 * a cascade of fake "changed" lines). Returns null when the arrays are not
 * safely keyable — missing names or duplicate names fall back to index mode.
 */
function keyByName(
  before: unknown[],
  after: unknown[],
): { before: Map<string, unknown>; after: Map<string, unknown> } | null {
  function build(elements: unknown[]): Map<string, unknown> | null {
    const map = new Map<string, unknown>();
    for (const element of elements) {
      const key = nameKey(element);
      if (key === null || map.has(key)) return null;
      map.set(key, element);
    }
    return map;
  }
  if (before.length === 0 || after.length === 0) return null;
  const beforeMap = build(before);
  const afterMap = build(after);
  return beforeMap && afterMap ? { before: beforeMap, after: afterMap } : null;
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
    const keyed = keyByName(before, after);
    if (keyed) {
      const names = [
        ...new Set([...keyed.before.keys(), ...keyed.after.keys()]),
      ].sort();
      for (const name of names) {
        const beforeItem = keyed.before.get(name);
        const afterItem = keyed.after.get(name);
        if (beforeItem !== undefined && afterItem !== undefined) {
          deepDiff(beforeItem, afterItem, `${path}[${name}]`, out);
        } else if (beforeItem !== undefined) {
          out.push({
            kind: "removed",
            path: `${path}[${name}]`,
            before: beforeItem,
          });
        } else if (afterItem !== undefined) {
          out.push({
            kind: "added",
            path: `${path}[${name}]`,
            after: afterItem,
          });
        }
      }
      return out;
    }

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
