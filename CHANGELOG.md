# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.16.0] - 2026-07-22

### Added
- **JetBrains plugin (beta).** The panel now runs inside IntelliJ-platform IDEs (IntelliJ IDEA, PyCharm, WebStorm, Rider, … 2024.2+): the same live agent tree, per-task timings, model badges, tokens/context/cache and 7-day dashboard, rendered via JCEF and fed by a Node sidecar sharing the exact same parser as the VS Code extension. Native integrations with parity: toasts (idle / all-complete / awaiting-your-answer) with the same gates, click-a-task opens the transcript at the line, native session picker, and hook installation that is idempotent with the VS Code extension (same script, same path — installing from one IDE is a no-op in the other). Requires Node.js on PATH (which Claude Code users already have). Distributed as `claude-todos-jetbrains-X.Y.Z.zip` attached to GitHub Releases; JetBrains Marketplace listing pending initial review. Validated end-to-end in a real IDE (theme following, live sessions, sub-agent cards, 1M-window sessions).
- **Shared core.** Internally, the orchestration layer was extracted into a host-agnostic `SessionCore` + JSON-lines sidecar consumed by both IDEs — zero behavior change for the VS Code extension, one parser serving every host. Protocol gained optional request correlation ids.

### Fixed
- Session matching now normalizes path separators (hosts that report forward-slash paths on Windows — like the IntelliJ `basePath` — matched no sessions).
- JetBrains: panel renders during project indexing (DumbAware); session picker no longer repeats the short id for untitled sessions.

## [0.15.0] - 2026-07-17

### Added
- **Model badge per agent.** Each agent header now shows the model it is currently running (e.g. `opus-4-8`) — always on the main agent, and on sub-agents only when their model differs from the main's, so the exception is what stands out. The badge reflects the model of the agent's most recent transcript message, so silent model changes and automatic fallbacks become visible immediately; a tooltip lists every model the agent used. Reuses the token data the panel already parses (no extra I/O). Roadmap item 20, from issues [#28986](https://github.com/anthropics/claude-code/issues/28986), [#76018](https://github.com/anthropics/claude-code/issues/76018), [#77367](https://github.com/anthropics/claude-code/issues/77367) and [#76607](https://github.com/anthropics/claude-code/issues/76607) (the native panel shows the wrong model for sub-agents). Spec: `docs/specs/2026-07-17-model-badge-design.md`.
- **"Awaiting your answer" notification.** When the agent asks a question (`AskUserQuestion`) or presents a plan for approval (`ExitPlanMode`) and the window is unfocused, a toast fires immediately ("waiting for your answer" / "plan awaiting approval") instead of waiting for the idle timer — the wait has an explicit signal in the transcript, so the notification is instant and specific. The pending state is detected from the main transcript (a wait tool call without its matching result — an answer, a rejection, or the harness timeout all clear it), suppresses the generic idle toast while open, and rearms once resolved. Opt-in via the existing `claudeTodos.notifications` setting; localized in en/pt-br/es. Roadmap item 22, from issues [#57230](https://github.com/anthropics/claude-code/issues/57230), [#26581](https://github.com/anthropics/claude-code/issues/26581) and [#8985](https://github.com/anthropics/claude-code/issues/8985) (the native `Notification` hook doesn't fire in the VS Code extension). Spec: `docs/specs/2026-07-17-awaiting-input-notification-design.md`.

## [0.14.0] - 2026-07-16

### Added
- **Stale-list hint.** When the main agent stops updating its task list for 5+ minutes while sub-agents are still running, a subtle note under the main agent's header says how long the list has been static ("list not updated for 17m"), with a tooltip explaining that actual progress may be in the sub-agent cards below. The panel stays a faithful mirror of the transcript — nothing is hidden or "corrected". Powered by a new `todosUpdatedAt` field extracted from the transcript (timestamp of the last `TodoWrite` snapshot, or the newest `TaskCreate`/`TaskUpdate` event); old transcripts without timestamps simply never show the hint. Roadmap item 19, born from a real session where an orchestrator created 8 tasks and delegated everything without ever updating the list.
- **Getting-started walkthrough.** A native VS Code walkthrough ("Get started with Claude Todos") guides new users through the five steps that matter: install the session hook, start a Claude Code session, open the panel (`Ctrl+Alt+T`), choose the session (`Ctrl+Alt+S`) and explore the agent tree + usage dashboard. Command steps complete automatically when the command runs. Localized in en/pt-br/es.

### Changed
- **README repositioned around agent observability.** All three READMEs (pt/en/es) now lead with what the extension actually shows — live agent tree, per-task timings, tokens/context/cache, 7-day dashboard, notifications, clickable tasks — instead of only the todo list. Install section organized per editor (VS Code → Marketplace; Cursor/Windsurf/VSCodium → Open VSX; `.vsix` fallback), dynamic version badges for both marketplaces, and the commands/settings tables are finally complete. Marketplace listing updated accordingly (description + new keywords: observability, monitoring, token usage, dashboard, multi-agent).

## [0.13.0] - 2026-07-16

### Added
- **Multi-root workspace support.** The panel now follows the most recently active session across **all** workspace folders instead of only the first one — sessions started in any folder of a multi-root workspace show up automatically. A new `claudeTodos.activeFolder` setting (folder name or absolute path; empty = automatic) pins the panel to one folder; an invalid value safely falls back to automatic. The session picker disambiguates entries with the folder's basename when more than one folder is in play, and both task-click-to-transcript and the 7-day usage block resolve the folder from the displayed session. Addresses [#12808](https://github.com/anthropics/claude-code/issues/12808), [#58044](https://github.com/anthropics/claude-code/issues/58044), [#36949](https://github.com/anthropics/claude-code/issues/36949) and [#18814](https://github.com/anthropics/claude-code/issues/18814). Spec: `docs/specs/2026-07-15-multi-root-design.md`.
- **"Choose Session" command and keyboard shortcut.** The session picker — previously reachable only through the panel button — is now a real command (`Claude Todos: Choose Session`) available from the Command Palette and bound to `Ctrl+Alt+S` (`Cmd+Alt+S` on macOS).
- **7-day usage by agent type.** The "Last 7 days · this project" block gained a toggle that regroups the aggregate by agent type (Main, Explore, general-purpose, …) instead of by model, sorted by total tokens. Sub-agent types come from the `agent-*.meta.json` files; sub-agents without one land in a generic "Sub-agent" bucket. Completes the weekly half of [#59412](https://github.com/anthropics/claude-code/issues/59412) (the per-session half shipped in 0.9.0).

### Changed
- The session bridge file is now pruned on activation: records older than 30 days are dropped (sessions themselves were never affected — the picker already ignored entries without a transcript). Pruning skips the write entirely when there is nothing to remove.

### Added
- **Clickable tasks → jump to the transcript.** Clicking a task in the panel opens the agent's `.jsonl` transcript in the editor with the line of the task's last status change selected — for the main agent and for sub-agents (each opens its own transcript). Works with both task schemas (`TodoWrite` snapshots and `TaskCreate`/`TaskUpdate` streams). Tasks whose origin can't be determined (e.g., very old transcripts without timestamps) simply stay non-clickable. Addresses the request in [anthropics/claude-code#61543](https://github.com/anthropics/claude-code/issues/61543). A readable transcript viewer building on this same infrastructure is planned separately.

## [0.11.0] - 2026-07-14

### Added
- **Project usage block ("Last 7 days · this project").** A collapsed-by-default section below the session token table aggregates usage across every workspace session active in the last 7 days: session count, tokens per model, and the aggregated cache-reuse bar with the usual traffic light. Aggregation is lazy — it only runs when you expand the block — and memoized per transcript file, so re-opening it is near-instant (real-world measurement: 1.5s cold → ~18ms warm). The session snapshot protocol is untouched; the block uses its own request/response message pair. Localized in en/pt-br/es. Spec: `docs/specs/2026-07-14-project-usage-dashboard-design.md`.

### Fixed
- Synthetic API-error entries (`<synthetic>` model, zero usage) no longer show up as a garbage row in the token tables, and no longer zero the context badge when a session ends on an API error. This also fixes the latent issue on the per-session table.

## [0.10.0] - 2026-07-14

### Added
- **Session notifications.** A native VS Code toast fires when the tracked session goes idle after sustained activity (the agent stopped and is waiting for you — covers both "finished" and "stuck on a question") or when the main agent completes all its tasks. Anti-noise rules: at least 60s of continuous activity before "idle" applies, 45s of silence to fire, one notification per activity cycle, and the completion toast only fires on the transition. Toasts only appear while the VS Code window is unfocused; the detection itself always runs. Buttons: **Open panel** and **Don't notify** (turns the feature off globally). Controlled by the new `claudeTodos.notifications` setting (default on), localized in en/pt-br/es. Detection is a pure, fully unit-tested state machine fed by the existing file watcher plus a 10s silence timer that only runs while a notification is still possible (zero cost at rest). Spec: `docs/specs/2026-07-14-session-notifications-design.md`.

## [0.9.0] - 2026-07-13

### Added
- **Live agent tree ("mission control").** The panel now renders the session as an expandable tree — main agent → sub-agents → nested agents — instead of a flat list. Each node shows a colored agent-type badge (Explore green, Plan yellow, general-purpose blue, others neutral) and the agent's total token count (input + output + cache). Layout uses VS Code-style indentation rails; collapsing a node hides its whole subtree; the main agent and running sub-agents start expanded. Strings localized in en/pt-br/es. Spec: `docs/specs/2026-07-11-agent-tree-design.md`.
- Sub-agent matching now uses the exact `toolUseId` from the `agent-*.meta.json` files Claude Code writes next to each sub-agent transcript, instead of the exact-prompt heuristic. Old sessions without meta files fall back to the previous prompt matching, per file. Nested agents (`spawnDepth ≥ 2`), previously discarded by design, are now parented to whichever agent dispatched them.

### Fixed
- Nested agents whose dispatch already had a `tool_result` were misclassified as rejected and dropped: sub-agent transcripts never carry the `toolUseResult` enrichment (verified 0/32 in real data), so a present result there now means completed.
- In the legacy prompt-matching fallback, a rejected invocation could consume the prompt match of a live retry with an identical prompt, hiding the real agent from the panel.

## [0.8.2] - 2026-07-10

### Fixed
- Sub-agents dispatched without a `name` (only the required `description`) are shown in the panel again. Recent Claude Code versions stopped setting the optional `name` on `Agent` tool dispatches, so the panel silently dropped every sub-agent; the parser now falls back to `description` as the display label. The fix (`76f937f`) had landed on `master` right after 0.8.1 shipped — this release finally packages it.

## [0.8.1] - 2026-06-23

### Security
- Bumped the transitive `undici` dependency to 7.28.0, clearing 6 Dependabot advisories (2 high, 2 moderate, 2 low). `undici` is a build/dev-only dependency and is never bundled into the published extension, so end users were not exposed; this is preventive hygiene.

### Changed
- Added a `.gitattributes` enforcing LF line endings, preventing accidental CRLF commits from Windows working trees. No change to the published artifact.

## [0.8.0] - 2026-06-23

### Added
- Internationalization (i18n) of the whole extension UI in **English** (base/fallback), **Portuguese (Brazil)** and **Spanish**. By default the UI follows VS Code's display language; a new `claudeTodos.language` setting allows forcing a specific language (`auto` | `en` | `pt-br` | `es`). Coverage spans all three surfaces: the webview panel (labels, empty states, error messages, time units, cache legend, status `aria-label`s), the extension runtime (notifications, session quick pick, hook prompts) and the manifest (command titles and setting descriptions via `package.nls*.json`). Changing the language updates the panel live, without reloading the window.

### Changed
- The panel UI, previously a mix of English and Portuguese strings, is now fully and consistently localized through a single typed message catalog with automatic fallback to English.

### Note
- Command titles shown in the Command Palette follow VS Code's display language only; the `claudeTodos.language` override does not affect them (a VS Code limitation: `package.nls.*` is resolved by the host at startup, before the extension's settings are available).

## [0.7.1] - 2026-06-23

### Changed
- Marketplace discoverability: added the `AI` and `Visualization` categories (previously only `Other`) and broadened the keywords (`task tracking`, `agent`, `subagent`) so the extension surfaces under the relevant Marketplace filters and searches.

### Added
- Animated GIF at the top of the READMEs (pt/en/es) showing the panel updating live — the main agent and its sub-agents with tasks advancing `pending → in_progress → completed`, including per-task timings.

## [0.7.0] - 2026-06-16

### Added
- Task execution time in the panel. Each `completed` task shows how long it took, and the `in_progress` task shows a live stopwatch (`⏱`, ticking every second). The agent header shows the real total elapsed time plus a countdown estimate of the time remaining — always labelled as an estimate. Times are derived from transcript timestamps; because Claude Code records no sub-progress, there is no per-task percentage (it would be a misleading guess). Timing resets on each new activation of a task, so rounds that reuse the same description don't leak time into each other.

### Changed
- Panel visual refresh, theme-aware. SVG icons replace the emoji, statuses are color-coded, the active item is highlighted and pulses, the elapsed/remaining times are shown as metric cards, and overall hierarchy and spacing are tightened. Everything is driven by `--vscode-*` variables (so it adapts to dark/light/high-contrast) and respects `prefers-reduced-motion`. No new dependency.

## [0.6.0] - 2026-06-05

### Added
- The usage block (token table + context indicator + cache efficiency) now shows as soon as a session has any activity, even before the agent calls `TodoWrite`. Previously the panel fell back to the empty state until the first todo appeared. When there are no todos yet, the agent list is replaced by a light **"Sessão ativa — aguardando tasks"** note while the usage block stays visible. This decouples "has a session" from "has a todo": `snapshotService.build()` synthesizes the main agent from the transcript to feed the usage parser, and the panel no longer gates on a non-empty agent list.

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
