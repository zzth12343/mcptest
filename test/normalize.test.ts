import { describe, expect, it } from "vitest";
import { normalizeTools, renderNormalized } from "../src/normalize.js";

describe("normalizeTools", () => {
  it("keeps only contract-defining fields and drops the rest", () => {
    const [tool] = normalizeTools([
      {
        name: "echo",
        title: "Echo",
        description: "d",
        inputSchema: { type: "object" },
        outputSchema: undefined,
        annotations: { readOnlyHint: true },
        callable: true, // non-contract field: must be dropped
      },
    ]);
    expect(Object.keys(tool).sort()).toEqual([
      "annotations",
      "description",
      "inputSchema",
      "name",
      "title",
    ]);
  });

  it("sorts tools by name so list order does not matter", () => {
    const names = normalizeTools([
      { name: "zeta", inputSchema: {} },
      { name: "alpha", inputSchema: {} },
      { name: "Mid", inputSchema: {} },
    ]).map((t) => t.name);
    expect(names).toEqual(["alpha", "Mid", "zeta"]);
  });

  it("renders byte-identical output regardless of key order", () => {
    const a = renderNormalized({
      tools: normalizeTools([
        { name: "t", inputSchema: { properties: { b: {}, a: {} }, type: "object" } },
      ]),
    });
    const b = renderNormalized({
      tools: normalizeTools([
        { name: "t", inputSchema: { type: "object", properties: { a: {}, b: {} } } },
      ]),
    });
    expect(a).toBe(b);
  });
});
