import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Single source of truth for the version we report everywhere. */
export const VERSION = (require("../package.json") as { version: string })
  .version;

/** Client name sent during the MCP handshake. */
export const CLIENT_NAME = "mcptest";
