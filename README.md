# Claude Todos for VSCode

Live view of `TodoWrite` from Claude Code, scoped to the workspace open in this VSCode window.

## How it works

When you run `claude` in your terminal, a SessionStart hook records the mapping
`{cwd, session_id}` in `~/.claude/.vscode-todos-bridge/sessions.json`. This
extension reads that bridge file to figure out which session belongs to which
VSCode window — so two windows in different projects never get confused.

## Setup

1. Install the extension.
2. The first time you open VSCode, the extension will prompt to install a
   SessionStart hook in `~/.claude/settings.json`. Accept it.
3. Open a folder, run `claude` in its terminal, and watch the todos appear.

## Commands

- `Claude Todos: Open in Editor` (`Ctrl+Alt+T` / `Cmd+Alt+T`) — open the todos in a side-by-side editor panel.
- `Claude Todos: Refresh` — manual refresh.
- `Claude Todos: Install Session Hook` — install the hook (also runs automatically on first launch).

## Settings

- `claudeTodos.claudeDir` — override `~/.claude` path.
- `claudeTodos.autoInstallHook` — disable the first-run prompt.

## Smoke test checklist

Open `Run Extension` from `.vscode/launch.json` and verify:

- [ ] Activity Bar shows the Claude Todos icon
- [ ] Clicking opens the view
- [ ] First launch prompts to install hook
- [ ] After accepting, `~/.claude/settings.json` contains the SessionStart hook
- [ ] In a fresh extension host window, run `claude` in a terminal — bridge file gets a new record
- [ ] Use `TodoWrite` in the Claude Code session (ask Claude to plan something) — view updates within ~500ms
- [ ] `Ctrl+Alt+T` opens the editor panel
- [ ] Both view and panel update on file changes
- [ ] Toggle VSCode theme dark→light → colors swap correctly
- [ ] Close folder → view shows empty state
- [ ] Open different folder with no session → shows "Waiting for a Claude Code session"
- [ ] Two VSCode windows, two different folders, two `claude` sessions → each sees only its own todos
