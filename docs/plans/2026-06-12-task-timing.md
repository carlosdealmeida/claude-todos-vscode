# Plano — Tempo de execução nas tasks

**Spec:** [docs/specs/2026-06-12-task-timing-design.md](../specs/2026-06-12-task-timing-design.md)
**Abordagem:** TDD (teste que falha → implementação mínima → verde), commits pequenos.

Tempo real por task + total/estimativa por agente. Sem % por task (impossível: o transcript não
tem sub-progresso). Ver a spec para a justificativa e as fórmulas.

---

## Task 1 — Timing no schema Task + tipos
- [x] `Todo.startedAt?`/`completedAt?` em `src/types.ts`.
- [x] `timestamp?: string` em `TranscriptEntry`; helpers `parseEpoch` e `makeTodo` (omite timing indefinido).
- [x] `readTaskStream` grava `startedAt`/`completedAt` por `TaskUpdate` (first-write-wins).
- [x] Testes (`todosParser.test.ts`): grava startedAt/completedAt; first-write-wins; sem timestamp → indefinido.

## Task 2 — Timing no schema TodoWrite
- [x] `extractTodoWriteTimings` — passada cronológica, `Map<content, {startedAt?, completedAt?}>`, first-write-wins.
- [x] Merge por `content` no caminho do TodoWrite em `readLastTodos`.
- [x] Testes: captura na sequência; first-write-wins; casa por content após reordenação; pula in_progress; sem timestamp.

## Task 3 — `formatDuration`
- [x] `formatDuration(ms)` em `format.ts` (`0s`/`45s`/`2m 14s`/`1h 5m`; clamp).
- [x] Testes (`format.test.ts`).

## Task 4 — `summarizeTiming`
- [x] `summarizeTiming(todos, now)` → `{ elapsedMs, estimateMs, hasEstimate }` (puro; `now` injetado).
- [x] Testes: soma de completed; parcela ao vivo; sem base → sem estimativa; `avg × restantes`; clamp; ignora sem startedAt.

## Task 5 — Relógio compartilhado
- [x] `src/webview/clock.svelte.ts` — `$state` `clock.now` com um único `setInterval(…1000)`.

## Task 6 — Duração por task (`TodoItem.svelte`)
- [x] `completed` → `formatDuration(completedAt - startedAt)`; `in_progress` → `⏱ {formatDuration(clock.now - startedAt)}` (ao vivo, destacado).

## Task 7 — Total + estimativa (`AgentSection.svelte`)
- [x] Linha no cabeçalho: `⏱ {elapsed}` + `~{estimate} restante (estimativa)` (itálico/esmaecido, `title` explicativo) via `summarizeTiming(agent.todos, clock.now)`.

## Task 8 — Docs
- [x] Spec + este plano.
- [x] ROADMAP (item 11).
- [ ] CHANGELOG — adicionar no commit de `release` (passo manual; entrada sugerida no resumo da feature).

---

## Verificação
- `npm test` — timing nos 2 schemas + `formatDuration`/`summarizeTiming` (132 testes verdes).
- `npm run build` — extensão + hook + webview compilam.
- `preview-webview` — confirmado: tempo real por task, relógio ao vivo na ativa, total + estimativa rotulada; sem estimativa na 1ª task e quando tudo concluído.
- `smoke-test` / `F5` — validação ao vivo ponta-a-ponta.
