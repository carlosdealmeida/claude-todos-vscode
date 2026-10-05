# Sub-agents em background e janela do Fable — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O painel mostra sub-agents em background como rodando enquanto trabalham, não dispara o toast de "ociosa" com agentes em andamento e mede o Fable contra a janela de 1M.

**Architecture:** Um módulo puro novo (`agentLifecycle.ts`) lê, nas linhas de um transcript, os eventos de ciclo de vida de cada sub-agent assíncrono (lançamento, retomada por `SendMessage`, `<task-notification>`), chaveados por `agentId`. O `todosParser` junta esses eventos do transcript principal e dos transcripts de sub-agent e decide o status com uma regra só, que considera a liveness da sessão (passada pelo `SnapshotService`). O `SessionNotifier` passa a tratar "sub-agent rodando" como atividade. A janela do Fable é uma mudança de regex no `usageParser`.

**Tech Stack:** TypeScript, vitest (Node), tsx para a verificação com dados reais.

**Spec:** `docs/specs/2026-10-05-subagents-background-e-janela-fable-design.md`

## Global Constraints

- Formatos (medidos no disco, Claude Code 2.1.28x), copiados da spec:
  - **Lançamento:** record `type: "user"` com `toolUseResult.status === "async_launched"` e `toolUseResult.agentId` (string). Sem `toolUseResult` (transcripts de sub-agent): bloco `tool_result` cujo texto **começa** com `Async agent launched` e casa `agentId: <id>`.
  - **Retomada:** `toolUseResult.resumedAgentId` (string). Sem `toolUseResult`: texto do `tool_result` que começa com `{` e casa `"resumedAgentId":"<id>"`.
  - **Parada:** record `type: "user"` com `message.content` **string** começando com `<task-notification>`; o `agentId` vem de `<task-id>`. Qualquer `<status>` (`completed`, `failed`, `stopped`) para o agente. A cópia em `type: "queue-operation"` não conta.
  - A chave é sempre o `agentId`, nunca o `tool-use-id`.
- Estado de um agente = último evento; entre transcripts, vence o maior `timestamp` (epoch ms; 0 sem timestamp).
- Regra de status de sub-agent: `running` se o disparo não tem `tool_result` (`dispatch.result === 'none'`, foreground — **inalterado**) **ou** se a sessão está viva **e** o último evento do ciclo de vida é lançamento/retomada; senão `completed`. `rejected` continua excluindo o nó.
- `listSessionDetail(sessionId, cwd, opts?: { alive?: boolean })`: sem a opção, `alive` é `false` (comportamento de hoje). O `SnapshotService.build()` passa `alive: chosen.alive === true`.
- Liveness **não** se aplica ao foreground.
- Notifier: `NotifierInput.subAgentRunning?: boolean`; um observe com `subAgentRunning: true` é atividade (como mudança de `mtime`); `shouldPoll` é `true` enquanto o último observe teve `subAgentRunning`. Sem o campo, tudo como hoje.
- Fable: `ONE_M_FAMILY = /(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)|fable/i`. Haiku segue 200k; Mythos fica de fora.
- **Nada muda** na webview (`src/webview/**`), nos hosts (`src/extension.ts`, `jetbrains/**`), no i18n e nos READMEs.
- Comandos de verificação: `npm run typecheck`, `npm run check:svelte`, `npm test`, `npm run build`. Um arquivo de teste: `npx vitest run <caminho>`.
- Commits: um por tarefa, título em pt-BR **sem acentos** com prefixo convencional (`feat`, `fix`, `test`, `docs`), como o histórico do repo. Terminar a mensagem com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. Saída de ferramenta que só **menciona** "Async agent launched" no meio do texto (um sub-agent que fez grep num transcript) não pode ligar agente nenhum — teste na Task 2.
2. `toolUseResult` em string (erro de ferramenta) num transcript enriquecido não pode desviar para o caminho de texto — teste na Task 2.
3. Notificação com `<status>failed</status>` ou `stopped` para o agente como `completed` — teste na Task 2.
4. Retomada gravada num transcript diferente do lançamento (o main retoma um neto lançado por um sub-agent): vence o evento mais recente — teste na Task 3.
5. Sessão fixada (pin) que já morreu: o parser recebe `alive: false` e nenhum assíncrono aparece rodando — teste na Task 3.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/services/usageParser.ts` | `ONE_M_FAMILY` inclui o Fable. |
| `src/services/agentLifecycle.ts` (novo) | Eventos de ciclo de vida por `agentId` nas linhas de um transcript; junção entre transcripts. |
| `src/services/todosParser.ts` | `listSessionDetail` aceita `{ alive }`; `listSubAgents` usa o ciclo de vida na regra de status. |
| `src/services/snapshotService.ts` | Passa a liveness da sessão escolhida ao parser. |
| `src/services/sessionNotifier.ts` | `subAgentRunning` conta como atividade; `shouldPoll` segura o timer. |
| `src/core/sessionCore.ts` | Calcula `subAgentRunning` a partir do snapshot. |
| `CHANGELOG.md`, `docs/ROADMAP.md` | Registro da entrega. |

---

### Task 1: Janela de 1M para o Fable

**Files:**
- Modify: `src/services/usageParser.ts:9-24` (comentário, `ONE_M_FAMILY`, comentário de `contextLimitFor`)
- Test: `tests/services/usageParser.test.ts` (`describe('contextLimitFor')` e `describe('context window usage')`)

**Interfaces:**
- Consumes: nada.
- Produces: `contextLimitFor(model, observedTokens?)` devolve `1_000_000` para qualquer id com `fable`.

- [ ] **Step 1: Escrever os testes (o do Fable falha)**

Em `tests/services/usageParser.test.ts`, dentro de `describe('contextLimitFor', ...)`, depois do teste `'keeps 200k for haiku and pre-4 families'`, acrescentar:

```ts
  it('detects 1M for every Fable generation by family (no [1m] in the recorded id)', () => {
    expect(contextLimitFor('claude-fable-5')).toBe(1_000_000);
    expect(contextLimitFor('claude-fable-5-1')).toBe(1_000_000);
  });
  it('keeps the newest opus/sonnet on 1M and a dated haiku 4.5 on 200k', () => {
    expect(contextLimitFor('claude-opus-5-5')).toBe(1_000_000);
    expect(contextLimitFor('claude-sonnet-5-5')).toBe(1_000_000);
    expect(contextLimitFor('claude-haiku-4-5-20251001')).toBe(200_000);
  });
```

E dentro de `describe('context window usage', ...)` (bloco interno de `describe('UsageParser')`), depois do teste `'elevates a 200k-family model to 1M when the observed context exceeds 200k'`, acrescentar:

```ts
    it('measures a Fable session below 200k against the 1M window', () => {
      writeMain([assistant('claude-fable-5-1', { cacheRead: 150_000 })]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 150_000, limit: 1_000_000 });
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL em dois testes — `detects 1M for every Fable generation…` (`expected 200000 to be 1000000`) e `measures a Fable session below 200k…` (`limit: 200000`). O teste de opus/sonnet 5.5 e haiku passa já.

- [ ] **Step 3: Implementar**

Em `src/services/usageParser.ts`, trocar o bloco das linhas 9-12:

```ts
// opus/sonnet generation 4–19 (e.g. opus-4-8, sonnet-4-6). The `(?!\d)` stops
// the date-suffixed legacy id "claude-3-5-sonnet-20241022" from matching
// (its "sonnet-20" is neither [4-9] nor 1\d).
const ONE_M_FAMILY = /(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)/i;
```

por:

```ts
// opus/sonnet generation 4–19 (e.g. opus-4-8, sonnet-4-6) and every Fable
// (claude-fable-5, claude-fable-5-1): the CHANGELOG lists Fable among the 1M
// models (2.1.285, 2.1.287) and the transcript records it without a [1m]
// suffix. The `(?!\d)` stops the date-suffixed legacy id
// "claude-3-5-sonnet-20241022" from matching (its "sonnet-20" is neither
// [4-9] nor 1\d).
const ONE_M_FAMILY = /(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)|fable/i;
```

E no comentário de `contextLimitFor` (linhas 18-20), trocar `(opus/sonnet gen 4+, or an explicit 1m suffix)` por `(opus/sonnet gen 4+, Fable, or an explicit 1m suffix)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "fix(usage): janela de contexto do Fable e 1M (item 2)

O transcript grava claude-fable-5-1 sem o sufixo [1m] e o ONE_M_FAMILY so reconhecia opus|sonnet: uma sessao Fable com 150k aparecia como 75% de 200k. Fable entra na familia de 1M, como Opus e Sonnet.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Módulo puro `agentLifecycle`

**Files:**
- Create: `src/services/agentLifecycle.ts`
- Test: `tests/services/agentLifecycle.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type LifecycleState = 'running' | 'stopped'`
  - `interface LifecycleEntry { state: LifecycleState; at: number }`
  - `function collectAgentLifecycle(lines: string[]): Map<string, LifecycleEntry>`
  - `function mergeLifecycles(maps: Map<string, LifecycleEntry>[]): Map<string, LifecycleEntry>`

- [ ] **Step 1: Escrever os testes (falham: o módulo não existe)**

Criar `tests/services/agentLifecycle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectAgentLifecycle, mergeLifecycles, type LifecycleEntry } from '../../src/services/agentLifecycle';

const T = (min: number) => new Date(Date.parse('2026-10-01T10:00:00Z') + min * 60_000).toISOString();
const at = (min: number) => Date.parse(T(min));
const line = (o: object) => JSON.stringify(o);

// Formatos reais (Claude Code 2.1.28x), medidos no disco em 2026-10-04.
const launchText = (agentId: string) =>
  `Async agent launched successfully. (This tool result is internal metadata.)\nagentId: ${agentId} (internal ID - do not mention to user.)\nThe agent is working in the background.`;

function launch(agentId: string, min: number): string {
  return line({
    type: 'user', timestamp: T(min),
    toolUseResult: { isAsync: true, status: 'async_launched', agentId, description: 'bg', resolvedModel: 'claude-sonnet-5' },
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${agentId}`, content: [{ type: 'text', text: launchText(agentId) }] }] },
  });
}

// Transcript de sub-agent: sem toolUseResult, o dado só existe no texto.
function launchTextOnly(agentId: string, min: number, asString = false): string {
  return line({
    type: 'user', isSidechain: true, timestamp: T(min),
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${agentId}`,
      content: asString ? launchText(agentId) : [{ type: 'text', text: launchText(agentId) }] }] },
  });
}

function resumePayload(agentId: string) {
  return { success: true, message: `Resuming agent ${agentId.slice(0, 7)}`, resumedAgentId: agentId };
}

function resume(agentId: string, min: number): string {
  return line({
    type: 'user', timestamp: T(min), toolUseResult: resumePayload(agentId),
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_sm_${agentId}`, content: [{ type: 'text', text: JSON.stringify(resumePayload(agentId)) }] }] },
  });
}

function resumeTextOnly(agentId: string, min: number): string {
  return line({
    type: 'user', isSidechain: true, timestamp: T(min),
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_sm_${agentId}`, content: [{ type: 'text', text: JSON.stringify(resumePayload(agentId)) }] }] },
  });
}

function notification(taskId: string, min: number, status = 'completed'): string {
  return line({
    type: 'user', timestamp: T(min),
    message: { role: 'user', content: `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>toolu_x</tool-use-id>\n<output-file>/tmp/${taskId}.output</output-file>\n<status>${status}</status>\n<summary>Agent "bg" finished</summary>\n</task-notification>` },
  });
}

function queuedNotification(taskId: string, min: number): string {
  return line({
    type: 'queue-operation', operation: 'enqueue', timestamp: T(min),
    content: `<task-notification>\n<task-id>${taskId}</task-id>\n<status>completed</status>\n</task-notification>`,
  });
}

describe('collectAgentLifecycle', () => {
  it('a launch alone means running', () => {
    expect(collectAgentLifecycle([launch('bg01', 0)]).get('bg01')).toEqual({ state: 'running', at: at(0) });
  });

  it('a notification after the launch means stopped', () => {
    expect(collectAgentLifecycle([launch('bg01', 0), notification('bg01', 8)]).get('bg01'))
      .toEqual({ state: 'stopped', at: at(8) });
  });

  it('a resume after the notification means running again, and a new notification stops it', () => {
    const lines = [launch('bg01', 0), notification('bg01', 8), resume('bg01', 20)];
    expect(collectAgentLifecycle(lines).get('bg01')).toEqual({ state: 'running', at: at(20) });
    expect(collectAgentLifecycle([...lines, notification('bg01', 31)]).get('bg01'))
      .toEqual({ state: 'stopped', at: at(31) });
  });

  // Review Focus 3
  it('failed and stopped notifications also stop the agent', () => {
    expect(collectAgentLifecycle([launch('a1', 0), notification('a1', 1, 'failed')]).get('a1')?.state).toBe('stopped');
    expect(collectAgentLifecycle([launch('a2', 0), notification('a2', 1, 'stopped')]).get('a2')?.state).toBe('stopped');
  });

  it('the queue-operation copy of the notification alone does not stop the agent', () => {
    expect(collectAgentLifecycle([launch('bg01', 0), queuedNotification('bg01', 8)]).get('bg01')?.state)
      .toBe('running');
  });

  it('a background shell notification does not touch the agents', () => {
    const m = collectAgentLifecycle([launch('bg01', 0), notification('b5ebc2ylo', 3)]);
    expect(m.get('bg01')?.state).toBe('running');
  });

  it('reads launch and resume from the text when the transcript has no toolUseResult', () => {
    expect(collectAgentLifecycle([launchTextOnly('neto01', 0)]).get('neto01')?.state).toBe('running');
    expect(collectAgentLifecycle([launchTextOnly('neto02', 0, true)]).get('neto02')?.state).toBe('running');
    expect(collectAgentLifecycle([
      launchTextOnly('neto01', 0), notification('neto01', 2), resumeTextOnly('neto01', 5),
    ]).get('neto01')).toEqual({ state: 'running', at: at(5) });
  });

  it('a synchronous Agent result (status completed, report text) produces no event', () => {
    const sync = line({
      type: 'user', timestamp: T(0),
      toolUseResult: { status: 'completed', agentId: 'fg01', totalDurationMs: 1000 },
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_fg', content: [{ type: 'text', text: 'relatorio\nagentId: fg01 (use SendMessage)' }] }] },
    });
    expect(collectAgentLifecycle([sync]).has('fg01')).toBe(false);
  });

  // Review Focus 1
  it('tool output that only mentions the launch phrase mid-text does not start an agent', () => {
    const grepOutput = line({
      type: 'user', isSidechain: true, timestamp: T(0),
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_grep',
        content: `x.jsonl:12: ${launchText('other01')}` }] },
    });
    expect(collectAgentLifecycle([grepOutput]).has('other01')).toBe(false);
  });

  // Review Focus 2
  it('a string toolUseResult (tool error) in an enriched transcript does not fall back to the text', () => {
    const toolError = line({
      type: 'user', timestamp: T(0), toolUseResult: 'Error: something failed',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_e', content: launchText('ghost01') }] },
    });
    expect(collectAgentLifecycle([toolError]).has('ghost01')).toBe(false);
  });

  it('skips malformed lines; a record without timestamp counts with at = 0', () => {
    const noTimestamp = line({
      type: 'user', toolUseResult: { status: 'async_launched', agentId: 'nots01' },
      message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] },
    });
    const m = collectAgentLifecycle(['{ broken async_launched', '', noTimestamp]);
    expect(m.get('nots01')).toEqual({ state: 'running', at: 0 });
  });
});

describe('mergeLifecycles', () => {
  it('for the same agentId, the latest event wins across transcripts', () => {
    const fromParent = new Map<string, LifecycleEntry>([['neto01', { state: 'stopped', at: at(5) }]]);
    const fromMain = new Map<string, LifecycleEntry>([['neto01', { state: 'running', at: at(10) }]]);
    expect(mergeLifecycles([fromMain, fromParent]).get('neto01')).toEqual({ state: 'running', at: at(10) });
    expect(mergeLifecycles([fromParent, fromMain]).get('neto01')).toEqual({ state: 'running', at: at(10) });
  });

  it('keeps agents that appear in only one map', () => {
    const a = new Map<string, LifecycleEntry>([['a1', { state: 'running', at: 1 }]]);
    const b = new Map<string, LifecycleEntry>([['b1', { state: 'stopped', at: 2 }]]);
    expect([...mergeLifecycles([a, b]).keys()].sort()).toEqual(['a1', 'b1']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/agentLifecycle.test.ts`
Expected: FAIL — `Failed to load url ../../src/services/agentLifecycle` (módulo inexistente).

- [ ] **Step 3: Implementar o módulo**

Criar `src/services/agentLifecycle.ts`:

```ts
// R6: ciclo de vida dos sub-agents assíncronos. Módulo PURO (sem fs): recebe as
// linhas de UM transcript — o de quem disparou os agentes — e devolve, por
// agentId, o último evento visto. Lançamento e retomada = rodando; a
// <task-notification> = parado. Formatos medidos no disco em 2026-10-04
// (spec docs/specs/2026-10-05-subagents-background-e-janela-fable-design.md).

export type LifecycleState = 'running' | 'stopped';

export interface LifecycleEntry {
  state: LifecycleState;
  at: number; // epoch ms do record; 0 sem timestamp
}

// Pré-filtro: só linhas com uma destas marcas passam pelo JSON.parse — o
// transcript principal pode ter dezenas de milhares de linhas.
const MARKERS = ['async_launched', 'Async agent launched', 'resumedAgentId', '<task-notification>'];
const LAUNCH_TEXT = 'Async agent launched';
const LAUNCH_ID = /agentId: ([\w-]+)/;
const RESUME_ID = /"resumedAgentId":"([^"]+)"/;
const TASK_ID = /<task-id>([^<]+)<\/task-id>/;
const NOTIFICATION = '<task-notification>';

interface RawEntry {
  type?: unknown;
  timestamp?: unknown;
  toolUseResult?: unknown;
  message?: { content?: unknown };
}

function epochOf(ts: unknown): number {
  if (typeof ts !== 'string') return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

// Texto de um tool_result: string, ou a concatenação dos blocos { type: 'text' }.
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(b => (b !== null && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string'
      ? (b as { text: string }).text
      : ''))
    .join('\n');
}

export function collectAgentLifecycle(lines: string[]): Map<string, LifecycleEntry> {
  const out = new Map<string, LifecycleEntry>();
  for (const line of lines) {
    if (!line || !MARKERS.some(m => line.includes(m))) continue;
    let entry: RawEntry;
    try { entry = JSON.parse(line) as RawEntry; } catch { continue; }
    // A cópia em queue-operation (content no nível de cima) fica de fora aqui.
    if (entry.type !== 'user') continue;
    const at = epochOf(entry.timestamp);
    const content = entry.message?.content;

    // Parada: a notificação chega como mensagem do usuário, em string.
    if (typeof content === 'string') {
      if (content.startsWith(NOTIFICATION)) {
        const id = TASK_ID.exec(content)?.[1];
        if (id) out.set(id, { state: 'stopped', at });
      }
      continue;
    }
    if (!Array.isArray(content)) continue;

    // Transcript enriquecido (o principal): só os campos estruturados valem.
    const result = entry.toolUseResult;
    if (result !== undefined && result !== null) {
      if (typeof result === 'object') {
        const { status, agentId, resumedAgentId } = result as Record<string, unknown>;
        if (status === 'async_launched' && typeof agentId === 'string') out.set(agentId, { state: 'running', at });
        if (typeof resumedAgentId === 'string') out.set(resumedAgentId, { state: 'running', at });
      }
      continue;
    }

    // Sem toolUseResult (transcripts de sub-agent): o mesmo dado vem no texto.
    for (const block of content) {
      if (block === null || typeof block !== 'object' || (block as { type?: unknown }).type !== 'tool_result') continue;
      const text = textOf((block as { content?: unknown }).content).trimStart();
      if (text.startsWith(LAUNCH_TEXT)) {
        const id = LAUNCH_ID.exec(text)?.[1];
        if (id) out.set(id, { state: 'running', at });
      } else if (text.startsWith('{')) {
        const id = RESUME_ID.exec(text)?.[1];
        if (id) out.set(id, { state: 'running', at });
      }
    }
  }
  return out;
}

// Junta os mapas de transcripts diferentes (o principal e os de cada
// sub-agent): para o mesmo agentId vence o evento mais recente; no empate,
// o primeiro mapa.
export function mergeLifecycles(maps: Map<string, LifecycleEntry>[]): Map<string, LifecycleEntry> {
  const out = new Map<string, LifecycleEntry>();
  for (const map of maps) {
    for (const [id, entry] of map) {
      const current = out.get(id);
      if (current === undefined || entry.at > current.at) out.set(id, entry);
    }
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/services/agentLifecycle.test.ts`
Expected: PASS (13 testes).

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/services/agentLifecycle.ts tests/services/agentLifecycle.test.ts
git commit -m "feat(parser): ciclo de vida de sub-agents assincronos por agentId (R6)

Modulo puro que le, nas linhas de um transcript, o lancamento (async_launched), a retomada por SendMessage (resumedAgentId) e a task-notification de cada sub-agent, no transcript principal pelo toolUseResult e nos de sub-agent pelo texto. O ultimo evento decide; entre transcripts vence o mais recente.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Parser e snapshot usam o ciclo de vida, com liveness

**Files:**
- Modify: `src/services/todosParser.ts` (import; `listSessionDetail` linha 214; `listSubAgents` linhas 289-413)
- Modify: `src/services/snapshotService.ts:59`
- Test: `tests/services/todosParser.test.ts` (describe novo no fim de `describe('TodosParser')`)
- Test: `tests/services/snapshotService.test.ts` (dois casos no fim de `describe('SnapshotService')`)

**Interfaces:**
- Consumes (Task 2): `collectAgentLifecycle(lines: string[]): Map<string, LifecycleEntry>`, `mergeLifecycles(maps): Map<string, LifecycleEntry>`, `type LifecycleEntry`.
- Produces:
  - `TodosParser.listSessionDetail(sessionId: string, cwd: string, opts?: { alive?: boolean }): { agents: AgentTodos[]; awaitingInput: AwaitingInput | null; pendingQuestions: PendingQuestion[] }`
  - Sub-agent assíncrono com `status: 'running'` no snapshot enquanto a sessão escolhida estiver viva (consumido pela Task 4).

- [ ] **Step 1: Escrever os testes do parser (falham)**

Em `tests/services/todosParser.test.ts`, inserir antes do `});` que fecha `describe('TodosParser', ...)` — logo depois do teste `'does not emit duplicate sub-agent agentIds when prompts collide'`:

```ts
  describe('background sub-agents (R6)', () => {
    const T = (min: number) => new Date(Date.parse('2026-10-01T10:00:00Z') + min * 60_000).toISOString();

    // Formatos reais (Claude Code 2.1.28x), medidos no disco em 2026-10-04.
    function asyncLaunchResult(toolUseId: string, agentId: string, timestamp: string): object {
      return {
        type: 'user', timestamp,
        toolUseResult: { isAsync: true, status: 'async_launched', agentId, description: 'bg', resolvedModel: 'claude-sonnet-5' },
        message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: [{ type: 'text',
          text: `Async agent launched successfully.\nagentId: ${agentId} (internal ID - do not mention to user.)` }] }] },
      };
    }

    function taskNotification(agentId: string, toolUseId: string, timestamp: string, status = 'completed'): object {
      return {
        type: 'user', timestamp,
        message: { role: 'user', content: `<task-notification>\n<task-id>${agentId}</task-id>\n<tool-use-id>${toolUseId}</tool-use-id>\n<status>${status}</status>\n<summary>Agent "bg" finished</summary>\n</task-notification>` },
      };
    }

    function sendMessageToolUse(toolUseId: string, to: string): object {
      return { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'SendMessage', id: toolUseId, input: { to, message: 'mais uma rodada' } }] } };
    }

    function resumeResult(toolUseId: string, agentId: string, timestamp: string): object {
      const payload = { success: true, message: `Resuming agent ${agentId.slice(0, 7)}`, resumedAgentId: agentId };
      return {
        type: 'user', timestamp, toolUseResult: payload,
        message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: [{ type: 'text', text: JSON.stringify(payload) }] }] },
      };
    }

    function writeSubAgentLines(agentId: string, lines: object[]): void {
      const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), 's1', 'subagents');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `agent-${agentId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n'));
    }

    function writeBackgroundSession(extra: object[] = []): void {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_BG', 'Revisar em background', 'p-bg'),
        asyncLaunchResult('toolu_BG', 'bg0001', T(0)),
        ...extra,
      ]);
      writeSubAgent('s1', CWD, 'bg0001', 'p-bg', null);
      writeSubAgentMeta('s1', CWD, 'bg0001', { agentType: 'general-purpose', description: 'Revisar em background', toolUseId: 'toolu_BG', spawnDepth: 1 });
    }

    const agentOf = (agentId: string, alive?: boolean) =>
      parser.listSessionDetail('s1', CWD, alive === undefined ? undefined : { alive }).agents.find(a => a.agentId === agentId)!;

    it('live session: an async agent without a notification is running', () => {
      writeBackgroundSession();
      expect(agentOf('bg0001', true).status).toBe('running');
    });

    it('live session: an async agent with a completion notification is completed', () => {
      writeBackgroundSession([taskNotification('bg0001', 'toolu_BG', T(8))]);
      expect(agentOf('bg0001', true).status).toBe('completed');
    });

    it('dead session, or no liveness info: an async agent without a notification is completed', () => {
      writeBackgroundSession();
      expect(agentOf('bg0001', false).status).toBe('completed');
      expect(agentOf('bg0001').status).toBe('completed');
      expect(parser.listForSession('s1', CWD).find(a => a.agentId === 'bg0001')!.status).toBe('completed');
    });

    it('a resume by SendMessage after the notification makes it running; a new notification stops it', () => {
      const resumed = [
        taskNotification('bg0001', 'toolu_BG', T(8)),
        sendMessageToolUse('toolu_SM', 'bg0001'),
        resumeResult('toolu_SM', 'bg0001', T(20)),
      ];
      writeBackgroundSession(resumed);
      expect(agentOf('bg0001', true).status).toBe('running');
      writeBackgroundSession([...resumed, taskNotification('bg0001', 'toolu_SM', T(31))]);
      expect(agentOf('bg0001', true).status).toBe('completed');
    });

    it('foreground without a tool_result stays running even when the session is not alive', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_FG', 'Em foreground', 'p-fg'),
      ]);
      writeSubAgent('s1', CWD, 'fg0001', 'p-fg', null);
      writeSubAgentMeta('s1', CWD, 'fg0001', { toolUseId: 'toolu_FG', spawnDepth: 1 });
      expect(agentOf('fg0001', false).status).toBe('running');
    });

    it('a finished foreground agent resumed by SendMessage is running while the session lives', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_FG', 'Em foreground', 'p-fg'),
        agentResult('toolu_FG', 'fg0001'),
        sendMessageToolUse('toolu_SM', 'fg0001'),
        resumeResult('toolu_SM', 'fg0001', T(5)),
      ]);
      writeSubAgent('s1', CWD, 'fg0001', 'p-fg', null);
      writeSubAgentMeta('s1', CWD, 'fg0001', { toolUseId: 'toolu_FG', spawnDepth: 1 });
      expect(agentOf('fg0001', true).status).toBe('running');
      expect(agentOf('fg0001', false).status).toBe('completed');
    });

    function writeParentLaunchingGrandchild(extraInParent: object[] = []): void {
      writeSubAgentLines('pai0001', [
        { type: 'user', isSidechain: true, agentId: 'pai0001', message: { role: 'user', content: 'p-pai' } },
        { type: 'assistant', isSidechain: true, agentId: 'pai0001',
          message: { content: [{ type: 'tool_use', name: 'Agent', id: 'toolu_N', input: { description: 'Neto', prompt: 'p-neto', run_in_background: true } }] } },
        // transcript de sub-agent: sem toolUseResult, só o texto
        { type: 'user', isSidechain: true, agentId: 'pai0001', timestamp: T(1),
          message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_N', content: [{ type: 'text',
            text: 'Async agent launched successfully.\nagentId: neto0001 (internal ID - do not mention to user.)' }] }] } },
        ...extraInParent,
      ]);
      writeSubAgentMeta('s1', CWD, 'pai0001', { toolUseId: 'toolu_P', spawnDepth: 1 });
      writeSubAgent('s1', CWD, 'neto0001', 'p-neto', null);
      writeSubAgentMeta('s1', CWD, 'neto0001', { description: 'Neto', toolUseId: 'toolu_N', spawnDepth: 2 });
    }

    it('nested: a grandchild launched in background by a sub-agent is running while the session lives', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_P', 'Pai', 'p-pai'),
      ]);
      writeParentLaunchingGrandchild();
      expect(agentOf('neto0001', true).status).toBe('running');
      expect(agentOf('neto0001', true).parentAgentId).toBe('pai0001');
      expect(agentOf('neto0001', false).status).toBe('completed');
    });

    // Review Focus 4
    it('a resume recorded in the main for a grandchild stopped in its parent transcript wins by timestamp', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_P', 'Pai', 'p-pai'),
        sendMessageToolUse('toolu_SM', 'neto0001'),
        resumeResult('toolu_SM', 'neto0001', T(10)),
      ]);
      writeParentLaunchingGrandchild([
        { type: 'user', isSidechain: true, agentId: 'pai0001', timestamp: T(5),
          message: { role: 'user', content: '<task-notification>\n<task-id>neto0001</task-id>\n<tool-use-id>toolu_N</tool-use-id>\n<status>completed</status>\n</task-notification>' } },
      ]);
      expect(agentOf('neto0001', true).status).toBe('running');
    });

    it('legacy prompt matching (no meta.json) also follows the lifecycle', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUse('toolu_L', 'legacy-bg', 'p-legacy'),
        asyncLaunchResult('toolu_L', 'lg0001', T(0)),
      ]);
      writeSubAgent('s1', CWD, 'lg0001', 'p-legacy', null);
      expect(agentOf('lg0001', true).status).toBe('running');
      expect(agentOf('lg0001', false).status).toBe('completed');
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: FAIL nos testes que esperam `running` para assíncronos (`live session: an async agent without a notification is running`, `a resume by SendMessage…`, `a finished foreground agent resumed…`, `nested…`, `a resume recorded in the main…`, `legacy prompt matching…`) — o status vem `completed`. Os testes que esperam `completed` ou o foreground `running` passam já. Os casos antigos continuam verdes.

- [ ] **Step 3: Implementar no parser**

Em `src/services/todosParser.ts`:

1. Acrescentar o import, depois da linha `import { TranscriptActivity } from './transcriptActivity';`:

```ts
import { collectAgentLifecycle, mergeLifecycles, type LifecycleEntry } from './agentLifecycle';
```

2. Trocar a assinatura e a chamada em `listSessionDetail` (linhas 214-218 e 239):

```ts
  // `alive`: a sessão tem processo do Claude Code vivo (registro em
  // ~/.claude/sessions). Sem a opção, nenhum sub-agent assíncrono conta como
  // rodando — o comportamento de antes do R6.
  listSessionDetail(sessionId: string, cwd: string, opts: { alive?: boolean } = {}): {
    agents: AgentTodos[];
    awaitingInput: AwaitingInput | null;
    pendingQuestions: PendingQuestion[];
  } {
```

e

```ts
    agents.push(...this.listSubAgents(sessionId, cwd, mainLines, opts.alive === true));
```

3. Em `listSubAgents`, trocar a assinatura (linha 289):

```ts
  private listSubAgents(sessionId: string, cwd: string, mainLines: string[], sessionAlive: boolean): AgentTodos[] {
```

4. Na `interface FileInfo` (linhas 303-311), acrescentar o campo depois de `dispatches`:

```ts
      dispatches: Map<string, Dispatch>;
      lifecycle: Map<string, LifecycleEntry>;
```

e no `infos.push({...})` (linhas 319-327), depois de `dispatches: this.collectDispatches(lines, false),`:

```ts
        lifecycle: collectAgentLifecycle(lines),
```

5. Logo depois do laço que monta o `index` (depois da linha 343, antes do comentário `// Pass 2`), acrescentar:

```ts
    // R6: ciclo de vida dos sub-agents assíncronos (lançamento, retomada e
    // <task-notification>), juntando o transcript principal e os de cada
    // sub-agent — um neto é lançado no transcript do pai. O tool_result de um
    // disparo em background chega na hora, então não serve de fim; o ciclo de
    // vida decide, e só com a sessão viva (sem processo, nada roda).
    const lifecycle = mergeLifecycles([
      collectAgentLifecycle(mainLines),
      ...infos.map(i => i.lifecycle),
    ]);
    const statusOf = (agentId: string, dispatch: Dispatch): 'running' | 'completed' =>
      dispatch.result === 'none' || (sessionAlive && lifecycle.get(agentId)?.state === 'running')
        ? 'running'
        : 'completed';
```

6. No caminho do meta (linha 366), trocar:

```ts
          agent.status = entry.dispatch.result === 'completed' ? 'completed' : 'running';
```

por:

```ts
          agent.status = statusOf(info.agentId, entry.dispatch);
```

7. No caminho legado (linha 396), trocar:

```ts
          status: matched.entry.dispatch.result === 'completed' ? 'completed' : 'running',
```

por:

```ts
          status: statusOf(info.agentId, matched.entry.dispatch),
```

8. No comentário de `collectDispatches` (linhas 415-427), depois da frase `'completed' = terminou;`, acrescentar ao texto: `(para disparos em background o tool_result chega na hora — quem decide o fim é o ciclo de vida, ver listSubAgents)`.

- [ ] **Step 4: Rodar os testes do parser**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: PASS (todos, antigos e novos).

- [ ] **Step 5: Escrever os testes do snapshot (falham)**

Em `tests/services/snapshotService.test.ts`, inserir antes do `});` final de `describe('SnapshotService', ...)` — depois do teste `'does not mark taskToolsOff without a flag reader (hosts that do not inject one)'`:

```ts
  it('passes the liveness of the chosen session to the parser (R6)', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };
    const received: unknown[] = [];
    const parser = {
      ...makeParser({ mtimes: { a: 10 } }),
      listSessionDetail: (_sessionId: string, _cwd: string, opts?: unknown) => {
        received.push(opts);
        return { agents: [], awaitingInput: null, pendingQuestions: [] };
      },
    };
    new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ a: {} }), namesStub() as any).build();
    new SnapshotService(resolver as any, parser as any, usageStub as any).build();
    expect(received).toEqual([{ alive: true }, { alive: false }]);
  });

  // Review Focus 5
  it('a pinned session that is no longer alive is read with alive: false', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'fixada', terminalPid: null, startedAt: 1 },
    ] };
    const received: unknown[] = [];
    const parser = {
      ...makeParser({ mtimes: { viva: 5, fixada: 1 } }),
      listSessionDetail: (_sessionId: string, _cwd: string, opts?: unknown) => {
        received.push(opts);
        return { agents: [], awaitingInput: null, pendingQuestions: [] };
      },
    };
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    svc.setPinnedSession('fixada');
    expect(svc.build()?.sessionId).toBe('fixada');
    expect(received).toEqual([{ alive: false }]);
  });
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run tests/services/snapshotService.test.ts`
Expected: FAIL nos dois testes novos — `received` vem `[undefined, undefined]` / `[undefined]`.

- [ ] **Step 7: Implementar no snapshot**

Em `src/services/snapshotService.ts`, trocar a linha 59:

```ts
    const detail = this.parser.listSessionDetail(chosen.sessionId, chosen.cwd);
```

por:

```ts
    // R6: sub-agent em background só roda com o processo da sessão vivo.
    const detail = this.parser.listSessionDetail(chosen.sessionId, chosen.cwd, { alive: chosen.alive === true });
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run tests/services/snapshotService.test.ts tests/services/todosParser.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/services/todosParser.ts src/services/snapshotService.ts tests/services/todosParser.test.ts tests/services/snapshotService.test.ts
git commit -m "fix(parser): sub-agent em background fica rodando ate a task-notification (R6)

O tool_result de um Agent em background chega na hora (async_launched) e o parser o tratava como fim: o no ia para o historico e a faixa de lista defasada nunca aparecia. O status agora segue o ciclo de vida (lancamento, retomada por SendMessage, task-notification) e so vale com a sessao viva; o foreground nao muda.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Notifier — sub-agent rodando conta como atividade

**Files:**
- Modify: `src/services/sessionNotifier.ts` (`NotifierInput`, campo privado, `observe`, `shouldPoll`)
- Modify: `src/core/sessionCore.ts:122-137` (`observeForNotifications`)
- Test: `tests/services/sessionNotifier.test.ts` (describe novo no fim de `describe('SessionNotifier')`)
- Test: `tests/core/sessionCore.test.ts` (caso novo no fim de `describe('SessionCore')`)

**Interfaces:**
- Consumes (Task 3): sub-agent assíncrono com `status: 'running'` no `SessionSnapshot.agents` enquanto a sessão está viva.
- Produces: `NotifierInput.subAgentRunning?: boolean`; `SessionNotifier.shouldPoll(now)` devolve `true` enquanto o último observe teve `subAgentRunning`.

- [ ] **Step 1: Escrever os testes do notifier (falham)**

Em `tests/services/sessionNotifier.test.ts`, inserir antes do `});` final de `describe('SessionNotifier', ...)` (depois do `describe('shouldPoll', ...)`):

```ts
  describe('sub-agents rodando (R6)', () => {
    it('does not fire idle while a sub-agent runs, even long after the main went quiet', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
      for (let t = c1 + 10_000; t <= c1 + 10 * 60_000; t += 10_000) {
        expect(n.observe({ sessionId: 's1', mtime: c1, allComplete: false, subAgentRunning: true, now: t })).toEqual([]);
      }
    });

    it('fires idle once the sub-agents finish and the main goes quiet, even after a short wrap-up', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, subAgentRunning: true, now: T0 });
      // main parado, agentes trabalhando por 5 min (observes a cada 10 s, como o timer)
      let t = T0 + 10_000;
      for (; t <= T0 + 5 * 60_000; t += 10_000) {
        expect(n.observe({ sessionId: 's1', mtime: 0, allComplete: false, subAgentRunning: true, now: t })).toEqual([]);
      }
      // a notificação de conclusão chega ao main (mensagem nova) e o main fecha o turno em 20 s
      expect(n.observe({ sessionId: 's1', mtime: t, allComplete: false, subAgentRunning: false, now: t })).toEqual([]);
      const wrapUp = t + 20_000;
      expect(n.observe({ sessionId: 's1', mtime: wrapUp, allComplete: false, subAgentRunning: false, now: wrapUp })).toEqual([]);
      expect(n.observe({ sessionId: 's1', mtime: wrapUp, allComplete: false, subAgentRunning: false, now: wrapUp + IDLE_MS }))
        .toEqual(['idle']);
    });

    it('shouldPoll stays true while a sub-agent runs, even with no burst and past IDLE_MS', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 1, allComplete: false, subAgentRunning: true, now: T0 });
      expect(n.shouldPoll(T0 + 1_000)).toBe(true);
      n.observe({ sessionId: 's1', mtime: 1, allComplete: false, subAgentRunning: true, now: T0 + 10 * 60_000 });
      expect(n.shouldPoll(T0 + 10 * 60_000 + 1_000)).toBe(true);
    });

    it('shouldPoll goes back to the usual rule once no sub-agent runs', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 1, allComplete: false, subAgentRunning: true, now: T0 });
      n.observe({ sessionId: 's1', mtime: 1, allComplete: false, subAgentRunning: false, now: T0 + 1_000 });
      expect(n.shouldPoll(T0 + 2_000)).toBe(false); // sem rajada mínima, nada pode disparar
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/sessionNotifier.test.ts`
Expected: FAIL em três testes novos — `does not fire idle while a sub-agent runs…` (recebe `['idle']` depois de 45 s), `fires idle once the sub-agents finish…` (recebe `[]` no fim) e `shouldPoll stays true…` (recebe `false`). TypeScript não acusa o campo desconhecido no runtime do vitest; o typecheck acusaria — é o próximo passo.

- [ ] **Step 3: Implementar no notifier**

Em `src/services/sessionNotifier.ts`:

1. Na `interface NotifierInput`, entre `awaitingInput` e `now`:

```ts
  // R6: algum sub-agent rodando (inclusive em background). Conta como
  // atividade: o main pode estar em silêncio só esperando por ele.
  subAgentRunning?: boolean;
```

2. Na classe, depois de `private prevAwaiting: AwaitingInput | null = null;`:

```ts
  private subAgentRunning = false;
```

3. No ramo de troca/estreia de sessão do `observe`, antes do `return [];`:

```ts
      this.subAgentRunning = input.subAgentRunning === true;
```

4. Trocar o bloco de atividade:

```ts
    if (input.mtime !== this.lastMtime) {
      // Atividade. Se o silêncio anterior já tinha vencido IDLE_MS, esta
      // mudança abre uma NOVA rajada (o ciclo de idle rearma).
```

por:

```ts
    const running = input.subAgentRunning === true;
    if (input.mtime !== this.lastMtime || running) {
      // Atividade: mensagem nova no main ou sub-agent rodando. Se o silêncio
      // anterior já tinha vencido IDLE_MS, abre uma NOVA rajada (o ciclo de
      // idle rearma). Sub-agent rodando mantém a rajada viva, então o idle do
      // fim inclui o trabalho dos agentes mesmo se o main fechar rápido.
```

(o corpo do `if` e o `else if` do idle continuam iguais) e, antes do `return out;` final do `observe`:

```ts
    this.subAgentRunning = running;
```

5. Em `shouldPoll`, depois de `if (this.sessionId === null) return false;`:

```ts
    // Com sub-agent rodando o timer não pode parar: um comando longo e
    // silencioso do agente partiria a rajada e o idle do fim nunca sairia.
    if (this.subAgentRunning) return true;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/services/sessionNotifier.test.ts`
Expected: PASS (todos, antigos e novos).

- [ ] **Step 5: Escrever o teste do core (falha)**

Em `tests/core/sessionCore.test.ts`, inserir antes do `});` final de `describe('SessionCore', ...)`:

```ts
  it('keeps polling while a background sub-agent of a live session runs (R6)', () => {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    const subDir = path.join(projDir, SID, 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), [
      { type: 'assistant', timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'Agent', id: 'toolu_BG', input: { description: 'bg', prompt: 'p-bg', run_in_background: true } },
      ] } },
      { type: 'user', timestamp: '2026-10-01T10:00:01.000Z',
        toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'bg0001' },
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_BG', content: 'Async agent launched successfully.\nagentId: bg0001' }] } },
    ].map(l => JSON.stringify(l)).join('\n'));
    fs.writeFileSync(path.join(subDir, 'agent-bg0001.jsonl'),
      JSON.stringify({ type: 'user', isSidechain: true, agentId: 'bg0001', message: { role: 'user', content: 'p-bg' } }));
    fs.writeFileSync(path.join(subDir, 'agent-bg0001.meta.json'),
      JSON.stringify({ agentType: 'general-purpose', description: 'bg', toolUseId: 'toolu_BG', spawnDepth: 1 }));
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
    // registro vivo: o pid deste processo de teste está vivo
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: SID, cwd: CWD }));

    let now = 1_000_000;
    const core = new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now });
    expect(core.buildSnapshot()?.agents.find(a => a.agentId === 'bg0001')?.status).toBe('running');
    core.observeForNotifications();   // a primeira observação só inicializa
    now += 10 * 60_000;               // 10 min sem mensagem nova no main
    expect(core.observeForNotifications().kinds).toEqual([]);
    expect(core.shouldPollNotifications()).toBe(true);
  });
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run tests/core/sessionCore.test.ts`
Expected: FAIL no teste novo — `shouldPollNotifications()` vem `false` (o core ainda não passa `subAgentRunning`).

- [ ] **Step 7: Implementar no core**

Em `src/core/sessionCore.ts`, dentro de `observeForNotifications()`, trocar:

```ts
    const awaitingInput = snapshot.awaitingInput ?? null;
    const kinds = this.notifier.observe({
      sessionId: snapshot.sessionId, mtime, allComplete, awaitingInput, now: this.now(),
    });
```

por:

```ts
    const awaitingInput = snapshot.awaitingInput ?? null;
    // R6: sub-agent rodando (inclusive em background) é atividade da sessão.
    const subAgentRunning = snapshot.agents.some(a => !a.isMain && a.status === 'running');
    const kinds = this.notifier.observe({
      sessionId: snapshot.sessionId, mtime, allComplete, awaitingInput, subAgentRunning, now: this.now(),
    });
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run tests/core/sessionCore.test.ts tests/services/sessionNotifier.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/services/sessionNotifier.ts src/core/sessionCore.ts tests/services/sessionNotifier.test.ts tests/core/sessionCore.test.ts
git commit -m "fix(notify): sub-agent rodando conta como atividade, sem toast de ociosa (R6)

Com agentes em background o main fica em silencio esperando e o toast de ociosa saia 45 s depois, com o trabalho em andamento (o mesmo defeito do idle_prompt oficial, #93672). Sub-agent rodando agora mantem a rajada viva e o timer armado; o idle sai quando os agentes e o fechamento do main terminam.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: CHANGELOG, ROADMAP e verificação com dados reais

**Files:**
- Modify: `CHANGELOG.md` (seção `## [Unreleased]`)
- Modify: `docs/ROADMAP.md` (R6, item 2 e a nota da fila)

**Interfaces:**
- Consumes: as Tasks 1-4 entregues.
- Produces: nada de código.

- [ ] **Step 1: Verificação completa**

Run: `npm run typecheck && npm run check:svelte && npm test && npm run build`
Expected: tudo verde; `npm test` com os testes novos das Tasks 1-4 passando e nenhum antigo quebrado.

- [ ] **Step 2: Verificar com um transcript real**

Criar **fora do repositório** (scratchpad da sessão ou `%TEMP%`) o arquivo `verify-r6.mts`:

```ts
// Roda o parser novo sobre um transcript real e lista os sub-agents rodando
// com e sem a sessão viva. Uso: npx tsx verify-r6.mts <sessionId> <cwd>
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const [sessionId, cwd] = process.argv.slice(2);
const mod = await import(pathToFileURL(path.join(process.cwd(), 'src', 'services', 'todosParser.ts')).href);
const parser = new mod.TodosParser(path.join(os.homedir(), '.claude'));
for (const alive of [false, true]) {
  const subs = parser.listSessionDetail(sessionId, cwd, { alive }).agents.filter((a: { isMain: boolean }) => !a.isMain);
  const running = subs.filter((a: { status?: string }) => a.status === 'running');
  console.log(`alive=${alive}: ${subs.length} sub-agents, ${running.length} rodando`);
  for (const a of running) console.log(`  ${a.agentId} ${a.name}`);
}
```

Run (da raiz do repositório ou do worktree): `npx tsx <caminho>/verify-r6.mts 04061916-3a7b-436a-8ffa-6ac4a5173972 "C:\@work\MyProjects\claude-ops"`

Expected: com `alive=true` aparecem rodando os 5 agentes cujo último evento é lançamento ou retomada (órfãos da sessão encerrada): `a7b0b89dc441290d4`, `a7eaabf453bbd4347`, `ac3ac064136bb855f`, `ad53eab9eafb7c81d`, `ae864a67cca165450`. Com `alive=false` eles aparecem concluídos. Um agente em foreground sem `tool_result` apareceria rodando nas duas linhas; se aparecer algum, conferir no transcript que o disparo de fato não tem `tool_result`. Apagar o script depois.

- [ ] **Step 3: CHANGELOG**

Em `CHANGELOG.md`, logo abaixo de `## [Unreleased]` (e antes de `## [0.19.0] - 2026-09-07`), inserir:

```markdown

### Fixed
- **Background sub-agents no longer show as finished while they run.** When the `Agent` tool runs in the background, Claude Code answers the call right away (`status: "async_launched"`), and the panel took that answer as the end of the agent: the node moved to the history group and the stale-list hint never showed. Sub-agents now follow their lifecycle in the parent transcript — launch, resume via `SendMessage`, and the `<task-notification>` that ends each run — and count as running only while the session's Claude Code process is alive, so agents orphaned by a session that ended don't stay "running" forever (upstream [#94872](https://github.com/anthropics/claude-code/issues/94872)). Measured on 30 days of local transcripts: 103 of 473 dispatches ran in the background, still working a median of 7.5 minutes after the panel had marked them done. Roadmap R6; spec `docs/specs/2026-10-05-subagents-background-e-janela-fable-design.md`.
- **No "idle" notification while sub-agents are still working.** A running sub-agent now counts as session activity, so the toast waits until the background work and the main agent's wrap-up are both over — the same problem Claude Code fixed in its own `idle_prompt` hook in 2.1.288 (upstream [#93672](https://github.com/anthropics/claude-code/issues/93672)). Roadmap R6.
- **Fable's context window is 1M.** The transcript records the model id without a `[1m]` suffix (`claude-fable-5-1`), so the panel measured Fable sessions against 200k until they passed it: 150k of context showed as 75% (yellow) instead of 15%. Fable now gets the same 1M window as Opus and Sonnet; on Pro and Team plans without usage credits, where Fable runs on 200k, the bar under-reports, as it already does for Opus and Sonnet there. Roadmap item 2.
```

- [ ] **Step 4: ROADMAP**

Em `docs/ROADMAP.md`:

1. Trocar o título do R6:

```markdown
### R6. Sub-agents em background: estado e notificação 🐛 bug nosso confirmado — 📐 prioridade
```

por:

```markdown
### R6. Sub-agents em background: estado e notificação ✅ CORRIGIDO (achados 1 e 2 · 2026-10-05 · aguardando release)
```

e, logo abaixo dele (antes de `- **Origem:** varredura 2026-10-04`), inserir:

```markdown
- **✅ Corrigido (2026-10-05):** status pelo ciclo de vida por `agentId` (lançamento
  `async_launched`, retomada por `SendMessage`, `<task-notification>`), só com a sessão viva;
  sub-agent rodando conta como atividade no notifier. Spec:
  [docs/specs/2026-10-05-subagents-background-e-janela-fable-design.md](specs/2026-10-05-subagents-background-e-janela-fable-design.md)
  · plano: [docs/plans/2026-10-05-subagents-background-e-janela-fable.md](plans/2026-10-05-subagents-background-e-janela-fable.md).
  Medido no brainstorm: o modelo fecha 100% no disco (103 assíncronos, 90 notificados sem
  atividade depois, 31 retomadas, 13 órfãos em sessões mortas).
```

2. No item 2, trocar o começo do bullet:

```markdown
- **⚠️ Bug (varredura 2026-10-04) — janela do Fable detectada como 200k.**
```

por:

```markdown
- **✅ Corrigido em 2026-10-05 (aguardando release): Fable = 1M, como Opus e Sonnet** (decisão
  do brainstorm, com a ressalva do Pro/Team abaixo). **Bug (varredura 2026-10-04) — janela do
  Fable detectada como 200k.**
```

3. Na nota `**Atualização 2026-10-04:**` da fila (bloco de citação em "Apostas de produto"), acrescentar ao fim do parágrafo: ` **2026-10-05:** R6 (achados 1 e 2) e o bug do Fable corrigidos; o próximo é o spike do mod (item 25) e depois o posicionamento.`

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/ROADMAP.md
git commit -m "docs: CHANGELOG e ROADMAP para R6 e a janela do Fable

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6 (controlador, depois do merge): board e verificação manual**

Fechar os dois cards do board `pessoal`, depois de conferir com `python "$CLAUDE_OPS_ROOT/tools/board.py" --ws pessoal card <id>` que não há ações abertas:

```bash
python "$CLAUDE_OPS_ROOT/tools/board.py" --ws pessoal close todos-subagents-background "Corrigido (R6, achados 1 e 2): status pelo ciclo de vida por agentId, so com a sessao viva; sub-agent rodando conta como atividade no notifier. Entra na proxima release."
python "$CLAUDE_OPS_ROOT/tools/board.py" --ws pessoal close todos-janela-fable "Corrigido: Fable = 1M, como Opus e Sonnet (ressalva do Pro/Team sem usage credits no CHANGELOG). Entra na proxima release."
``` Pedir ao usuário a verificação manual: F5 (Extension Development Host), uma sessão que dispare um agente em background — o nó aparece rodando e aberto, sai do histórico; quando o agente termina vira concluído; o toast de ociosa só sai depois que tudo terminou.
