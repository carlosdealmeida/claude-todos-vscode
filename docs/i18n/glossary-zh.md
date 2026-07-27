# Chinese translation glossary (zh-CN / zh-TW)

This is the terminology reference for the Chinese translations of Claude Todos.
Every string in the UI, the marketplace metadata and the READMEs must use the
terms below consistently.

**The translations were produced by AI and have not yet been reviewed by a native
speaker.** Corrections are very welcome — this file is the best place to start.
Fixing a term here and in the catalogs it appears in is more valuable than fixing
individual strings, because inconsistent terminology is what makes a translation
feel careless.

## Why two separate catalogs

Simplified and Traditional Chinese are not a character-level conversion of one
another. Beyond the script itself, technical vocabulary genuinely differs:
`软件` / `軟體`, `程序` / `程式`, `默认` / `預設`. Automatic converters get the
common cases right and the domain-specific ones wrong — and nearly every term in
this project is domain-specific. So `zh-cn` and `zh-tw` are maintained as two
complete, independent catalogs.

## Terms

| Term | zh-CN | zh-TW | Notes |
|---|---|---|---|
| session | 会话 | 工作階段 | A Claude Code session |
| task | 任务 | 任務 | |
| todo | 待办事项 | 待辦事項 | |
| agent | 智能体 | 智慧體 | AI agent, not a network proxy — avoid 代理 |
| sub-agent | 子智能体 | 子智慧體 | |
| token | 令牌 | 權杖 | LLM token |
| cache | 缓存 | 快取 | |
| context | 上下文 | 上下文 | Same in both |
| hook | 钩子 | 掛鉤 | The Claude Code settings hook |
| transcript | 对话记录 | 對話記錄 | The `.jsonl` file Claude Code writes |
| workspace | 工作区 | 工作區 | |
| panel | 面板 | 面板 | Same in both |
| elapsed | 已用时间 | 已用時間 | |
| remaining | 剩余 | 剩餘 | |
| estimate | 预估 | 預估 | |
| idle | 空闲 | 閒置 | |
| plan | 计划 | 計畫 | Claude Code's plan mode |
| default | 默认 | 預設 | |
| settings | 设置 | 設定 | |
| install | 安装 | 安裝 | |
| refresh | 刷新 | 重新整理 | |
| track (verb) | 跟踪 | 追蹤 | Tracking a session |
| project | 项目 | 專案 | |
| folder | 文件夹 | 資料夾 | |
| file | 文件 | 檔案 | `文件` significa "documento" em zh-TW — não reusar |
| orchestrator | 编排者 | 協調者 | Used in the READMEs (the agent driving sub-agents) |

## Never translated

Proper nouns and identifiers stay in their original form. Translating them breaks
the correspondence with what users actually see in the terminal and in the
official documentation:

- `Claude Code`, `Claude Todos`
- `~/.claude/settings.json`
- `SessionStart`, `UserPromptSubmit`, `TodoWrite`
- `toast` — kept in English in the Chinese text; a deliberate choice, not an
  oversight
- Command Palette command titles — this rule applies from zh onward. The
  `pt-br` and `es` catalogs predate this policy and DO translate the command
  titles; that inconsistency is known and not meant to be silently copied
  forward into new locales.
- Keyboard shortcuts

## Where the strings live

| File | Scope |
|---|---|
| `src/i18n/messages.ts` | Panel UI (73 keys per locale) |
| `package.nls.zh-cn.json`, `package.nls.zh-tw.json` | VS Code commands, settings, walkthrough (29 keys) |
| `jetbrains/src/main/kotlin/.../NotifyMessages.kt` | JetBrains native toasts and prompts (18 keys) |
| `README.zh-cn.md`, `README.zh-tw.md` | GitHub documentation |
| `jetbrains/src/main/resources/META-INF/plugin.xml` | Marketplace description (zh-CN only) |

Key parity across locales is enforced by the test suite, so a missing key fails
CI. Wording quality is not — that is what human review is for.
