import { describe, expect, it } from "vitest";
import { deepDiff, formatChange } from "../src/diff.js";

describe("deepDiff", () => {
  it("returns nothing for identical values", () => {
    expect(deepDiff({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it("reports a scalar change with its path", () => {
    const changes = deepDiff(
      { tools: [{ name: "echo", inputSchema: { type: "object" } }] },
      { tools: [{ name: "echo", inputSchema: { type: "string" } }] },
    );
    expect(changes).toEqual([
      {
        kind: "changed",
        path: "tools[echo].inputSchema.type",
        before: "object",
        after: "string",
      },
    ]);
  });

  it("matches array items by name so a middle insertion adds one entry, not a cascade", () => {
    const changes = deepDiff(
      { tools: [{ name: "a" }, { name: "b" }, { name: "d" }] },
      { tools: [{ name: "a" }, { name: "c" }, { name: "b" }, { name: "d" }] },
    );
    expect(changes).toEqual([{ kind: "added", path: "tools[c]", after: { name: "c" } }]);
  });

  it("falls back to index diffing when names are missing or duplicated", () => {
    const changes = deepDiff(
      [{ v: 1 }, { v: 2 }],
      [{ v: 9 }, { v: 2 }],
    );
    expect(changes).toEqual([
      { kind: "changed", path: "[0].v", before: 1, after: 9 },
    ]);
  });

  it("labels array elements by tool name when available", () => {
    const changes = deepDiff(
      { tools: [{ name: "a" }, { name: "b" }] },
      { tools: [{ name: "a" }] },
    );
    expect(changes[0]?.path).toBe("tools[b]");
    expect(changes[0]?.kind).toBe("removed");
  });

  it("falls back to numeric indices for plain arrays", () => {
    const changes = deepDiff([1, 2, 3], [1, 2]);
    expect(changes).toEqual([
      { kind: "removed", path: "[2]", before: 3 },
    ]);
  });

  it("detects added and removed keys at any depth", () => {
    const changes = deepDiff(
      { a: { b: 1, c: 2 } },
      { a: { b: 1, d: 3 } },
    );
    expect(changes).toEqual([
      { kind: "removed", path: "a.c", before: 2 },
      { kind: "added", path: "a.d", after: 3 },
    ]);
  });

  it("formats changes as single readable lines", () => {
    expect(
      formatChange({
        kind: "changed",
        path: "tools[x].type",
        before: "object",
        after: "string",
      }),
    ).toBe('tools[x].type: "object" → "string"');
  });

  it("truncates very long values in previews", () => {
    const line = formatChange({
      kind: "added",
      path: "a",
      after: "x".repeat(500),
    });
    expect(line.length).toBeLessThan(200);
    expect(line.endsWith("…")).toBe(true);
  });
});
