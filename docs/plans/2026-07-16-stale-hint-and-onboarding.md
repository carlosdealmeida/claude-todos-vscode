# Fase 19+18: hint de lista defasada + onboarding/reposicionamento — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (19) sinalizar lista defasada no cabeçalho do main quando sub-agents seguem ativos; (18) walkthrough nativo de onboarding + READMEs/manifesto reposicionados para "observability", com os dois marketplaces em pé de igualdade.

**Architecture:** (19) novo campo opcional `todosUpdatedAt` extraído pelo parser (timestamp do último evento de mutação da lista, nos dois schemas) + função pura `listStaleness` no webview + hint no cabeçalho do main. (18) só manifesto/nls/markdown — sem código de runtime.

**Tech Stack:** TypeScript, vitest, Svelte 5, `contributes.walkthroughs`. Specs: [stale-list-hint](../specs/2026-07-16-stale-list-hint-design.md) · [onboarding-repositioning](../specs/2026-07-16-onboarding-repositioning-design.md)

## Global Constraints

- Strings de manifesto novas nos 3 nls (`package.nls.json`, `.pt-br`, `.es`); strings de webview no catálogo `src/i18n/messages.ts` (3 locales).
- Limiar do hint: `5 * 60_000` ms. Condições: main com `todosUpdatedAt` + ≥1 task não-completed + ≥1 sub-agent `running` + idade ≥ limiar.
- `npm test`, `npx tsc --noEmit`, `npm run build`, `npx svelte-check` verdes ao fim de cada task.

---

### Task 1 (item 19): `todosUpdatedAt` no parser

**Files:**
- Modify: `src/types.ts` (`AgentTodos`), `src/services/todosParser.ts` (`readLastTodos`, `readLastTodosFromLines`, `readLastTodoWriteSnapshot`, `readTaskStream` + call sites em `listForSession`/FileInfo)
- Test: `tests/services/todosParser.test.ts` (casos novos)

**Interfaces:**
- Produces: `AgentTodos.todosUpdatedAt?: number` (epoch ms) — Task 2 consome no webview.

- [ ] Testes: TodoWrite → `todosUpdatedAt` = timestamp da linha do último snapshot; Task stream → maior timestamp entre TaskCreate/TaskUpdate; linhas sem `timestamp` → campo ausente.
- [ ] `readLastTodoWriteSnapshot` retorna `{ todos, updatedAt? }` (captura `parseEpoch(entry.timestamp)` da linha casada); `readTaskStream` rastreia o maior ts de eventos válidos e retorna `{ todos, updatedAt? }`; `readLastTodosFromLines`/`readLastTodos` propagam; call sites (main + sub-agents) preenchem `todosUpdatedAt` no `AgentTodos`.
- [ ] Suíte + tsc verdes → commit `feat(parser): todosUpdatedAt — timestamp do último evento da lista`.

### Task 2 (item 19): staleness no webview

**Files:**
- Modify: `src/webview/format.ts` (`listStaleness` + `STALE_LIST_THRESHOLD_MS`), `src/webview/lib/AgentSection.svelte` (hint no cabeçalho, prop `hasRunningSubAgent`), quem renderiza o main (`AgentTree.svelte`/`App.svelte` — derivar `hasRunningSubAgent` de `snapshot.agents`), `src/i18n/messages.ts` (2 chaves × 3 locales)
- Test: `tests/webview/format.test.ts` (ou suíte equivalente existente de `format`)

**Interfaces:**
- Consumes: `AgentTodos.todosUpdatedAt` (Task 1), relógio compartilhado `clock.svelte.ts`.
- Produces: `listStaleness(agent, hasRunningSubAgent, now): number | null` (ms de idade ou null).

```ts
export const STALE_LIST_THRESHOLD_MS = 5 * 60_000;
export function listStaleness(
  agent: { isMain: boolean; todos: Todo[]; todosUpdatedAt?: number },
  hasRunningSubAgent: boolean,
  now: number,
): number | null {
  if (!agent.isMain || agent.todosUpdatedAt === undefined) return null;
  if (agent.todos.length === 0) return null;
  if (!agent.todos.some(t => t.status !== 'completed')) return null;
  if (!hasRunningSubAgent) return null;
  const age = now - agent.todosUpdatedAt;
  return age >= STALE_LIST_THRESHOLD_MS ? age : null;
}
```

- [ ] Testes da função pura: cada condição negativa isolada + caso positivo (idade exata).
- [ ] i18n: `todos.staleList` ("lista sem atualização há {d}") e `todos.staleListHint` (tooltip) × 3 locales.
- [ ] Hint no cabeçalho do main: `{#if stale !== null}<span class="stale" title={t('todos.staleListHint')}>{t('todos.staleList', { d: formatDuration(stale) })}</span>{/if}`, cor `descriptionForeground`, atualização via clock.
- [ ] Preview visual (skill preview-webview) do cabeçalho com hint ativo; suíte + svelte-check verdes → commit `feat(panel): hint de lista defasada (item 19)`.

### Task 3 (item 18a): walkthrough nativo

**Files:**
- Modify: `package.json` (`contributes.walkthroughs`), `package.nls.json` + `.pt-br` + `.es` (~14 chaves `walkthrough.*`)

- [ ] Walkthrough `claudeTodos.gettingStarted`, 5 passos conforme a spec (botões `command:` nos passos 1/3/4 com `completionEvents` `onCommand:`; passos 2/5 instrucionais; `media.svg` = `media/icon.svg`).
- [ ] `npm run build` + `npx vsce package --allow-missing-repository=false` (valida manifesto) → commit `feat(onboarding): walkthrough nativo de 5 passos (item 18a)`.
- [ ] Validação manual (F5) fica anotada no PR/commit como pendência de conferência humana.

### Task 4 (item 18b): READMEs ×3 + manifesto

**Files:**
- Modify: `README.md`, `README.en.md`, `README.es.md`, `package.json` (`keywords`), `package.nls*.json` (`extension.description`)

- [ ] Tagline: "Observability para seus agentes Claude Code — tasks, árvore de agentes, tokens e cache ao vivo, restrito ao workspace" (+ en/es).
- [ ] Badges dinâmicos: `img.shields.io/visual-studio-marketplace/v/CarlosJunior1992.claude-todos` + `img.shields.io/open-vsx/v/CarlosJunior1992/claude-todos`.
- [ ] Seção "O que você vê" (features na ordem: árvore → tempos → tokens/contexto/cache → dashboard por modelo/tipo → notificações → tasks clicáveis → i18n); instalação por editor (VS Code / Cursor·Windsurf·VSCodium / `.vsix`); menção ao walkthrough.
- [ ] Tabelas completas de comandos (com `Choose Session` `Ctrl+Alt+S`) e settings (5); remover contagem de testes datada.
- [ ] `keywords` += observability, monitoring, token usage, dashboard, multi-agent; `extension.description` novo ×3 nls.
- [ ] Consistência entre os 3 idiomas → commit `docs(readme): reposicionamento observability + dois marketplaces (item 18b)`.
