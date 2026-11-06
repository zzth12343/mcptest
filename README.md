<div align="center">

# mcptest

**Black-box tests for your MCP server — the pytest of MCP.**

[![CI](https://github.com/zzth12343/mcptest/actions/workflows/ci.yml/badge.svg)](https://github.com/zzth12343/mcptest/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md)

</div>

---

> **Scope:** mcptest speaks the MCP handshake used by the official TypeScript SDK 1.x (protocol revision ≤ 2025-11-25). Servers implementing *only* the stateless 2026-07-28 revision are not probed yet — a stateless probe is next on the roadmap.

[Inspector](https://github.com/modelcontextprotocol/inspector) is a debugger; **mcptest is a test framework**. One command, one exit code — it fits straight into CI, and it catches the "oops, I broke my tool schema" class of regressions that no other tool watches for.

```text
$ npx mcptest test node fixtures/echo-server.mjs

mcptest v0.1.0
target: node fixtures/echo-server.mjs

  ✔ handshake  server "echo" v1.0.0 · capabilities: tools (111 ms)
  ✔ schema     2 tool(s), no issues
  ✔ snapshot   no baseline yet — run with --update-snapshot to record one

  3 passed
```

And when someone silently breaks a tool:

```text
$ mcptest test -- node fixtures/echo-server.mjs

  ✔ handshake  server "echo" v1.0.0 · capabilities: tools (98 ms)
  ✘ schema     1 issue(s) in 2 tool(s)
      · tools[echo].inputSchema.required: "mesage" is required but is not defined in properties — is it a typo?
  ✘ snapshot   1 difference(s) against baseline
      · tools[ping]: removed {"description":"Health check — replies with pong.", …}
      · if these changes are intentional, re-run with --update-snapshot

  1 passed · 2 failed
$ echo $?
1
```

## Why

MCP servers expose a public contract to every client that connects to them. mcptest verifies that contract as a black box — start the server over stdio and interrogate it:

1. **CI-first.** A single command with a proper exit code. No TUI, no clicking. Add one line to your GitHub Actions job.
2. **Snapshot regression for `tools/list`.** The normalized tool list is recorded as a baseline; any change — a renamed tool, a retyped parameter, a new required field — fails the build with a precise diff. Items are matched by tool name, so inserting a tool in the middle no longer produces a cascade of fake diffs.
3. **Spec-shaped schema validation, in plain language.** Missing `inputSchema`, wrong `type`, `required` entries that no property defines (the classic typo) — reported as sentences, not error codes.
4. **Behavior checks via `tools/call`.** Assert a tool actually answers: `mcptest call --tool ping --expect-text pong`. Errored calls are assertable too (`--expect-error`).

## Install

```bash
npm install --save-dev mcptest
# or just run it, zero install:
npx mcptest test -- node your-server.mjs
```

Requires Node.js ≥ 18.19. The server under test only needs to speak MCP over stdio — any language works.

## Usage

### `mcptest test` — shape checks

```text
mcptest test <command...> [options]

start an MCP server and run all checks against it

Options:
  --timeout <ms>          per-request timeout (default: 20000)
  --snapshot-dir <dir>    snapshot baseline directory (default: __snapshots__)
  -u, --update-snapshot   record the current tools/list as the baseline
  --strict                fail when no baseline exists yet (always enforced in CI)
```

Typical workflow:

```bash
# first run: record what your server looks like today
mcptest test -u -- node server.mjs
# commit __snapshots__/ with your source

# from now on, every run (locally or in CI) verifies against that baseline
mcptest test -- node server.mjs
```

Put `--` before the server command when it takes its own flags.

The three checks:

| Check | What it asserts |
|---|---|
| `handshake` | The server starts, completes the MCP `initialize` handshake, and answers `tools/list` (pagination followed) |
| `schema` | Every tool has a non-empty unique name, an `inputSchema` of type `object`, sane `properties`, and a `required` list that actually references defined properties |
| `snapshot` | The normalized `tools/list` result matches the recorded baseline byte-for-byte |

### `mcptest call` — behavior checks

Beyond shape, assert a tool actually behaves:

```text
$ mcptest call --tool ping --expect-text pong -- node fixtures/echo-server.mjs

mcptest v0.1.0
target: node fixtures/echo-server.mjs

  ✔ call       no error
  ✔ expect     result contains "pong"
  result: pong

  2 passed
```

`--expect-error` treats a failed call as the expected outcome (useful for unknown-tool or invalid-argument regressions).

## CI integration

```yaml
# .github/workflows/mcp-test.yml
- run: npm ci
- run: npx mcptest test -u -- node server.mjs   # one-time / when contract changes intentionally
- run: npx mcptest test -- node server.mjs      # fails the build on regressions
```

The exit code is `0` only when every check passes — no parsing required.

## Compatibility matrix

Verified over stdio, re-run **2026-11-06** with mcptest v0.1.0:

| Server | Version | Tools | Handshake | Schema | Snapshot |
|---|---|---:|:-:|:-:|:-:|
| `@modelcontextprotocol/server-everything` | 2.2.1 | 16 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-filesystem` | 2.2.0 | 16 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-memory` | 2.1.0 | 9 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-sequential-thinking` | 2.0.0 | 1 | ✅ | ✅ | ✅ |
| `@playwright/mcp` | 1.65.0-alpha | 25 | ✅ | ✅ | ✅ |
| `@wonderwhy-er/desktop-commander` | 0.3.1 | 25 | ✅ ¹ | ✅ | ✅ |
| `@upstash/context7-mcp` | 4.5.1 | 2 | ✅ | ✅ | ✅ |
| `@anaisbetts/mcp-youtube` | 0.5.1 | 1 | ✅ | ✅ | ✅ |
| bundled fixtures (`echo`, `minifs`) | — | 2–3 | ✅ | ✅ | ✅ |

¹ **Real finding:** desktop-commander's first `npx` run takes **49 s** before the handshake completes (cold package download), blowing past the default 20 s timeout — warm runs answer in 2.7 s. Heavy npx-packaged servers need `--timeout 60000`+ on first contact; worth knowing before you blame the server.

The CLI also ships with toy servers under `fixtures/` — handy for trying things out without installing anything.

## Self-hosting, self-testing

mcptest's own test suite runs the CLI as a black box against its bundled fixture servers, including deliberately broken ones (`MCPTEST_BREAK=typo|schema|remove`) — the tool verifies itself the same way it verifies your server. `npm test` covers the diff engine, normalization, schema rules, end-to-end CLI runs, and the `call` assertions.

## Roadmap

1. **Stateless probe for the 2026-07-28 revision** — one `tools/list` with an `MCP-Protocol-Version` header, no handshake required; simpler than the current path and unblocks modern servers.
2. **YAML behavior suites** — batch `call` assertions in a single file (`expect: error / resultContains`); the single-call engine already ships.
3. **Official GitHub Action** (`uses: zzth12343/mcp-test-action@v1`)
4. **Auto-refreshed compatibility matrix** — scheduled CI job that re-runs the matrix and opens a PR when versions drift.
5. Streamable HTTP transport.

## Development

```bash
npm install
npm run build   # tsc → dist/
npm test        # vitest: unit + black-box integration (29 tests)
npm run demo    # run mcptest against the bundled echo fixture
```

## License

[MIT](./LICENSE)
