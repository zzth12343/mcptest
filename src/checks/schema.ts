export interface SchemaIssue {
  tool: string;
  path: string;
  message: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

/**
 * Structural validation of a tools/list result against the MCP spec's
 * requirements for tool definitions. Every issue is phrased as a sentence a
 * server author can act on without reading the spec.
 */
export function validateTools(tools: unknown[]): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const seen = new Map<string, number>();

  tools.forEach((tool, index) => {
    if (!isPlainObject(tool)) {
      issues.push({
        tool: `#${index}`,
        path: `tools[${index}]`,
        message: `expected a tool object, got ${typeOf(tool)}`,
      });
      return;
    }

    const name = tool.name;
    const label =
      typeof name === "string" && name.length > 0 ? name : `#${index}`;
    const base = `tools[${label}]`;

    if (typeof name !== "string" || name.length === 0) {
      issues.push({
        tool: label,
        path: `${base}.name`,
        message: `every tool needs a non-empty string name, got ${typeOf(name)}`,
      });
    } else if (seen.has(name)) {
      issues.push({
        tool: label,
        path: `${base}.name`,
        message: `duplicate tool name "${name}" (first defined at tools[${seen.get(name)}])`,
      });
    } else {
      seen.set(name, index);
    }

    if (tool.description !== undefined && typeof tool.description !== "string") {
      issues.push({
        tool: label,
        path: `${base}.description`,
        message: `must be a string when present, got ${typeOf(tool.description)}`,
      });
    }

    const schema = tool.inputSchema;
    if (schema === undefined) {
      issues.push({
        tool: label,
        path: `${base}.inputSchema`,
        message:
          "missing — every tool must declare an inputSchema (a JSON Schema of type \"object\")",
      });
      return;
    }
    if (!isPlainObject(schema)) {
      issues.push({
        tool: label,
        path: `${base}.inputSchema`,
        message: `must be a JSON Schema object, got ${typeOf(schema)}`,
      });
      return;
    }

    if (schema.type !== "object") {
      issues.push({
        tool: label,
        path: `${base}.inputSchema.type`,
        message: `must be "object" per the MCP spec, got ${preview(schema.type)}`,
      });
    }

    if (schema.properties !== undefined) {
      if (!isPlainObject(schema.properties)) {
        issues.push({
          tool: label,
          path: `${base}.inputSchema.properties`,
          message: `must map property names to JSON Schemas, got ${typeOf(schema.properties)}`,
        });
      } else {
        for (const [key, value] of Object.entries(schema.properties)) {
          if (!isPlainObject(value)) {
            issues.push({
              tool: label,
              path: `${base}.inputSchema.properties.${key}`,
              message: `must be a JSON Schema object, got ${typeOf(value)}`,
            });
          }
        }
      }
    }

    if (schema.required !== undefined) {
      const required = schema.required;
      if (!Array.isArray(required) || required.some((r) => typeof r !== "string")) {
        issues.push({
          tool: label,
          path: `${base}.inputSchema.required`,
          message: `must be an array of property names, got ${preview(required)}`,
        });
      } else if (isPlainObject(schema.properties)) {
        const properties = schema.properties;
        for (const entry of required) {
          if (!(entry in properties)) {
            issues.push({
              tool: label,
              path: `${base}.inputSchema.required`,
              message: `"${entry}" is required but is not defined in properties — is it a typo?`,
            });
          }
        }
      }
    }
  });

  return issues;
}

function preview(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
