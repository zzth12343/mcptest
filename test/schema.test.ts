import { describe, expect, it } from "vitest";
import { validateTools } from "../src/checks/schema.js";

function issuesFor(tools: unknown[]) {
  return validateTools(tools).map((i) => `${i.path}: ${i.message}`);
}

describe("validateTools", () => {
  it("accepts a well-formed tool", () => {
    expect(
      validateTools([
        {
          name: "echo",
          description: "echoes",
          inputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
        },
      ]),
    ).toEqual([]);
  });

  it("flags a missing inputSchema", () => {
    const issues = issuesFor([{ name: "t" }]);
    expect(issues).toEqual([
      expect.stringContaining('tools[t].inputSchema: missing'),
    ]);
  });

  it('flags inputSchema.type that is not "object"', () => {
    const issues = issuesFor([
      { name: "t", inputSchema: { type: "string" } },
    ]);
    expect(issues[0]).toContain('must be "object"');
  });

  it("flags required entries that no property defines (typo catcher)", () => {
    const issues = issuesFor([
      {
        name: "t",
        inputSchema: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["mesage"],
        },
      },
    ]);
    expect(issues[0]).toContain('"mesage" is required but is not defined');
  });

  it("flags duplicate tool names", () => {
    const issues = issuesFor([
      { name: "t", inputSchema: { type: "object" } },
      { name: "t", inputSchema: { type: "object" } },
    ]);
    expect(issues[0]).toContain('duplicate tool name "t"');
  });

  it("flags properties that is not a mapping", () => {
    const issues = issuesFor([
      { name: "t", inputSchema: { type: "object", properties: ["a"] } },
    ]);
    expect(issues[0]).toContain("properties");
    expect(issues[0]).toContain("array");
  });

  it("flags non-object tools and non-string names", () => {
    const issues = issuesFor(["nope", { inputSchema: {} }]);
    expect(issues[0]).toContain("expected a tool object");
    expect(issues.some((i) => i.includes(".name"))).toBe(true);
  });
});
