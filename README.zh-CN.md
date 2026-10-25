<div align="center">

# mcptest

**MCP server 的黑盒测试工具 —— MCP 界的 pytest。**

[![CI](https://github.com/OWNER/mcptest/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/mcptest/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcptest.svg)](https://www.npmjs.com/package/mcptest)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md)

</div>

---

[Inspector](https://github.com/modelcontextprotocol/inspector) 是调试器，**mcptest 是测试框架**。一条命令、一个退出码，直接接入 CI；专抓"无意间破坏了 tool schema"这类没有任何工具盯着看的回归。

```text
$ npx mcptest test node fixtures/echo-server.mjs

mcptest v0.1.0
target: node fixtures/echo-server.mjs

  ✔ handshake  server "echo" v1.0.0 · capabilities: tools (102 ms)
  ✔ schema     2 tool(s), no issues
  ✔ snapshot   matches baseline (2 tools)

  3 passed
```

当有人悄悄改坏了工具时：

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

## 为什么做这个

MCP server 对每一个连接它的 client 暴露的是一份公共契约。mcptest 以黑盒方式验证这份契约——通过 stdio 拉起 server，直接盘问它：

1. **CI 优先。** 一条命令 + 规范的退出码，没有 TUI、不用点鼠标，GitHub Actions 里加一行就行。
2. **`tools/list` 快照回归。** 规范化后的工具清单存为基线；任何变化——工具改名、参数改类型、新增必填字段——都会以精确 diff 的形式挂掉构建。
3. **按 spec 校验 schema，说人话。** 缺 `inputSchema`、`type` 不对、`required` 引用了不存在的属性（经典手滑 typo）——全部报成一句能看懂的句子。

## 安装

```bash
npm install --save-dev mcptest
# 或者零安装直接跑：
npx mcptest test -- node your-server.mjs
```

要求 Node.js ≥ 18.19。被测 server 只要走 stdio 说 MCP 协议，任何语言写的都行。

## 用法

```text
mcptest test <command...> [options]

start an MCP server and run all checks against it

Options:
  --timeout <ms>          per-request timeout (default: 20000)
  --snapshot-dir <dir>    snapshot baseline directory (default: __snapshots__)
  -u, --update-snapshot   record the current tools/list as the baseline
```

典型工作流：

```bash
# 第一次：把 server 当前的样子录下来
mcptest test -u -- node server.mjs
# 把 __snapshots__/ 随源码一起提交

# 之后每次运行（本地或 CI）都与基线比对
mcptest test -- node server.mjs
```

server 命令自带参数时，记得在它前面加 `--`。

### 三个检查项

| 检查 | 断言内容 |
|---|---|
| `handshake` | server 能启动、完成 MCP `initialize` 握手、正确应答 `tools/list`（自动跟随分页） |
| `schema` | 每个工具有非空唯一 name、type 为 `object` 的 `inputSchema`、合法的 `properties`、`required` 引用的属性都真实存在 |
| `snapshot` | 规范化后的 `tools/list` 与基线逐字节一致 |

## 接入 CI

```yaml
# .github/workflows/mcp-test.yml
- run: npm ci
- run: npx mcptest test -u -- node server.mjs   # 首次 / 契约有意变更时
- run: npx mcptest test -- node server.mjs      # 有回归就挂构建
```

全部通过退出码才是 `0`——不需要解析任何输出。

## 兼容性矩阵

对真实 server 的 stdio 实测结果：

| Server | 版本 | 工具数 | 握手 | Schema | 快照 |
|---|---|---:|:-:|:-:|:-:|
| `@modelcontextprotocol/server-everything` | 2.0.1 | 16 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-filesystem` | 2.0.1 | 14 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-memory` | 2.0.0 | 9 | ✅ | ✅ | ✅ |
| `@modelcontextprotocol/server-sequential-thinking` | 2.0.0 | 1 | ✅ | ✅ | ✅ |
| `@upstash/context7-mcp`（社区） | 4.4.4 | 2 | ✅ | ✅ | ✅ |
| 内置 fixtures（`echo`、`minifs`） | — | 2–3 | ✅ | ✅ | ✅ |

CLI 自带两个玩具 server（`fixtures/` 目录），不装任何东西就能上手：`npx mcptest test -- npx -y @modelcontextprotocol/server-memory`。

## 用自己测自己

mcptest 的测试套件就是把 CLI 当黑盒、拿内置 fixture server（含故意改坏的 `MCPTEST_BREAK=typo|schema|remove` 模式）去跑的——工具验证你的 server 的方式，就是它验证自己的方式。`npm test` 覆盖 diff 引擎、规范化、schema 规则和端到端 CLI 运行。

## 路线图

- [ ] YAML 行为测试（对 tool 调用断言 `expect: error / resultContains`）
- [ ] 官方 GitHub Action（`uses: you/mcp-test-action@v1`）
- [ ] 2026-07-28 新 spec 合规包（stateless core / Tasks / Apps 检测项）
- [ ] Streamable HTTP 传输
- [ ] 兼容性矩阵扩到 20+ server

## 开发

```bash
npm install
npm run build   # tsc → dist/
npm test        # vitest：单测 + 黑盒集成
npm run demo    # 对内置 echo fixture 跑一遍
```

## 许可证

[MIT](./LICENSE)
