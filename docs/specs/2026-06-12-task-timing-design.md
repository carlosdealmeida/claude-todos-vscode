# Design — Tempo de execução nas tasks

**Data:** 2026-06-12
**Status:** aprovado, implementado (aguardando release)
**Origem:** pedido de uso — "ver o progresso/tempo de cada task no painel"

Mostrar quanto tempo cada tarefa do `TodoWrite`/`Task` levou (ou está levando), mais o tempo
total da lista por agente.

---

## Motivação e a restrição de dados

O pedido inicial foi uma **barra de % de progresso por task**. Investigação dos dados: o Claude
Code grava cada task com apenas três estados (`pending`/`in_progress`/`completed`) e **nenhum**
sinal de sub-progresso ou ETA. Logo, uma **% real por task é impossível** — qualquer barra que
"enche" seria um palpite que pode enganar (chegar a 100% com a task ainda rodando, ou pular).

Decisão (validada com a usuária): mostrar **tempo decorrido real**, derivado dos `timestamp` do
transcript, e usar palpite **somente** para a estimativa do tempo restante da lista, sempre
**rotulado** como estimativa.

Confirmado por inspeção de transcript real: toda entrada `.jsonl` tem um `timestamp` ISO 8601
top-level → dá para saber quando cada task entrou em `in_progress` e `completed`.

---

## O que mostrar

1. **Task `in_progress`:** tempo decorrido **ao vivo** — `⏱ 2m 14s`, atualizando a cada segundo.
2. **Task `completed`:** duração que levou — ex.: `1m 30s` (à direita do item). Quando a task
   nunca passou por `in_progress` (não tem `startedAt`), a duração é **inferida sequencialmente**
   (ver abaixo); tasks concluídas em lote no mesmo instante mostram `<1s`.
3. **Cabeçalho do agente:** bloco em **duas linhas rotuladas** — `⏱ decorrido … {elapsed}` e
   `⏳ restante … ~{estimate}` (countdown decrescente), com a tag `estimativa` em itálico/esmaecida
   alinhada à direita. Rótulo à esquerda, valor à direita (`justify-content: space-between`).

---

## Dados

`Todo` ([src/types.ts](../../src/types.ts)) ganha dois campos opcionais (epoch ms):

```ts
startedAt?: number;    // 1ª vez observada in_progress
completedAt?: number;  // 1ª vez observada completed
```

Fluem pelos canais existentes (parser → `AgentTodos.todos` → postMessage → webview). Anexados
**só quando definidos**, para não inflar o snapshot nem quebrar comparações que esperam os 3
campos obrigatórios.

## Extração no parser ([src/services/todosParser.ts](../../src/services/todosParser.ts))

`TranscriptEntry` ganha `timestamp?: string`; convertido por `parseEpoch` (`Date.parse`, só se
`Number.isFinite`). **First-write-wins** por campo (registra o **primeiro** instante de cada estado).

- **Schema Task:** no ramo `TaskUpdate`, grava `startedAt`/`completedAt` pelo `timestamp` do entry
  (chave = `taskId`, robusto).
- **Schema TodoWrite:** `readLastTodoWriteSnapshot` continua a fonte do **estado**; nova função
  `extractTodoWriteTimings` faz **uma passada cronológica** montando `Map<content, {startedAt?,
  completedAt?}>`, e o resultado é mesclado por **`content`** (estável a reordenações da lista; o
  índice não é). Casa-se por content por ser a chave estável; duplicatas de content compartilham
  timing (limitação cosmética aceita; o schema Task não sofre disso).

## Cálculo (helper puro [src/webview/format.ts](../../src/webview/format.ts))

`summarizeTiming(todos, now)` → `{ elapsedMs, estimateMs, hasEstimate }`. Recebe `now` por
parâmetro (puro/testável); o webview injeta o relógio ao vivo.

```
elapsedMs = Σ por task:
  completed c/ startedAt+completedAt → max(0, completedAt - startedAt)
  in_progress c/ startedAt          → max(0, now - startedAt)
  senão                             → 0
avg = Σ(durações das completed mensuráveis) / nº
// estimativa em contagem regressiva (decresce ao vivo):
estimateMs = hasEstimate ? Σ por task pendente/ativa : 0
  pending                    → avg
  in_progress c/ startedAt   → max(0, avg - (now - startedAt))
  in_progress sem startedAt  → avg
hasEstimate = (nº completed mensuráveis ≥ 1) && (nº pending + in_progress ≥ 1)
```

A parcela da task **ativa** encolhe conforme ela roda (`avg − decorrido`, sem ficar negativa),
então o restante **conta para baixo** ao vivo. Permanece rotulado como estimativa (`~` + tag).

`formatDuration(ms)`: `0s` / `45s` / `2m 14s` / `1h 5m`; negativo/`NaN`/`<1s` → `0s`.

**Inferência sequencial das durações concluídas** (`completedTaskDurations`): uma task `completed`
sem `startedAt` (marcada concluída sem passar visivelmente por `in_progress`) tem o início inferido
como o **fim da task anterior** — modelo de trabalho sequencial. Tasks concluídas em lote (mesmo
`completedAt`) resultam em `0` → exibidas como `<1s`; tasks espaçadas no tempo ganham a duração real
do intervalo. Importante: a **média da estimativa** usa apenas durações *observadas* (com `in_progress`
real), nunca as inferidas, para não distorcer o cálculo. O `elapsedMs` (total decorrido), por outro
lado, inclui as inferidas (somam ~0 no caso de lote).

## Relógio ao vivo ([src/webview/clock.svelte.ts](../../src/webview/clock.svelte.ts))

Nenhum snapshot novo chega enquanto a task roda, então o tempo precisa de relógio local: um
**único** `setInterval(…1000)` atualiza um `$state` compartilhado `clock.now`, lido por
`AgentSection` e `TodoItem`. `startedAt`/`now` são epoch ms absolutos (UTC) → a subtração é
correta sem conversão de fuso.

## Edge cases

- **`pending`→`completed` sem `in_progress`:** sem `startedAt` → sem duração, fora do elapsed e da
  base da estimativa. Silencioso.
- **Múltiplas `in_progress`:** somam as parcelas ao vivo; cada item tem seu próprio relógio.
- **1ª task (sem completed mensurável):** `hasEstimate = false` → cabeçalho mostra só o tempo real.
- **Lista reordenada:** casa por `content`, timing preservado.
- **Entradas sem `timestamp`:** degrada para o comportamento atual (sem tempos).
- **Timestamps fora de ordem (clock skew):** `Math.max(0, …)` clampa parcelas negativas.

---

## Arquivos afetados

- `src/types.ts` — `Todo.startedAt?` / `Todo.completedAt?`.
- `src/services/todosParser.ts` — `timestamp` no entry; `parseEpoch`, `makeTodo`,
  `extractTodoWriteTimings`; timing no `readTaskStream`.
- `src/webview/format.ts` — `formatDuration`, `summarizeTiming` (+ `TimingSummary`).
- `src/webview/clock.svelte.ts` — **novo**, relógio compartilhado.
- `src/webview/lib/TodoItem.svelte` e `AgentSection.svelte` — UI.
- Testes: `tests/services/todosParser.test.ts`, `tests/webview/format.test.ts`.

## Plano de testes (TDD)

**Parser (timing):** Schema Task grava `startedAt`/`completedAt` por `TaskUpdate`; first-write-wins;
sem `timestamp` → indefinido. Schema TodoWrite captura timing varrendo a sequência; first-write-wins;
casa por `content` após reordenação; só `completedAt` quando pula `in_progress`; sem `timestamp` →
indefinido.

**`formatDuration`:** `0s`/`45s`/`1m 30s`/`2m 14s`/`1h 0m`/`1h 5m`; clamp negativo/`NaN`.

**`summarizeTiming`:** soma de completed; parcela ao vivo da `in_progress` (com `now` fixo);
`hasEstimate=false` sem base; `estimateMs = avg × restantes`; clamp de parcela negativa; ignora
tasks sem `startedAt`.

A UI (`TodoItem`/`AgentSection`) e o relógio ao vivo são verificados por build + preview visual
(skill `preview-webview`) e smoke-test, sem teste unitário (consistente com o projeto).
