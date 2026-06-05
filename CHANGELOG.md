# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.0] - 2026-06-05

### Added
- Cache-efficiency indicator in the Tokens panel: a `{pct}% reaproveitado` badge plus a thin stacked bar (cache read / cache creation / new input) with a legend, showing how much of the session's input came from the prompt cache. The reuse rate is aggregated across the whole session (main agent + sub-agents) and color-coded as a traffic light (green ≥75%, amber 50–75%, red <50%). It coexists with the context indicator; the token table is unchanged.

### Fixed
- Context window detection. Models that support a 1M window but whose id omits the `[1m]` suffix (e.g. `claude-opus-4-8`, `claude-sonnet-4-6`) were treated as 200k, so a large session showed a false `100% / 200k`. Detection now recognizes the opus/sonnet generation-4+ family and also elevates to 1M whenever the observed context already exceeds 200k. The exact window size is not available in the transcript or hooks, so this remains a heuristic.

## [0.4.0] - 2026-06-04

### Added
- Context usage indicator in the Tokens panel: a `{pct}% ctx` badge plus a thin progress bar showing the current context size against the model's window (200k, or 1M when the model advertises it). The color is a traffic light — green below 60%, amber 60–85%, red at 85% and above — so an approaching auto-compact is visible at a glance. The size is read from the last message's `usage` in the main transcript (input + cache; output excluded); sub-agents are not counted, since each has its own context.

### Fixed
- Hook robustness on Windows. The session-start hook now reads stdin with a 2-second timeout, so it can no longer hang indefinitely if the parent process never closes the stream. Writes to `~/.claude/settings.json` and the bridge `sessions.json` are now atomic (temp file + rename), preventing corruption from a crash or concurrent write mid-write.

## [0.3.0] - 2026-06-02

### Added
- Token usage table at the top of the panel. One row per model used in the session (Input / Output / Cache columns) with a **Total** row, and a toggle to switch to a per-agent breakdown. It counts the whole session — the main agent plus every sub-agent — by reading `message.usage` from the transcripts. Tokens only; no cost estimate.
- `UsageParser` reads token usage per agent file and aggregates by model. Sidechain entries are ignored in the main transcript so sub-agent turns (counted from their own `agent-*.jsonl`) are never double-counted.

## [0.2.1] - 2026-05-23

### Fixed
- Parser now supports the new `TaskCreate` / `TaskUpdate` tool schema used by Claude Code when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled. The legacy `TodoWrite` snapshot format is still recognized; whichever schema produced the most recent event is used.
- Hook script is now copied to a stable path under `~/.claude/.vscode-todos-bridge/hook.js` instead of being registered from the versioned extension directory. Extension updates no longer leave orphan hook commands pointing at deleted folders.
- Stale hooks from older versions (e.g. `carlosjunior1992.claude-todos-0.1.0/...`) are swept from `~/.claude/settings.json` on activation. User hooks for unrelated tools are preserved.

## [0.2.0] - 2026-05-22

### Added
- Sub-agents are now rendered in the panel alongside the main agent, each with its own todo list and a `running` badge while active.
- Session picker (QuickPick) to choose which Claude Code session the panel follows; the pinned choice is persisted per workspace.
- Session title header and a divider separating the active session from history.
- README available in Portuguese (primary), English and Spanish.

### Changed
- Build toolchain updated: Vite 7, Vitest 3, esbuild 0.25 and `@sveltejs/vite-plugin-svelte` 6. Clears all `npm audit` advisories — these were dev-only dependencies and were never bundled into the published `.vsix`.

### Fixed
- Parser: encode dots in `cwd` as hyphens to match Claude Code's project-directory encoding.
- Parser: dedupe sub-agents by `agentId` to avoid a webview crash.
- Security: the webview CSP nonce now uses `crypto.randomBytes` instead of `Math.random()`.
- Security: `sessionId` is validated against a safe character set before being used to build filesystem paths, preventing path traversal.

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
