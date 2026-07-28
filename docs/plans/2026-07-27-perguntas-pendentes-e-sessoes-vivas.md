# Perguntas pendentes no painel + sessões vivas e nomes — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir no painel as perguntas que a sessão está esperando (item 22-ext) e distinguir
sessões vivas de mortas, usando o nome real quando o usuário definiu um (item 5a + 5c).

**Architecture:** Duas features independentes que compartilham o mesmo caminho de dados
existente: parser puro sobre linhas do transcript → `SessionSnapshot`/`SessionSummary` →
webview Svelte (compartilhado entre VS Code e JetBrains desde a 0.16.0). Nenhuma escrita no
espaço do Claude Code; a única escrita nova é um cache de nomes no diretório do bridge, que já
é nosso.

**Tech Stack:** TypeScript (strict), Svelte 5 (runes), vitest, esbuild + vite.

**Specs:**
[22-ext](../specs/2026-07-27-perguntas-pendentes-no-painel-design.md) ·
[5a+5c](../specs/2026-07-27-sessoes-vivas-e-nomes-design.md)

## Global Constraints

- **Português nos comentários de código e nas mensagens de commit**, seguindo o repo.
  **Comentários de código levam acentuação correta** ("última", "não", "inserção") — é o padrão
  do código existente. Onde um bloco de código deste plano mostrar comentário sem acento, trata-se
  de erro de transcrição do plano: escreva acentuado. **Só as mensagens de commit vão sem
  acentuação**, que é a convenção do histórico do repo.
- **`src/i18n/messages.ts` e `src/webview/**` nunca importam `vscode`** — são empacotados no
  webview. O catálogo é a fonte do tipo: `en` define as chaves, e
  [tests/i18n/messages.test.ts](../../tests/i18n/messages.test.ts) falha se qualquer locale
  divergir. Toda chave nova entra nos **5 idiomas**: `en`, `pt-br`, `es`, `zh-cn`, `zh-tw`
  (chinês seguindo [docs/i18n/glossary-zh.md](../i18n/glossary-zh.md)).
- **`src/core/**` é host-agnóstico** — nada de `vscode`, nada de API só-VS-Code
  (`workspaceState`, `PropertiesComponent`). É o que o sidecar do JetBrains consome.
- **Read-only sobre `~/.claude`**, exceto o nosso diretório `.vscode-todos-bridge/`. Nunca
  apagar nem reescrever arquivo do CLI, incluindo registros órfãos.
- **Campos opcionais no snapshot são omitidos, não `undefined` explícito** — padrão atual
  (`...(x !== null ? { x } : {})`).
- Comando de teste: `npm test` (vitest run). Typecheck: `npm run typecheck`.

---

## Parte A — Perguntas pendentes no painel (item 22-ext)

### Task 1: `detectPendingQuestions` no parser

**Files:**
- Modify: `src/types.ts` (adicionar `PendingQuestion`, campo em `SessionSnapshot`)
- Modify: `src/services/todosParser.ts:80-101` (ao lado de `detectAwaitingInput`)
- Test: `tests/services/todosParser.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `export function detectPendingQuestions(lines: string[], skipSidechain: boolean): PendingQuestion[]`
  e `export interface PendingQuestion { kind: 'question' | 'plan'; header?: string; text: string; line: number }`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `tests/services/todosParser.test.ts`, e incluir
`detectPendingQuestions` no import já existente de `../../src/services/todosParser`:

```ts
describe('detectPendingQuestions', () => {
  const ask = (id: string, questions: object[]) => JSON.stringify({
    isSidechain: false,
    message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', id, input: { questions } }] },
  });
  const plan = (id: string, text: string) => JSON.stringify({
    isSidechain: false,
    message: { content: [{ type: 'tool_use', name: 'ExitPlanMode', id, input: { plan: text } }] },
  });
  const result = (id: string) => JSON.stringify({
    isSidechain: false,
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
  });

  it('devolve uma entrada por pergunta, com header, texto e linha', () => {
    const lines = ['{}', ask('t1', [
      { question: 'Qual abordagem?', header: 'Abordagem' },
      { question: 'Qual layout?', header: 'Layout' },
    ])];
    expect(detectPendingQuestions(lines, true)).toEqual([
      { kind: 'question', header: 'Abordagem', text: 'Qual abordagem?', line: 1 },
      { kind: 'question', header: 'Layout', text: 'Qual layout?', line: 1 },
    ]);
  });

  it('suporta chamada com quatro perguntas', () => {
    const qs = [1, 2, 3, 4].map(n => ({ question: `P${n}`, header: `H${n}` }));
    expect(detectPendingQuestions([ask('t1', qs)], true)).toHaveLength(4);
  });

  it('ExitPlanMode vira item unico com a primeira linha nao vazia do plano', () => {
    expect(detectPendingQuestions([plan('t1', '\n\n## Plano\nDetalhe')], true)).toEqual([
      { kind: 'plan', text: '## Plano', line: 0 },
    ]);
  });

  it('pendencia resolvida por tool_result some da lista', () => {
    expect(detectPendingQuestions([ask('t1', [{ question: 'Q', header: 'H' }]), result('t1')], true)).toEqual([]);
  });

  it('com duas chamadas, so a ainda aberta e considerada', () => {
    const lines = [
      ask('t1', [{ question: 'Antiga', header: 'A' }]),
      result('t1'),
      ask('t2', [{ question: 'Atual', header: 'B' }]),
    ];
    expect(detectPendingQuestions(lines, true)).toEqual([
      { kind: 'question', header: 'B', text: 'Atual', line: 2 },
    ]);
  });

  it('ignora sidechain quando skipSidechain', () => {
    const side = JSON.stringify({
      isSidechain: true,
      message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', id: 't1', input: { questions: [{ question: 'Q' }] } }] },
    });
    expect(detectPendingQuestions([side], true)).toEqual([]);
  });

  it('omite header quando ausente e ignora entradas malformadas', () => {
    const lines = [ask('t1', [{ question: 'Sem header' }, { header: 'so header' }, 'lixo'])];
    expect(detectPendingQuestions(lines, true)).toEqual([
      { kind: 'question', text: 'Sem header', line: 0 },
    ]);
  });

  it('transcript sem essas ferramentas devolve lista vazia', () => {
    expect(detectPendingQuestions(['{"message":{"content":[]}}', 'nao-json'], true)).toEqual([]);
  });

  it('plano so com linhas vazias e ignorado', () => {
    expect(detectPendingQuestions([plan('t1', '\n  \n')], true)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- todosParser`
Expected: FAIL — `detectPendingQuestions is not a function` / erro de import.

- [ ] **Step 3: Definir os tipos**

Em `src/types.ts`, logo abaixo de `export type AwaitingInput`:

```ts
export interface PendingQuestion {
  kind: 'question' | 'plan';
  header?: string;  // chip curto; ausente em planos e quando o tool_use nao traz
  text: string;     // texto da pergunta, ou 1a linha nao vazia do plano
  line: number;     // linha (0-based) do tool_use no transcript do main
}
```

E no `SessionSnapshot`, ao lado de `awaitingInput`:

```ts
  pendingQuestions?: PendingQuestion[];
```

- [ ] **Step 4: Implementar a detecção**

Em `src/services/todosParser.ts`, logo após `detectAwaitingInput` (que fica **inalterada**).
Importar `PendingQuestion` junto dos outros tipos no topo do arquivo:

```ts
// Conteudo da espera pendente, para exibir no painel (a irma detectAwaitingInput
// devolve so o tipo, que e o que o notifier compara por identidade).
// So o ULTIMO tool_use ainda aberto vira lista: medido em 320 chamadas reais,
// nunca ha duas chamadas concorrentes abertas — o que ha sao chamadas com ate
// 4 perguntas (15% dos casos).
export function detectPendingQuestions(lines: string[], skipSidechain: boolean): PendingQuestion[] {
  const pending = new Map<string, PendingQuestion[]>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let entry: TranscriptEntry;
    try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
    if (skipSidechain && entry.isSidechain) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use' && typeof block.id === 'string') {
        const items = pendingItemsFor(block, i);
        if (items.length > 0) pending.set(block.id, items);
      } else if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        pending.delete(block.tool_use_id);
      }
    }
  }
  let last: PendingQuestion[] = [];
  for (const v of pending.values()) last = v;
  return last;
}

function pendingItemsFor(block: ContentBlock, line: number): PendingQuestion[] {
  if (block.name === 'AskUserQuestion') {
    const raw = block.input?.questions;
    if (!Array.isArray(raw)) return [];
    const out: PendingQuestion[] = [];
    for (const q of raw) {
      if (!q || typeof q !== 'object') continue;
      const { question, header } = q as { question?: unknown; header?: unknown };
      if (typeof question !== 'string' || question === '') continue;
      out.push({
        kind: 'question',
        ...(typeof header === 'string' && header !== '' ? { header } : {}),
        text: question,
        line,
      });
    }
    return out;
  }
  if (block.name === 'ExitPlanMode') {
    const plan = block.input?.plan;
    if (typeof plan !== 'string') return [];
    const first = plan.split('\n').map(l => l.trim()).find(l => l !== '');
    return first ? [{ kind: 'plan', text: first, line }] : [];
  }
  return [];
}
```

Se `ContentBlock.input` não declarar `questions`/`plan`, adicionar os campos como
`unknown` na interface `ContentBlock` do próprio arquivo (ela já é local e permissiva).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- todosParser && npm run typecheck`
Expected: PASS nos 8 testes novos, typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/services/todosParser.ts tests/services/todosParser.test.ts
git commit -m "feat(parser): detectPendingQuestions extrai conteudo da espera pendente"
```

---

### Task 2: Propagar `pendingQuestions` até o snapshot

**Files:**
- Modify: `src/services/todosParser.ts:110-133` (`listSessionDetail`)
- Modify: `src/services/snapshotService.ts:54-63` (`build`)
- Test: `tests/services/todosParser.test.ts`, `tests/services/snapshotService.test.ts`

**Interfaces:**
- Consumes: `detectPendingQuestions`, `PendingQuestion` (Task 1).
- Produces: `listSessionDetail()` passa a devolver
  `{ agents, awaitingInput, pendingQuestions: PendingQuestion[] }`; `SessionSnapshot.pendingQuestions`
  presente só quando não-vazio.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/services/snapshotService.test.ts`, estender o stub `makeParser` para aceitar
`pendingQuestions` e devolvê-lo em `listSessionDetail`:

```ts
    listSessionDetail: (sessionId: string) => ({
      agents: agentsFor(sessionId),
      awaitingInput: opts.awaitingInput ?? null,
      pendingQuestions: opts.pendingQuestions ?? [],
    }),
```

(e adicionar `pendingQuestions?: PendingQuestion[];` à assinatura de `opts`, importando o tipo
de `../../src/types`). Depois, os testes novos:

```ts
  it('propaga pendingQuestions quando ha pendencia', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({
      mtimes: { a: 10 },
      pendingQuestions: [{ kind: 'question', header: 'H', text: 'Q', line: 3 }],
    });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.build()?.pendingQuestions).toEqual([
      { kind: 'question', header: 'H', text: 'Q', line: 3 },
    ]);
  });

  it('omite pendingQuestions quando a lista e vazia', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { a: 10 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.build()).not.toHaveProperty('pendingQuestions');
  });
```

E em `tests/services/todosParser.test.ts`, dentro do `describe('TodosParser')`:

```ts
  it('listSessionDetail devolve as perguntas pendentes do main', () => {
    writeTranscript('s1', CWD, [
      { isSidechain: false, message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', id: 't1', input: { questions: [{ question: 'Q', header: 'H' }] } }] } },
    ]);
    expect(parser.listSessionDetail('s1', CWD).pendingQuestions).toEqual([
      { kind: 'question', header: 'H', text: 'Q', line: 0 },
    ]);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- snapshotService todosParser`
Expected: FAIL — `pendingQuestions` é `undefined` no retorno.

- [ ] **Step 3: Implementar a propagação**

Em `todosParser.ts`, no `listSessionDetail` — ajustar o tipo de retorno e as **duas** saídas
(o early-return de transcript ausente e o final):

```ts
  listSessionDetail(sessionId: string, cwd: string): {
    agents: AgentTodos[];
    awaitingInput: AwaitingInput | null;
    pendingQuestions: PendingQuestion[];
  } {
    const transcriptPath = this.transcriptPath(sessionId, cwd);
    if (!transcriptPath) return { agents: [], awaitingInput: null, pendingQuestions: [] };
```

e no final:

```ts
    return {
      agents,
      awaitingInput: detectAwaitingInput(mainLines, true),
      pendingQuestions: detectPendingQuestions(mainLines, true),
    };
```

Em `snapshotService.ts`, no objeto devolvido por `build()`, logo após a linha de
`awaitingInput`:

```ts
      ...(detail.pendingQuestions.length > 0 ? { pendingQuestions: detail.pendingQuestions } : {}),
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test && npm run typecheck`
Expected: PASS em toda a suíte (inclusive `sessionCore`, que consome `listSessionDetail`).

- [ ] **Step 5: Commit**

```bash
git add src/services/todosParser.ts src/services/snapshotService.ts tests/services
git commit -m "feat(snapshot): propaga pendingQuestions ate o SessionSnapshot"
```

---

### Task 3: i18n e `pendingSummary` no webview

**Files:**
- Modify: `src/i18n/messages.ts` (3 chaves × 5 idiomas)
- Modify: `src/webview/format.ts`
- Test: `tests/webview/format.test.ts`

**Interfaces:**
- Consumes: `PendingQuestion` (Task 1).
- Produces: `export function pendingSummary(questions: PendingQuestion[], t: (k: string, p?: Record<string, string | number>) => string): { title: string; items: Array<{ chip?: string; text: string; line: number }> } | null`

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/webview/format.test.ts` (adicionar `pendingSummary` ao import existente):

```ts
describe('pendingSummary', () => {
  const t = (k: string, p?: Record<string, string | number>) =>
    p ? `${k}:${JSON.stringify(p)}` : k;

  it('devolve null quando nao ha pendencia', () => {
    expect(pendingSummary([], t)).toBeNull();
  });

  it('usa o titulo de perguntas com a contagem', () => {
    const out = pendingSummary([
      { kind: 'question', header: 'A', text: 'P1', line: 1 },
      { kind: 'question', text: 'P2', line: 1 },
    ], t)!;
    expect(out.title).toBe('app.pendingQuestions:{"n":2}');
    expect(out.items).toEqual([
      { chip: 'A', text: 'P1', line: 1 },
      { text: 'P2', line: 1 },
    ]);
  });

  it('plano unico usa titulo e chip proprios', () => {
    const out = pendingSummary([{ kind: 'plan', text: '## Plano', line: 7 }], t)!;
    expect(out.title).toBe('app.pendingPlanTitle');
    expect(out.items).toEqual([{ chip: 'app.pendingPlanChip', text: '## Plano', line: 7 }]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- format`
Expected: FAIL — `pendingSummary is not a function`.

- [ ] **Step 3: Adicionar as chaves nos 5 idiomas**

Em `src/i18n/messages.ts`, junto das outras chaves `app.*` de cada locale:

```
en:    'app.pendingQuestions': '{n} open questions',
       'app.pendingPlanTitle': 'Plan awaiting approval',
       'app.pendingPlanChip': 'Plan',
pt-br: 'app.pendingQuestions': '{n} perguntas em aberto',
       'app.pendingPlanTitle': 'Plano aguardando aprovação',
       'app.pendingPlanChip': 'Plano',
es:    'app.pendingQuestions': '{n} preguntas abiertas',
       'app.pendingPlanTitle': 'Plan esperando aprobación',
       'app.pendingPlanChip': 'Plan',
zh-cn: 'app.pendingQuestions': '{n} 个待回答的问题',
       'app.pendingPlanTitle': '计划待批准',
       'app.pendingPlanChip': '计划',
zh-tw: 'app.pendingQuestions': '{n} 個待回答的問題',
       'app.pendingPlanTitle': '計畫待核准',
       'app.pendingPlanChip': '計畫',
```

Forma única com placeholder, **sem** plural — convenção do catálogo
(`'project.sessions': '{n} sessions'`).

- [ ] **Step 4: Implementar `pendingSummary`**

Em `src/webview/format.ts`, importando `PendingQuestion` de `../types`:

```ts
// Decide titulo e chips da faixa de perguntas pendentes. Fica aqui (e nao no
// componente) porque o repo testa modulos puros do webview, nao componentes.
export function pendingSummary(
  questions: PendingQuestion[],
  t: (key: string, params?: Record<string, string | number>) => string,
): { title: string; items: Array<{ chip?: string; text: string; line: number }> } | null {
  if (questions.length === 0) return null;
  const onlyPlan = questions.length === 1 && questions[0].kind === 'plan';
  return {
    title: onlyPlan ? t('app.pendingPlanTitle') : t('app.pendingQuestions', { n: questions.length }),
    items: questions.map(q => {
      const chip = q.kind === 'plan' ? t('app.pendingPlanChip') : q.header;
      return { ...(chip ? { chip } : {}), text: q.text, line: q.line };
    }),
  };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test && npm run typecheck`
Expected: PASS — inclusive `tests/i18n/messages.test.ts`, que compara as chaves de cada locale
contra `en` e falharia se algum idioma ficasse de fora.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/messages.ts src/webview/format.ts tests/webview/format.test.ts
git commit -m "feat(webview): pendingSummary e i18n da faixa de perguntas pendentes"
```

---

### Task 4: Componente `PendingQuestions.svelte` no topo do painel

**Files:**
- Create: `src/webview/lib/PendingQuestions.svelte`
- Modify: `src/webview/App.svelte` (import + render após `</header>`)
- Verify: skill `preview-webview` (screenshot)

**Interfaces:**
- Consumes: `pendingSummary` (Task 3), `SessionSnapshot.pendingQuestions` (Task 2),
  `todosStore.openTodoSource(sessionId, agentId, line)` — mesma chamada que
  [TodoItem.svelte](../../src/webview/lib/TodoItem.svelte) já usa para o clique na task.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Conferir a assinatura real do clique**

Run: `grep -n "openTodoSource" src/webview/lib/TodoItem.svelte src/webview/stores.svelte.ts`
Use exatamente a mesma forma de chamada no componente novo. Se o store expuser outro nome,
seguir o do store — não inventar wrapper.

- [ ] **Step 2: Criar o componente**

`src/webview/lib/PendingQuestions.svelte`:

```svelte
<script lang="ts">
  import type { PendingQuestion } from '../../types';
  import { todosStore } from '../stores.svelte';
  import { pendingSummary } from '../format';

  let { questions, sessionId }: { questions: PendingQuestion[]; sessionId: string } = $props();
  let summary = $derived(pendingSummary(questions, todosStore.t));
</script>

{#if summary}
  <section class="pending">
    <p class="pending-title">{summary.title}</p>
    {#each summary.items as item, i (i)}
      <button class="pending-item" onclick={() => todosStore.openTodoSource(sessionId, sessionId, item.line)}>
        {#if item.chip}<span class="chip">{item.chip}</span>{/if}
        <span class="text">{item.text}</span>
      </button>
    {/each}
  </section>
{/if}

<style>
  .pending {
    border: 1px solid var(--vscode-panel-border);
    border-left: 2px solid var(--vscode-charts-yellow);
    border-radius: 5px;
    padding: var(--sp-1);
    margin-bottom: var(--sp-2);
  }
  .pending-title {
    margin: 0 0 var(--sp-1);
    font-size: 0.85em;
    opacity: 0.9;
  }
  .pending-item {
    display: flex;
    align-items: baseline;
    gap: var(--sp-1);
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 2px 0;
    color: inherit;
    cursor: pointer;
    font-size: 0.85em;
  }
  .pending-item:hover .text { text-decoration: underline; }
  .chip {
    flex: none;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 0.9em;
  }
  .text { min-width: 0; }
</style>
```

- [ ] **Step 3: Renderizar no App**

Em `src/webview/App.svelte`: adicionar
`import PendingQuestions from './lib/PendingQuestions.svelte';` junto dos outros imports, e
logo **após** `</header>` (antes do bloco `{#if snapshot.usage}`):

```svelte
    {#if snapshot.pendingQuestions}
      <PendingQuestions questions={snapshot.pendingQuestions} sessionId={snapshot.sessionId} />
    {/if}
```

- [ ] **Step 4: Verificar build e tipos**

Run: `npm run typecheck && npm run check:svelte && npm run build:webview`
Expected: sem erros.

- [ ] **Step 5: Conferir visualmente**

Invocar a skill `preview-webview` e confirmar: faixa no topo, acima do bloco de uso; chip
legível nos temas claro e escuro; texto longo não estoura a largura da sidebar.

- [ ] **Step 6: Commit**

```bash
git add src/webview/lib/PendingQuestions.svelte src/webview/App.svelte
git commit -m "feat(webview): faixa de perguntas pendentes no topo do painel"
```

---

## Parte B — Sessões vivas e nomes reais (item 5a + 5c)

### Task 5: `liveSessions` — ler o registro e checar liveness

**Files:**
- Create: `src/services/liveSessions.ts`
- Test: `tests/services/liveSessions.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export interface LiveSession { pid: number; sessionId: string; cwd: string; name?: string; nameSource?: string }`
  e `export function readLiveSessions(claudeDir: string, isAlive?: (pid: number) => boolean): Map<string, LiveSession>`
  (chaveado por `sessionId`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/services/liveSessions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readLiveSessions } from '../../src/services/liveSessions';

describe('readLiveSessions', () => {
  let claudeDir: string;

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-test-'));
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
  });
  afterEach(() => fs.rmSync(claudeDir, { recursive: true, force: true }));

  const write = (pid: number, body: object) =>
    fs.writeFileSync(path.join(claudeDir, 'sessions', `${pid}.json`), JSON.stringify(body));

  it('devolve mapa vazio quando o diretorio nao existe', () => {
    fs.rmSync(path.join(claudeDir, 'sessions'), { recursive: true });
    expect(readLiveSessions(claudeDir).size).toBe(0);
  });

  it('inclui sessao com pid vivo, chaveada por sessionId', () => {
    write(101, { pid: 101, sessionId: 's1', cwd: '/p', name: 'meu-nome', nameSource: 'user' });
    const out = readLiveSessions(claudeDir, () => true);
    expect(out.get('s1')).toEqual({ pid: 101, sessionId: 's1', cwd: '/p', name: 'meu-nome', nameSource: 'user' });
  });

  it('exclui sessao cujo pid esta morto', () => {
    write(102, { pid: 102, sessionId: 's2', cwd: '/p' });
    expect(readLiveSessions(claudeDir, () => false).size).toBe(0);
  });

  it('ignora arquivo malformado sem lancar', () => {
    fs.writeFileSync(path.join(claudeDir, 'sessions', '103.json'), '{nao-json');
    write(104, { pid: 104, sessionId: 's4', cwd: '/p' });
    const out = readLiveSessions(claudeDir, () => true);
    expect([...out.keys()]).toEqual(['s4']);
  });

  it('ignora registro sem sessionId ou sem pid numerico', () => {
    write(105, { pid: 105, cwd: '/p' });
    write(106, { pid: 'x', sessionId: 's6', cwd: '/p' });
    expect(readLiveSessions(claudeDir, () => true).size).toBe(0);
  });

  it('nao apaga arquivos de sessoes mortas', () => {
    write(107, { pid: 107, sessionId: 's7', cwd: '/p' });
    readLiveSessions(claudeDir, () => false);
    expect(fs.existsSync(path.join(claudeDir, 'sessions', '107.json'))).toBe(true);
  });
});

describe('isPidAlive (default)', () => {
  it('considera o proprio processo vivo', () => {
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-self-'));
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: 'self', cwd: '/p' }),
    );
    expect(readLiveSessions(claudeDir).has('self')).toBe(true);
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- liveSessions`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `src/services/liveSessions.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

// Registro vivo do CLI: ~/.claude/sessions/{pid}.json, um arquivo por processo.
// So lemos os campos que consumimos — o registro traz mais (startedAt, version,
// kind, entrypoint, procStart), e carrega-los sem uso so criaria superficie.
export interface LiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  name?: string;
  nameSource?: string;
}

// EPERM = processo existe, so nao e sinalizavel por este usuario.
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLiveSessions(
  claudeDir: string,
  isAlive: (pid: number) => boolean = isPidAlive,
): Map<string, LiveSession> {
  const out = new Map<string, LiveSession>();
  const dir = path.join(claudeDir, 'sessions');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf-8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const { pid, sessionId, cwd, name, nameSource } = parsed;
    if (typeof pid !== 'number' || typeof sessionId !== 'string' || typeof cwd !== 'string') continue;
    if (!isAlive(pid)) continue;
    out.set(sessionId, {
      pid,
      sessionId,
      cwd,
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof nameSource === 'string' ? { nameSource } : {}),
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- liveSessions && npm run typecheck`
Expected: PASS nos 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/liveSessions.ts tests/services/liveSessions.test.ts
git commit -m "feat(core): liveSessions le o registro ~/.claude/sessions e checa liveness"
```

---

### Task 6: Cache de nomes ao lado do bridge

**Files:**
- Create: `src/services/sessionNames.ts`
- Test: `tests/services/sessionNames.test.ts`

**Interfaces:**
- Consumes: `atomicWriteFileSync` de `src/services/atomicWrite.ts` (já existe).
- Produces: `export class SessionNames` com
  `get(sessionId: string): string | undefined`,
  `remember(sessionId: string, name: string, now: number): void` e
  `prune(maxAgeMs: number, now: number): void`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/services/sessionNames.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionNames } from '../../src/services/sessionNames';

describe('SessionNames', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'names-test-'));
    file = path.join(dir, 'bridge', 'session-names.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('get devolve undefined quando o arquivo nao existe', () => {
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  it('remember grava e get le de volta', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'meu-nome', 1000);
    expect(new SessionNames(file).get('s1')).toBe('meu-nome');
  });

  it('remember com o mesmo nome nao reescreve o arquivo', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'meu-nome', 1000);
    const before = fs.statSync(file).mtimeMs;
    names.remember('s1', 'meu-nome', 2000);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('remember com nome novo sobrescreve', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'antigo', 1000);
    names.remember('s1', 'novo', 2000);
    expect(names.get('s1')).toBe('novo');
  });

  it('prune remove entradas mais velhas que a janela', () => {
    const names = new SessionNames(file);
    names.remember('velha', 'a', 1000);
    names.remember('nova', 'b', 50_000);
    names.prune(10_000, 55_000);
    expect(names.get('velha')).toBeUndefined();
    expect(names.get('nova')).toBe('b');
  });

  it('prune e no-op quando nao ha o que remover', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'a', 1000);
    const before = fs.statSync(file).mtimeMs;
    names.prune(10_000, 2000);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('arquivo corrompido e tratado como vazio', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{corrompido');
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- sessionNames`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `src/services/sessionNames.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

interface Entry { name: string; updatedAt: number }

// O nome definido por /session-name so existe enquanto o processo vive
// (~/.claude/sessions/{pid}.json some no exit). Guardamos por sessionId para
// que ele sobreviva no picker. Arquivo proprio, ao lado do bridge — nao
// workspaceState, que e API do VS Code e nao alcanca o sidecar do JetBrains.
export class SessionNames {
  constructor(private readonly filePath: string) {}

  private readAll(): Record<string, Entry> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, Entry>
        : {};
    } catch {
      return {};
    }
  }

  private write(all: Record<string, Entry>): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    atomicWriteFileSync(this.filePath, JSON.stringify(all, null, 2));
  }

  get(sessionId: string): string | undefined {
    return this.readAll()[sessionId]?.name;
  }

  remember(sessionId: string, name: string, now: number): void {
    const all = this.readAll();
    if (all[sessionId]?.name === name) return;  // sem I/O quando nada muda
    all[sessionId] = { name, updatedAt: now };
    this.write(all);
  }

  prune(maxAgeMs: number, now: number): void {
    const all = this.readAll();
    const kept: Record<string, Entry> = {};
    let removed = 0;
    for (const [id, entry] of Object.entries(all)) {
      if (now - entry.updatedAt > maxAgeMs) removed++;
      else kept[id] = entry;
    }
    if (removed === 0) return;  // no-op, igual ao BridgeFile.prune
    this.write(kept);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- sessionNames && npm run typecheck`
Expected: PASS nos 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/sessionNames.ts tests/services/sessionNames.test.ts
git commit -m "feat(core): cache de nomes de sessao ao lado do bridge"
```

---

### Task 7: `alive` e precedência de título no `SnapshotService`

**Files:**
- Modify: `src/types.ts` (`SessionSummary.alive`)
- Modify: `src/services/snapshotService.ts` (construtor, `listSessions`, `choose`, `resolveTitle`)
- Modify: `src/core/sessionCore.ts:35-46` (injetar as dependências novas)
- Test: `tests/services/snapshotService.test.ts`

**Interfaces:**
- Consumes: `readLiveSessions`/`LiveSession` (Task 5), `SessionNames` (Task 6).
- Produces: `SessionSummary.alive?: boolean`; `SnapshotService` passa a receber dois
  parâmetros opcionais no construtor:
  `constructor(resolver, parser, usageParser, liveSessions?: () => Map<string, LiveSession>, names?: SessionNames)`.
  Opcionais para não quebrar os testes existentes que instanciam com 3 argumentos.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/services/snapshotService.test.ts`:

```ts
  const liveMap = (ids: Record<string, { name?: string; nameSource?: string }>) => () =>
    new Map(Object.entries(ids).map(([sessionId, extra]) => [
      sessionId, { pid: 1, sessionId, cwd: '/p', ...extra },
    ]));

  const namesStub = () => {
    const store: Record<string, string> = {};
    return {
      get: (id: string) => store[id],
      remember: (id: string, name: string) => { store[id] = name; },
      prune: () => {},
    };
  };

  it('marca alive nas sessoes do registro vivo', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'morta', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, morta: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    const sessions = svc.listSessions();
    expect(sessions.find(s => s.sessionId === 'viva')?.alive).toBe(true);
    expect(sessions.find(s => s.sessionId === 'morta')?.alive).toBeUndefined();
  });

  it('listSessions mantem a ordem por mtime, sem promover vivas', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'morta', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, morta: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    expect(svc.listSessions().map(s => s.sessionId)).toEqual(['morta', 'viva']);
  });

  it('Auto prefere a sessao viva mesmo com mtime menor', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'morta', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, morta: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    expect(svc.build()?.sessionId).toBe('viva');
  });

  it('entre duas vivas, vence o maior mtime', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'b', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { a: 5, b: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ a: {}, b: {} }), namesStub() as any);
    expect(svc.build()?.sessionId).toBe('b');
  });

  it('pin vence a preferencia por sessao viva', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'fixada', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, fixada: 1 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    svc.setPinnedSession('fixada');
    expect(svc.build()?.sessionId).toBe('fixada');
  });

  it('nome do usuario vence o aiTitle e e memorizado', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const names = namesStub();
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ s: { name: 'meu-nome', nameSource: 'user' } }), names as any);
    expect(svc.listSessions()[0].title).toBe('meu-nome');
    expect(names.get('s')).toBe('meu-nome');
  });

  it('nameSource derived e ignorado em favor do aiTitle', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ s: { name: 'proj-1c', nameSource: 'derived' } }), namesStub() as any);
    expect(svc.listSessions()[0].title).toBe('titulo derivado');
  });

  it('nome em cache sobrevive ao fim da sessao', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const names = namesStub();
    names.remember('s', 'nome-salvo');
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, () => new Map(), names as any);
    expect(svc.listSessions()[0].title).toBe('nome-salvo');
  });

  it('sem registro vivo nem cache, o comportamento atual e preservado', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.listSessions()[0].title).toBe('titulo derivado');
    expect(svc.build()?.sessionId).toBe('s');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- snapshotService`
Expected: FAIL — construtor ignora os argumentos novos; `alive` indefinido; título errado.

- [ ] **Step 3: Adicionar `alive` ao tipo**

Em `src/types.ts`, em `SessionSummary`:

```ts
  alive?: boolean;  // presente só quando há registro vivo em ~/.claude/sessions
```

- [ ] **Step 4: Implementar no `SnapshotService`**

Construtor:

```ts
  constructor(
    private readonly resolver: SessionResolver,
    private readonly parser: TodosParser,
    private readonly usageParser: UsageParser,
    private readonly liveSessions: () => Map<string, LiveSession> = () => new Map(),
    private readonly names?: SessionNames,
  ) {}
```

`listSessions` — resolve o mapa **uma vez** por chamada e repassa:

```ts
  listSessions(): SessionSummary[] {
    const live = this.liveSessions();
    const out: SessionSummary[] = [];
    for (const record of this.resolver.resolveCandidates()) {
      const updatedAt = this.parser.transcriptMtime(record.sessionId, record.cwd);
      if (updatedAt === null) continue;
      out.push({
        sessionId: record.sessionId,
        cwd: record.cwd,
        title: this.resolveTitle(record.sessionId, record.cwd, live.get(record.sessionId)),
        updatedAt,
        ...(live.has(record.sessionId) ? { alive: true } : {}),
      });
    }
    // Ordem por mtime, inalterada: a preferencia por sessao viva vive no choose().
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }
```

`choose` — pin > viva mais recente > mais recente:

```ts
  private choose(sessions: SessionSummary[]): SessionSummary | undefined {
    const pinned = this.pinnedSessionId
      ? sessions.find(s => s.sessionId === this.pinnedSessionId)
      : undefined;
    if (pinned) return pinned;
    // `sessions` ja vem por mtime DESC, entao o primeiro vivo e o vivo mais recente.
    return sessions.find(s => s.alive) ?? sessions[0];
  }
```

`resolveTitle` — precedência e memorização:

```ts
  // name do registro (so nameSource 'user') > nome em cache > aiTitle > id curto.
  // 'derived' e ignorado de proposito: e {basename}-{sufixo}, pior que o aiTitle.
  private resolveTitle(sessionId: string, cwd: string, live?: LiveSession): string {
    if (live?.nameSource === 'user' && live.name) {
      this.names?.remember(sessionId, live.name, Date.now());
      return live.name;
    }
    const cached = this.names?.get(sessionId);
    if (cached) return cached;
    return this.parser.readSessionTitle(sessionId, cwd) ?? `Session · ${sessionId.slice(0, 8)}`;
  }
```

Importar `LiveSession` de `./liveSessions` e `SessionNames` de `./sessionNames` — os três
arquivos vivem em `src/services/`.

- [ ] **Step 5: Ligar no `SessionCore`**

Em `src/core/sessionCore.ts`, no construtor:

```ts
    this.sessionNames = new SessionNames(
      path.join(this.claudeDir, '.vscode-todos-bridge', 'session-names.json'),
    );
    const resolver = new SessionResolver(this.bridge, this.workspaceCwds);
    this.snapshotService = new SnapshotService(
      resolver, this.parser, this.usageParser,
      () => readLiveSessions(this.claudeDir),
      this.sessionNames,
    );
```

com o campo `private readonly sessionNames: SessionNames;` e os imports
`import { readLiveSessions } from '../services/liveSessions';` e
`import { SessionNames } from '../services/sessionNames';`, junto dos outros imports de
`../services/` que o arquivo já tem. E estender o `pruneBridge` para podar as duas coisas na
mesma janela:

```ts
  pruneBridge(maxAgeMs: number): void {
    this.bridge.prune(maxAgeMs);
    this.sessionNames.prune(maxAgeMs, this.now());
  }
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test && npm run typecheck`
Expected: PASS na suíte inteira — inclusive os testes antigos de `snapshotService`, que
instanciam com 3 argumentos e devem continuar verdes (é o que os parâmetros opcionais
garantem).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/services/snapshotService.ts src/core/sessionCore.ts tests/services/snapshotService.test.ts
git commit -m "feat(sessions): marca sessoes vivas, Auto prefere viva e usa o nome real"
```

---

### Task 8: Marcador de sessão viva no picker

**Files:**
- Modify: `src/i18n/messages.ts` (1 chave × 5 idiomas)
- Modify: `src/extension.ts:113-122` (montagem do `description`)
- Test: `tests/i18n/messages.test.ts` (automático, sem edição)

**Interfaces:**
- Consumes: `SessionSummary.alive` (Task 7).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Adicionar a chave nos 5 idiomas**

Em `src/i18n/messages.ts`, junto das outras chaves `picker.*`:

```
en:    'picker.alive': 'live',
pt-br: 'picker.alive': 'ao vivo',
es:    'picker.alive': 'en vivo',
zh-cn: 'picker.alive': '进行中',
zh-tw: 'picker.alive': '進行中',
```

- [ ] **Step 2: Rodar o teste de paridade de catálogo**

Run: `npm test -- messages`
Expected: PASS — todos os locales com as mesmas chaves de `en`.

- [ ] **Step 3: Usar o marcador no picker**

Em `src/extension.ts`, no `map` que monta os itens, substituir a montagem atual do
`description` por:

```ts
      ...sessions.map(s => {
        const parts = [
          ...(s.alive ? [`● ${t('picker.alive')}`] : []),
          s.sessionId.slice(0, 8),
          ...(multiRoot ? [path.basename(s.cwd)] : []),
          relativeTime(s.updatedAt, t),
        ];
        return { label: s.title, description: parts.join(' · '), sessionId: s.sessionId };
      }),
```

Isso preserva o formato atual (`{id8} · {pasta} · {tempo}`) e só prefixa quando viva.

- [ ] **Step 4: Verificar build e tipos**

Run: `npm test && npm run typecheck && npm run build:ext`
Expected: PASS, build limpo.

- [ ] **Step 5: Conferir no Extension Development Host**

Abrir o projeto no VS Code, `F5`, rodar `Claude Todos: Choose Session` com pelo menos uma
sessão do Claude Code aberta. Confirmar: a sessão em execução aparece com `● ao vivo` e as
demais sem o marcador.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/messages.ts src/extension.ts
git commit -m "feat(picker): marcador de sessao ao vivo"
```

---

### Task 9: Paridade no JetBrains e documentação

**Files:**
- Modify: `jetbrains/` — picker nativo de sessão (localizar com o grep do Step 1)
- Modify: `README.md`, `README.en.md`, `README.es.md`, `README.zh-cn.md`, `README.zh-tw.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/ROADMAP.md` (itens 5 e 22)

**Interfaces:**
- Consumes: `SessionSummary.alive` (Task 7), que já chega ao JetBrains pelo sidecar —
  o protocolo serializa o `SessionSummary` inteiro, então **não há mudança de protocolo**.
- Produces: nada.

- [ ] **Step 1: Localizar o picker do JetBrains e o catálogo nativo**

Run: `grep -rn "listSessions\|SessionSummary" jetbrains/src --include=*.kt | head`
Run: `grep -rln "picker\." jetbrains/src/main/resources | head`

- [ ] **Step 2: Refletir `alive` no picker nativo**

No arquivo Kotlin que monta a lista, aplicar a mesma regra do Step 3 da Task 8: prefixar
`● ` + a string localizada de `picker.alive` quando `alive == true`. Adicionar a chave nos
catálogos nativos dos 5 idiomas, no mesmo formato dos existentes.

- [ ] **Step 3: Compilar o plugin**

Run: `cmd //c "C:/@work/MyProjects/claude-todos-vscode/jetbrains/gradlew.bat" -p jetbrains build`
Expected: BUILD SUCCESSFUL.

Nota: o path absoluto é obrigatório — `gradlew.bat` relativo falha no git-bash desta máquina.

- [ ] **Step 4: Atualizar CHANGELOG e READMEs**

Em `CHANGELOG.md`, nova seção `## [Unreleased]` no topo com duas entradas em `### Added`:
a faixa de perguntas pendentes (item 22-ext, citando
[#79078](https://github.com/anthropics/claude-code/issues/79078)) e o marcador de sessão ao
vivo + nome real (item 5a/5c, citando
[#28147](https://github.com/anthropics/claude-code/issues/28147) e
[#23275](https://github.com/anthropics/claude-code/issues/23275)), no estilo das entradas
anteriores: uma frase do que o usuário vê, depois como funciona.

Nos 5 READMEs, acrescentar as duas linhas correspondentes na seção "O que você vê" (e
equivalentes traduzidas).

- [ ] **Step 5: Atualizar o ROADMAP**

Em `docs/ROADMAP.md`:
- item 5: marcar (a) e (c) como ✅ entregues, com link para o spec e para o plano, e registrar
  que a limitação de reuso de PID foi aceita conscientemente;
- item 22: acrescentar que a extensão 22-ext foi entregue, com link para o spec;
- na "Fila de brainstorming", remover os dois itens entregues e deixar explícito o que sobrou.

- [ ] **Step 6: Verificação final**

Run: `npm test && npm run typecheck && npm run check:svelte && npm run build`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add jetbrains README*.md CHANGELOG.md docs/ROADMAP.md
git commit -m "feat(jetbrains): paridade do marcador ao vivo; docs das duas features"
```

---

## Ordem e dependências

```
Task 1 → Task 2 → Task 3 → Task 4        (Parte A: independente de B)
Task 5 ─┐
Task 6 ─┴→ Task 7 → Task 8 → Task 9      (Parte B; Task 9 fecha as duas)
```

Tasks 5 e 6 podem ser feitas em paralelo — não se tocam. A Parte A inteira pode rodar em
paralelo à Parte B; o único ponto de encontro é a Task 9 (documentação), que cobre as duas.

## Riscos conhecidos

- **Reuso de PID** (Task 5): um PID reciclado marca sessão morta como viva. Aceito no spec;
  efeito é cosmético e o pin resolve. Não implementar comparação de `procStart` sem pedido.
- **Testes antigos do `snapshotService`** (Task 7): instanciam com 3 argumentos. Os parâmetros
  novos são opcionais exatamente por isso — se algum quebrar, o defeito está no default, não
  no teste.
- **`ContentBlock` permissivo** (Task 1): se o typecheck reclamar de `input.questions`, o campo
  falta na interface local do `todosParser.ts`; adicionar como `unknown` e validar em runtime,
  como o resto do arquivo já faz.
