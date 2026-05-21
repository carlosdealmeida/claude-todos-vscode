# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-05-21

Initial release.

### Added
- Activity Bar view showing the current Claude Code session's `TodoWrite` state, scoped to the workspace open in the VSCode window.
- Editor-area panel (`Ctrl+Alt+T` / `Cmd+Alt+T`) with the same view.
- SessionStart + UserPromptSubmit hooks installed automatically (with prompt) in `~/.claude/settings.json`. UserPromptSubmit captures sessions that were already running when the extension was installed — they appear on the next message.
- File watcher on `~/.claude/projects` (recursive when supported) and the bridge file, with 150 ms debounce.
- Reads the latest main-thread `TodoWrite` event from `~/.claude/projects/{cwd-encoded}/{sessionId}.jsonl`.
- Skips ghost bridge entries with no transcript on disk.
- Case-insensitive `cwd` matching on Windows.

### Known limitations
- Sub-agent (`isSidechain`) todos are not yet rendered.
- No support for multi-root workspaces — only the first workspace folder is used.
