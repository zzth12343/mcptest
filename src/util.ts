import { createHash } from "node:crypto";

/** Sorts object keys recursively, so JSON.stringify output is deterministic. */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  function sort(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);

    if (Array.isArray(v)) return v.map(sort);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>).sort()) {
      out[key] = sort((v as Record<string, unknown>)[key]);
    }
    return out;
  }

  return JSON.stringify(sort(value), null, 2);
}

/** Short stable hash of a string, used to keep snapshot filenames collision-free. */
export function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 6);
}

/** Builds a readable filename prefix out of a server command line. */
export function slugify(command: string[]): string {
  const raw = command.join(" ");
  const slug = raw
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "server";
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function formatMs(ms: number): string {
  return ms < 1 ? "<1 ms" : `${Math.round(ms)} ms`;
}
