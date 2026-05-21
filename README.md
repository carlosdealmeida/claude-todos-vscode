# Claude Todos for VSCode

<!--
Marketplace badges. Replace TODO-PUBLISHER and TODO-OWNER once you've
created the marketplace publisher and the GitHub repo.
-->
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/TODO-PUBLISHER.claude-todos?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=TODO-PUBLISHER.claude-todos)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/TODO-PUBLISHER.claude-todos)](https://marketplace.visualstudio.com/items?itemName=TODO-PUBLISHER.claude-todos)
[![CI](https://github.com/TODO-OWNER/claude-todos-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/TODO-OWNER/claude-todos-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Live view of [`TodoWrite`](https://docs.anthropic.com/en/docs/claude-code/sub-agents) from Claude Code, scoped to the workspace open in the current VSCode window. Two VSCode windows in different projects never see each other's todos.

## Install

1. Install the extension (`.vsix` file or VSCode Marketplace once published).
2. On first launch, accept the prompt to install hooks in `~/.claude/settings.json` — the extension adds two: `SessionStart` and `UserPromptSubmit`. Existing hooks are preserved.
3. Open a folder and run `claude` in any terminal. The **Claude Todos** view (Activity Bar) populates as soon as Claude calls `TodoWrite`.

**Sessions that were already running** when you installed the hooks are picked up on the next message you send to them (that's what `UserPromptSubmit` is for). New sessions are tracked immediately.

## Commands

| Command | Default keybinding |
|---|---|
| Claude Todos: Open in Editor | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Claude Todos: Refresh | — |
| Claude Todos: Install Session Hook | — |

## Settings

| Setting | Default | Effect |
|---|---|---|
| `claudeTodos.claudeDir` | `""` (auto-detect from `os.homedir()`) | Override the `~/.claude` location. |
| `claudeTodos.autoInstallHook` | `true` | Show the first-run prompt asking to install the hooks. |

## Privacy and data flow

This extension is **fully local**. Nothing is sent to a server.

| File | Touched how | Why |
|---|---|---|
| `~/.claude/settings.json` | Read + written (once, with permission) | Adds two hook commands under `hooks.SessionStart` and `hooks.UserPromptSubmit`. Other hooks and settings are preserved. |
| `~/.claude/.vscode-todos-bridge/sessions.json` | Written by the bundled hook script | Records `{cwd, sessionId, terminalPid, startedAt}` so the extension knows which Claude session belongs to which VSCode window. Capped at 200 entries. |
| `~/.claude/projects/{cwd-encoded}/{sessionId}.jsonl` | Read only | Claude Code's own session transcript. The extension scans it from the end to find the latest `TodoWrite` event. |
| `~/.claude/todos/` | Not touched | Legacy location from Claude Code 1.x. Ignored. |

The extension never modifies your transcripts and never deletes anything.

## Requirements

- VSCode 1.85 or newer
- Claude Code 2.x (anything that writes transcripts to `~/.claude/projects/`)
- Node.js 20+ on `PATH` (the hook script is a small Node program)

## Building from source

```bash
git clone <repo-url>
cd claude-todos-vscode
npm install
npm test         # vitest — 36 tests across 6 service suites
npm run build    # esbuild for the extension + hook, vite for the Svelte webview
npx vsce package # produces claude-todos-<version>.vsix
```

To run the extension in a development host: open the folder in VSCode and press F5 (uses `.vscode/launch.json`).

## Known limitations

- Sub-agent (`isSidechain`) todos are recognized in the transcript but not yet rendered — only the main thread's `TodoWrite` is shown.
- Multi-root workspaces use only the first folder.
- The hook script must be reachable from the path stored in `~/.claude/settings.json`. If you delete the extension manually without uninstalling, those hook commands stay behind as no-ops — remove them by hand or reinstall and use `Claude Todos: Install Session Hook` again.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the smoke-test checklist and the manual test plan.

## License

[MIT](LICENSE)
