<div align="center">

# mcptest

**Black-box tests for your MCP server — the pytest of MCP.**

[![CI](https://github.com/OWNER/mcptest/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/mcptest/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcptest.svg)](https://www.npmjs.com/package/mcptest)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md)

</div>

---

[Inspector](https://github.com/modelcontextprotocol/inspector) is a debugger; **mcptest is a test framework**. One command, one exit code — it fits straight into CI, and it catches the "oops, I broke my tool schema" class of regressions that no other tool watches for.

```text
$ npx mcptest test node fixtures/echo-server.mjs

mcptest v0.1.0
target: node fixtures/echo-server.mjs

  ✔ handshake  server "echo" v1.0.0 · capabilities: tools (102 ms)
  ✔ schema     2 tool(s), no issues
  ✔ snapshot   matches baseline (2 tools)

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
2. **Snapshot regression for `tools/list`.** The normalized tool list is recorded as a baseline; any change — a renamed tool, a retyped parameter, a new required field — fails the build with a precise diff.
3. **Spec-shaped schema validation, in plain language.** Missing `inputSchema`, wrong `type`, `required` entries that no property defines (the classic typo) — reported as sentences, not error codes.

## Install

```bash
npm install --save-dev mcptest
# or just run it, zero install:
npx mcptest test -- node your-server.mjs
```

Requires Node.js ≥ 18.19. The server under test only needs to speak MCP over stdio — any language works.

## Usage

```text
mcptest test <command...> [options]

start an MCP server and run all checks against it

Options:
  --timeout <ms>          per-request timeout (default: 20000)
  --snapshot-dir <dir>    snapshot baseline directory (default: __snapshots__)
  -u, --update-snapshot   record the current tools/list as the baseline
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

### The three checks

| Check | What it asserts |
|---|---|
| `handshake` | The server starts, completes the MCP `initialize` handshake, and answers `tools/list` (pagination followed) |
| `schema` | Every tool has a non-empty unique name, an `inputSchema` of type `object`, sane `properties`, and a `required` list that actually references defined properties |
| `snapshot` | The normalized `tools/list` result matches the recorded baseline byte-for-byte |

## CI integration

```yaml
# .github/workflows/mcp-test.yml
- run: npm ci
- run: npx mcptest test -u -- node server.mjs   # one-time / when contract changes intentionally
- run: npx mcptest test -- node server.mjs      # fails the build on regressions
```

The exit code is `0` only when every check passes — no parsing required.

## Compatibility matrix

Verified against real servers over stdio:

| Server | Version | Tools | Handshake | Schema | Snapshot |
|---|---|---:|:-:|:-:|:-:|
| `@modelcontextprotocol/server-everything` | 2.0.1 | 16 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-filesystem` | 2.0.1 | 14 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-memory` | 2.0.0 | 9 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-sequential-thinking` | 2.0.0 | 1 | ✅ | ✅ | ✅ |
| `@upstash/context7-mcp` (community) | 4.4.4 | 2 | ✅ | ✅ | ✅ |
| bundled fixtures (`echo`, `minifs`) | — | 2–3 | ✅ | ✅ | ✅ |

The CLI also ships with toy servers under `fixtures/` — handy for trying things out without installing anything: `npx mcptest test -- npx -y @modelcontextprotocol/server-memory`.

## Self-hosting, self-testing

mcptest's own test suite runs the CLI as a black box against its bundled fixture servers, including deliberately broken ones (`MCPTEST_BREAK=typo|schema|remove`) — the tool verifies itself the same way it verifies your server. `npm test` covers the diff engine, normalization, schema rules, and end-to-end CLI runs.

## Roadmap

- [ ] YAML behavior tests (`expect: error / resultContains` assertions on tool calls)
- [ ] Official GitHub Action (`uses: you/mcp-test-action@v1`)
- [ ] 2026-07-28 spec compliance pack (stateless core / Tasks / Apps detection)
- [ ] Streamable HTTP transport
- [ ] Grow the compatibility matrix to 20+ servers

## Development

```bash
npm install
npm run build   # tsc → dist/
npm test        # vitest: unit + black-box integration
npm run demo    # run mcptest against the bundled echo fixture
```

## License

[MIT](./LICENSE)
