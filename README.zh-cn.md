# 适用于 VSCode 和 JetBrains 的 Claude Todos

[Português](README.md) · [English](README.en.md) · [Español](README.es.md) · **简体中文** · [繁體中文](README.zh-tw.md)

> 本翻译由 AI 生成，尚未经过母语者审校。欢迎提交改进 —— 术语表见 [docs/i18n/glossary-zh.md](docs/i18n/glossary-zh.md)。

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/CarlosJunior1992.claude-todos.svg?label=VS%20Code%20Marketplace&color=007ACC&style=flat)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos)
[![Open VSX](https://img.shields.io/open-vsx/v/CarlosJunior1992/claude-todos?label=Open%20VSX&color=c160ef)](https://open-vsx.org/extension/CarlosJunior1992/claude-todos)
[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/33074-claude-todos?label=JetBrains%20Marketplace&color=fe2857)](https://plugins.jetbrains.com/plugin/33074-claude-todos)
[![CI](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**为你的 Claude Code 智能体提供可观测性** — 任务、智能体树、耗时、令牌和缓存，实时呈现，且仅限于当前 VSCode 窗口打开的工作区。一切都是 100% 本地的：不同项目的两个窗口永远不会看到彼此的数据。

![Claude Todos 面板：主智能体和子智能体的任务实时从 pending → in_progress → completed 推进，并显示每个任务的耗时](screenshots/claude-todos-demo.gif)

## 你能获得什么

- **实时智能体树（“任务指挥中心”）** — 主智能体 → 子智能体 → 嵌套智能体，附带智能体类型徽章（Explore、Plan、general-purpose…）、状态和每个智能体的令牌数。
- **实时任务** — 每个项目随着智能体工作从 `pending → in_progress → completed` 转变；点击一个任务会在对话记录中打开其最后一次状态变化所在的行。如果编排者在子智能体仍在运行时停止更新任务列表，面板会标记出这种滞后。
- **每个任务的耗时** — 每个已完成任务的持续时间、进行中任务的实时计时器，以及剩余部分的（已标注的）预估。
- **令牌、上下文和缓存** — 按模型或按智能体的表格、带红绿灯提示的上下文窗口指示器，以及缓存效率（复用 × 创建 × 新增）。
- **“最近 7 天”仪表盘** — 按模型和按智能体类型汇总的项目使用情况。
- **通知** — 当会话空闲等待你时，或所有任务完成时（仅在窗口未获得焦点时）弹出提示。
- **界面支持 3 种语言** — en、pt-br 和 es；跟随 VS Code 的显示语言，也可通过设置覆盖。

## 工作原理

![Claude Todos 面板在 Claude Code 会话期间实时更新](screenshots/panel-live-during-smoke-test.png)

**Claude Todos** 面板（位于左侧活动栏）读取 Claude Code 已经写入磁盘的对话记录 — 无需代理、无需 API — 并在智能体工作时实时反映所有内容。

`claude` 在**哪里**运行并不重要：可以是 VSCode 的集成终端、任何外部终端（Windows Terminal、iTerm、gnome-terminal），或者在单独窗口中运行的 Claude Code CLI。只要会话的工作目录与 VSCode 中打开的工作区一致，面板就会反映出来。

## 安装

| 编辑器 | 安装位置 |
|---|---|
| VS Code | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos) |
| Cursor · Windsurf · VSCodium | [Open VSX](https://open-vsx.org/extension/CarlosJunior1992/claude-todos) |
| IntelliJ IDEA · PyCharm · WebStorm · Rider · …（2024.2+） | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33074-claude-todos) |
| 任意（离线） | `.vsix`（VS Code）/ `.zip`（JetBrains）— [GitHub Release](https://github.com/carlosdealmeida/claude-todos-vscode/releases) |

> **JetBrains 插件：** 同一个面板也运行在 JetBrains 系列 IDE 中 — 同样的智能体树、
> 耗时、令牌和仪表盘，配有原生 toast 通知、点击任务打开对话记录，以及会话选择器。
> 需要 **Node.js 在 PATH 中**（使用 Claude Code 的用户通常已经具备）。
> 钩子是共用的：从一个 IDE 安装后，另一个也会同时生效。

1. 安装扩展（见上表）。“开始使用 Claude Todos”引导会出现在编辑器的 *Welcome/Get Started* 页面，并指引你完成下面的步骤。
2. 首次启动时，接受安装钩子到 `~/.claude/settings.json` 的提示 — 扩展会添加两个：`SessionStart` 和 `UserPromptSubmit`。已有的钩子会被保留。
3. 打开一个文件夹，在任意终端中运行 `claude`。一旦会话有活动，**Claude Todos** 视图（活动栏）就会开始填充。

**安装钩子时已经在运行的会话** 会在你向它们发送下一条消息时被识别（这正是 `UserPromptSubmit` 的作用）。新会话会被立即跟踪。

## 命令

| 命令 | 默认快捷键 |
|---|---|
| Claude Todos: Open in Editor | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Claude Todos: Choose Session | `Ctrl+Alt+S` / `Cmd+Alt+S` |
| Claude Todos: Refresh | — |
| Claude Todos: Install Session Hook | — |

## 设置

| 设置 | 默认值 | 作用 |
|---|---|---|
| `claudeTodos.claudeDir` | `""`（通过 `os.homedir()` 自动检测） | 覆盖 `~/.claude` 的位置。 |
| `claudeTodos.autoInstallHook` | `true` | 显示首次运行时询问是否安装钩子的提示。 |
| `claudeTodos.language` | `auto` | 面板界面语言（`auto` \| `en` \| `pt-br` \| `es`）。 |
| `claudeTodos.notifications` | `true` | 会话空闲或所有任务完成时弹出提示（窗口未获得焦点时）。 |
| `claudeTodos.activeFolder` | `""` | 多根工作区：要跟踪的工作区文件夹；留空 = 跟随最活跃的会话。 |

## 隐私与数据流

此扩展**完全本地运行**。不会向任何服务器发送任何内容。

| 文件 | 访问方式 | 原因 |
|---|---|---|
| `~/.claude/settings.json` | 读取 + 写入（仅一次，需授权） | 在 `hooks.SessionStart` 和 `hooks.UserPromptSubmit` 下添加两个钩子命令。其他钩子和设置会被保留。 |
| `~/.claude/.vscode-todos-bridge/sessions.json` | 由内置的钩子脚本写入 | 记录 `{cwd, sessionId, terminalPid, startedAt}`，让扩展知道哪个 Claude 会话属于哪个 VSCode 窗口。最多保留 200 条记录。 |
| `~/.claude/projects/{cwd-encoded}/…` | 只读 | 由 Claude Code 自身写入的会话和子智能体对话记录（`.jsonl` + `.meta.json`）— 任务、树状结构、耗时和令牌数据的来源。 |
| `~/.claude/todos/` | 不会被访问 | Claude Code 1.x 的旧版位置，已被忽略。 |

此扩展不会修改你的对话记录，也不会删除任何内容。

## 环境要求

- VSCode 1.85 或更新版本
- Claude Code 2.x（任何会将对话记录写入 `~/.claude/projects/` 的版本）
- Node.js 20+ 且在 `PATH` 中（钩子脚本是一个小型 Node 程序）

## 从源码构建

```bash
git clone <repo-url>
cd claude-todos-vscode
npm install
npm test         # vitest
npm run build    # esbuild for the extension + hook, vite for the Svelte webview
npx vsce package # produces claude-todos-<version>.vsix
```

要在开发主机中运行扩展：在 VSCode 中打开该文件夹并按 F5（使用 `.vscode/launch.json`）。

## 已知限制

- 钩子脚本必须始终可以通过 `~/.claude/settings.json` 中存储的路径访问。如果你手动删除扩展而没有卸载它，那些钩子命令会变成空操作（no-op）— 需要手动移除它们，或者重新安装并再次运行 `Claude Todos: Install Session Hook`。

## 贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md) 获取冒烟测试（smoke-test）清单和手动测试计划。

## 许可证

[MIT](LICENSE)
