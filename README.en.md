# Claude Todos for VSCode and JetBrains

[Português](README.md) · **English** · [Español](README.es.md) · [简体中文](README.zh-cn.md) · [繁體中文](README.zh-tw.md)

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/CarlosJunior1992.claude-todos.svg?label=VS%20Code%20Marketplace&color=007ACC&style=flat)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos)
[![Open VSX](https://img.shields.io/open-vsx/v/CarlosJunior1992/claude-todos?label=Open%20VSX&color=c160ef)](https://open-vsx.org/extension/CarlosJunior1992/claude-todos)
[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/33074-claude-todos?label=JetBrains%20Marketplace&color=fe2857)](https://plugins.jetbrains.com/plugin/33074-claude-todos)
[![CI](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Observability for your Claude Code agents** — tasks, agent tree, timings, tokens and cache, live, scoped to the workspace open in the current VSCode window. Everything is 100% local: two windows on different projects never see each other's data.

![Claude Todos panel: main agent and sub-agents with tasks advancing from pending → in_progress → completed live, with per-task timings](screenshots/claude-todos-demo.gif)

> ⚠️ **On Claude Code 2.1.233 or newer?** On the new models, the task tools (`TodoWrite`, `TaskCreate`) ship **turned off by default**, and this panel's task list stays empty until you turn them back on — see [Install](#install).

## What you get

- **Live agent tree ("mission control")** — main → sub-agents → nested agents, with an agent-type badge (Explore, Plan, general-purpose…), status and per-agent tokens.
- **Tasks in real time** — each item transitions `pending → in_progress → completed` as the agent works; clicking a task opens the transcript at the line of its last status change. If the orchestrator stops updating its list while sub-agents keep running, the panel flags the staleness.
- **Per-task timings** — duration of every completed task, live timer on the one in progress, and a (labeled) estimate of the remainder.
- **Tokens, context and cache** — table by model or by agent, context-window indicator with a traffic light, and cache efficiency (reused × created × new).
- **"Last 7 days" dashboard** — aggregated project usage, by model and by agent type.
- **Notifications** — a toast when the session goes idle waiting for you, or when all tasks complete (only while the window is unfocused).
- **Pending questions** — a strip at the top of the panel lists what the session is waiting on (an agent question or a plan awaiting approval), regardless of window focus; clicking jumps to that line in the transcript.
- **Live sessions and real names** — the session picker marks with "● live" the sessions whose Claude Code process is still running, and Auto mode prioritizes a live session; names set via `/session-name` show up instead of the derived title.
- **UI in 5 languages** — en, pt-br, es, zh-cn and zh-tw; follows VS Code's display language, with a setting override.

## How it works

![Claude Todos panel updating live during a Claude Code session](screenshots/panel-live-during-smoke-test.png)

The **Claude Todos** panel (Activity Bar, on the left) reads the transcripts Claude Code already writes to disk — no proxy, no API — and reflects everything in real time as the agent works.

It does not matter **where** `claude` is running: VSCode's integrated terminal, any external terminal (Windows Terminal, iTerm, gnome-terminal), or the Claude Code CLI in a separate window. As long as the session's working directory matches the workspace open in VSCode, the panel reflects it.

Tasks come from the `TodoWrite` and `TaskCreate` calls the agent writes to the transcript. The agent tree, tokens, context, notifications and pending questions come from the rest of the transcript and do not depend on them.

## Install

| Editor | Where |
|---|---|
| VS Code | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos) |
| Cursor · Windsurf · VSCodium | [Open VSX](https://open-vsx.org/extension/CarlosJunior1992/claude-todos) |
| IntelliJ IDEA · PyCharm · WebStorm · Rider · … (2024.2+) | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33074-claude-todos) |
| Any (offline) | `.vsix` (VS Code) / `.zip` (JetBrains) — [GitHub Release](https://github.com/carlosdealmeida/claude-todos-vscode/releases) |

> **JetBrains plugin:** the same panel runs inside JetBrains IDEs — same agent tree,
> timings, tokens and dashboard, with native toasts, click-a-task to open the transcript
> and a session picker. Requires **Node.js on PATH** (Claude Code users already have it).
> The hook is shared: installing it from one IDE also covers the other.

1. Install the extension (table above). The **"Get started with Claude Todos"** guide shows up on the editor's *Welcome/Get Started* page and walks you through the steps below.
2. On first launch, accept the prompt to install hooks in `~/.claude/settings.json` — the extension adds two: `SessionStart` and `UserPromptSubmit`. Existing hooks are preserved.
3. Open a folder and run `claude` in any terminal. The **Claude Todos** view (Activity Bar) populates as soon as the session has activity.

**Sessions that were already running** when you installed the hooks are picked up on the next message you send to them (that's what `UserPromptSubmit` is for). New sessions are tracked immediately.

### Turn the task tools back on (Claude Code 2.1.233 or newer)

Since version **2.1.233** (August 14, 2026), Claude Code turns off the task-list tools — `TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList` and `TaskGet` — by default when the model is Opus 4.8, Sonnet 5, Fable 5, Mythos 5 or newer. This is Anthropic's decision: it is in the [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) and was confirmed as intentional in [#86929](https://github.com/anthropics/claude-code/issues/86929); the issue tracking it is [#80015](https://github.com/anthropics/claude-code/issues/80015). Without these tools the agent records no tasks in the transcript, and this panel's task list stays empty. The agent tree, tokens, context, cache, notifications and pending questions keep working.

To turn them back on, add the `CLAUDE_CODE_ENABLE_TODO_TOOLS` variable to `~/.claude/settings.json`. If an `env` key already exists, add the line inside it:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"
  }
}
```

The `env` key in `settings.json` applies to every Claude Code session, on any model and surface (terminal, official VS Code extension). Restart open sessions: the tool set is fixed when a session starts. If Claude tells you it "has no TaskCreate or TodoWrite tool", this is why. The extension does not change this setting for you.

## Commands

| Command | Default keybinding |
|---|---|
| Claude Todos: Open in Editor | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Claude Todos: Choose Session | `Ctrl+Alt+S` / `Cmd+Alt+S` |
| Claude Todos: Refresh | — |
| Claude Todos: Install Session Hook | — |

## Settings

| Setting | Default | Effect |
|---|---|---|
| `claudeTodos.claudeDir` | `""` (auto-detect from `os.homedir()`) | Override the `~/.claude` location. |
| `claudeTodos.autoInstallHook` | `true` | Show the first-run prompt asking to install the hooks. |
| `claudeTodos.language` | `auto` | Panel UI language (`auto` \| `en` \| `pt-br` \| `es` \| `zh-cn` \| `zh-tw`). |
| `claudeTodos.notifications` | `true` | Toast when the session goes idle or completes all tasks (window unfocused). |
| `claudeTodos.activeFolder` | `""` | Multi-root: workspace folder to track; empty = follow the most active session. |

## Privacy and data flow

This extension is **fully local**. Nothing is sent to any server.

| File | How it is accessed | Why |
|---|---|---|
| `~/.claude/settings.json` | Read + written (only with your permission) | Adds two hook commands under `hooks.SessionStart` and `hooks.UserPromptSubmit` and, when you click **Enable task tools**, the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key. Other hooks and settings are preserved; an invalid file is never overwritten. |
| `~/.claude/.vscode-todos-bridge/sessions.json` | Written by the bundled hook script | Records `{cwd, sessionId, terminalPid, startedAt}` so the extension knows which Claude session belongs to which VSCode window. Capped at 200 entries. |
| `~/.claude/projects/{cwd-encoded}/…` | Read-only | Session and sub-agent transcripts (`.jsonl` + `.meta.json`) written by Claude Code itself — the source of tasks, tree, timings and tokens. |
| `~/.claude/todos/` | Not touched | Legacy Claude Code 1.x location. Ignored. |

The extension never modifies your transcripts and never deletes anything.

## Requirements

- VSCode 1.85 or newer
- Claude Code 2.x (any version that writes transcripts to `~/.claude/projects/`). From **2.1.233** on, with the new models, the task list requires `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` — see [Install](#install).
- Node.js 20+ on `PATH` (the hook script is a small Node program)

## Building from source

```bash
git clone <repo-url>
cd claude-todos-vscode
npm install
npm test         # vitest
npm run build    # esbuild for the extension + hook, vite for the Svelte webview
npx vsce package # produces claude-todos-<version>.vsix
```

To run the extension in a development host: open the folder in VSCode and press F5 (uses `.vscode/launch.json`).

## Known limitations

- The hook script must stay reachable at the path stored in `~/.claude/settings.json`. If you delete the extension manually without uninstalling it, those hook commands remain as no-ops — remove them by hand or reinstall and run `Claude Todos: Install Session Hook` again.
- If Claude Code's task tools are off (the default since 2.1.233 on the new models), the list stays empty and the panel shows "Active session — waiting for tasks" even while the agent works. The rest of the panel does not depend on them. How to turn them on: [Install](#install).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the smoke-test checklist and the manual test plan.

## License

[MIT](LICENSE)
