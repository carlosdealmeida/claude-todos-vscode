# Contributing

## Setup

```bash
npm install
npm test
npm run build
```

Tests use [Vitest](https://vitest.dev/). Build uses esbuild (extension + hook) and Vite (Svelte webview).

## Project layout

```
src/
  extension.ts             # entry point — wires services, providers, commands
  hooks/sessionStart.ts    # standalone hook script, bundled separately
  services/
    bridgeFile.ts          # ~/.claude/.vscode-todos-bridge/sessions.json reader/writer
    todosParser.ts         # reads TodoWrite from ~/.claude/projects/*.jsonl
    sessionResolver.ts     # workspace cwd -> session candidates from bridge
    snapshotService.ts     # composes resolver + parser, skips ghost sessions
    todosWatcher.ts        # fs.watch on bridge + projects dirs
    hookInstaller.ts       # idempotent edits to ~/.claude/settings.json
    projectDir.ts          # encodes cwd to Claude Code's project dir name
  providers/
    todosViewProvider.ts   # Activity Bar WebviewView
    todosPanelProvider.ts  # Editor WebviewPanel
  webview/                 # Svelte 5 webview (Vite build)
tests/services/            # unit tests, one per service
```

## Manual smoke test checklist

Run `F5` from VSCode (or install the produced `.vsix`) and verify:

- [ ] Activity Bar shows the Claude Todos icon
- [ ] Clicking opens the view
- [ ] First launch prompts to install hooks
- [ ] After accepting, `~/.claude/settings.json` contains both `SessionStart` and `UserPromptSubmit` entries pointing at this extension's `sessionStart.js`
- [ ] In a fresh extension host window, run `claude` in a terminal — bridge file gets a new record
- [ ] Use `TodoWrite` in the Claude Code session — view updates within ~500ms
- [ ] `Ctrl+Alt+T` opens the editor panel; both view and panel update in sync
- [ ] Toggle VSCode theme dark↔light → colors swap correctly
- [ ] Close folder → view shows empty state
- [ ] Open a different folder with no Claude session → "Waiting for a Claude Code session"
- [ ] Two VSCode windows, two different folders, two `claude` sessions → each sees only its own todos
- [ ] Ghost session in bridge (entry whose transcript doesn't exist) is skipped, the next valid one is used

## Releasing

See [RELEASING.md](RELEASING.md) for the full process — tag a `v*` release,
the workflow builds the `.vsix`, then it's uploaded to the Marketplace manually.

## Code style

- Default to no comments. Only add one when the *why* is non-obvious.
- Prefer tight, dependency-free services. The reason the codebase has no test framework helpers (factories, fixtures, etc.) is that each service is small enough to test directly.
- TDD when adding a service: write the failing test, then the implementation, then the green check.
