# Todos Clicáveis → Transcript — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar numa task do painel abre o `.jsonl` do agente no editor com a linha da última mudança de status selecionada.

**Architecture:** O parser anota `sourceLine` (0-based, no arquivo do próprio agente) durante as passadas existentes dos dois schemas; o `TodoItem` clicável envia `{sessionId, agentId, line}` num tipo novo de `WebviewMessage`; a extensão resolve o path com os helpers existentes e abre via `showTextDocument`. Transcripts são append-only — o índice de linha é estável. Spec: [docs/specs/2026-07-14-clickable-todos-design.md](../specs/2026-07-14-clickable-todos-design.md).

**Tech Stack:** TypeScript, Svelte 5 (runes + snippets), vitest. Sem dependências novas.

## Global Constraints

- Sem dependências novas em `package.json`.
- `sourceLine` anexado **só quando definido** (via `makeTodo`, padrão do repo).
- Semântica: linha da **última transição de status** (task nova no snapshot conta como transição; reaparição após ausência conta, coerente com o reset de timing existente).
- Limitação documentada: no schema TodoWrite, snapshots **sem `timestamp`** são pulados (comportamento atual de `extractTodoWriteTimings`) → todos sem timestamp não ganham `sourceLine` e o item não é clicável (degradação para o comportamento de hoje).
- `agentId` validado com `SAFE_SESSION_ID` antes de compor path (defesa contra traversal).
- Strings novas nos TRÊS idiomas (`todo.openSource`, `todo.sourceMissing`).
- Item sem `sourceLine` → inerte como hoje (sem cursor pointer).
- Comentários em português; commits em português, conventional style.
- No Windows `npm test` pode terminar com ruído `EPERM ... kill` do teardown — conhecido, NÃO é falha; vale o `Tests N passed`.

---

### Task 1: Parser — `sourceLine` nos dois schemas

**Files:**
- Modify: `src/types.ts` (campo em `Todo`)
- Modify: `src/services/todosParser.ts` (`makeTodo`, `extractTodoWriteTimings`, merge em `readLastTodosFromLines`, `readTaskStream`)
- Test: `tests/services/todosParser.test.ts` (testes novos + atualização de asserções `toEqual` existentes do schema Task)

**Interfaces:**
- Consumes: nada novo.
- Produces (Task 3 depende): `Todo.sourceLine?: number` — linha 0-based no transcript do próprio agente onde a task atingiu o status atual.

- [ ] **Step 1: Campo em `src/types.ts`**

Na interface `Todo`, após `completedAt?: number;`:

```ts
  sourceLine?: number;   // linha (0-based) no transcript DO AGENTE onde a task
                         // atingiu o status atual; ausente se não determinável
```

- [ ] **Step 2: Escrever os testes novos que falham**

Em `tests/services/todosParser.test.ts`, adicionar um novo `describe` (junto do describe de timing):

```ts
  describe('sourceLine (todos clicáveis)', () => {
    it('points to the line of the LAST status transition (TodoWrite)', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'pending' }], { timestamp: '2026-06-12T10:00:00.000Z' }),     // linha 0
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:01:00.000Z' }), // linha 1
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'completed' }], { timestamp: '2026-06-12T10:02:00.000Z' }),   // linha 2
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(2);
    });

    it('keeps the transition line when later snapshots repeat the status', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:00:00.000Z' }), // linha 0 (transição)
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:05:00.000Z' }), // linha 1 (repete)
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(0);
    });

    it('reused content in a new round points to the new round', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'in_progress' }], { timestamp: '2026-06-12T10:00:00.000Z' }), // linha 0
        todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'completed' }], { timestamp: '2026-06-12T10:01:00.000Z' }),   // linha 1
        todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'in_progress' }], { timestamp: '2026-06-12T10:10:00.000Z' }), // linha 2 (reabre)
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(2);
    });

    it('is undefined when snapshots have no timestamp', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }]),
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBeUndefined();
    });

    it('pending task keeps the line where it entered the list (TodoWrite)', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'pending' }], { timestamp: '2026-06-12T10:00:00.000Z' }), // linha 0 (nova)
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'pending' }], { timestamp: '2026-06-12T10:01:00.000Z' }), // linha 1 (repete)
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(0);
    });
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: FAIL — os 5 testes novos com `sourceLine` `undefined`/errado. (Os antigos ainda passam neste ponto.)

- [ ] **Step 4: Implementar no `todosParser.ts`**

**4a. `makeTodo` ganha o 6º parâmetro:**

```ts
function makeTodo(
  content: string,
  activeForm: string,
  status: TodoStatus,
  startedAt?: number,
  completedAt?: number,
  sourceLine?: number,
): Todo {
  const todo: Todo = { content, activeForm, status };
  if (startedAt !== undefined) todo.startedAt = startedAt;
  if (completedAt !== undefined) todo.completedAt = completedAt;
  if (sourceLine !== undefined) todo.sourceLine = sourceLine;
  return todo;
}
```

**4b. `extractTodoWriteTimings` — substituir o método inteiro por:**

```ts
  // Varre os snapshots do TodoWrite em ordem cronológica e registra, por
  // `content`: timings (primeiro in_progress/completed do streak — ver regras
  // de reset abaixo) e a linha da ÚLTIMA transição de status (`sourceLine`),
  // para o clique "abrir no transcript". Casa por `content` por ser estável a
  // reordenações da lista entre snapshots.
  private extractTodoWriteTimings(
    lines: string[],
    skipSidechain: boolean,
  ): Map<string, { startedAt?: number; completedAt?: number; sourceLine?: number }> {
    const timings = new Map<string, { startedAt?: number; completedAt?: number; sourceLine?: number }>();
    // Último status observado por content — detecta TRANSIÇÕES. 'absent' =
    // sumiu do snapshot; uma reaparição conta como transição (novo streak).
    const prevStatus = new Map<string, TodoStatus | 'absent'>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.indexOf('"name":"TodoWrite"') < 0) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      if (skipSidechain && entry.isSidechain) continue;
      const ts = parseEpoch(entry.timestamp);
      if (ts === undefined) continue;
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type !== 'tool_use' || block.name !== 'TodoWrite') continue;
        const raw = block.input?.todos;
        if (!Array.isArray(raw)) continue;
        const seen = new Set<string>();
        for (const item of raw) {
          if (!this.isValidTodo(item)) continue;
          seen.add(item.content);
          const prev = prevStatus.get(item.content);
          const changed = prev !== item.status; // task nova/reaparecida também conta
          if (item.status === 'in_progress') {
            // Entrou agora em in_progress → novo streak (zera timing anterior).
            if (prev !== 'in_progress') timings.set(item.content, { startedAt: ts, sourceLine: i });
          } else if (item.status === 'completed') {
            const rec = timings.get(item.content) ?? {};
            if (rec.completedAt === undefined) rec.completedAt = ts;
            if (changed) rec.sourceLine = i;
            timings.set(item.content, rec);
          } else {
            // pending = ainda não começou nesta rodada (zera timings); guarda a
            // linha em que ENTROU em pending, mantendo-a enquanto repetir.
            const kept = changed ? i : timings.get(item.content)?.sourceLine;
            timings.set(item.content, kept !== undefined ? { sourceLine: kept } : {});
          }
          prevStatus.set(item.content, item.status);
        }
        // Tasks que sumiram deste snapshot: reaparição futura = novo streak.
        for (const key of prevStatus.keys()) {
          if (!seen.has(key)) prevStatus.set(key, 'absent');
        }
      }
    }
    return timings;
  }
```

**4c. Merge em `readLastTodosFromLines` — trocar o `map` por:**

```ts
      return todos.map(t => {
        const timing = timings.get(t.content);
        return timing
          ? makeTodo(t.content, t.activeForm, t.status, timing.startedAt, timing.completedAt, timing.sourceLine)
          : t;
      });
```

**4d. `readTaskStream` — três mudanças:**

O map de tasks ganha `sourceLine`:

```ts
    const tasks = new Map<string, {
      content: string; activeForm: string; status: TodoStatus;
      startedAt?: number; completedAt?: number; sourceLine?: number;
    }>();
```

`pendingCreates` guarda a linha do create:

```ts
    const pendingCreates = new Map<string, { content: string; activeForm: string; createLine: number }>();
```

O loop vira indexado (`for (let i = 0; i < lines.length; i++) { const line = lines[i]; ... }`) e:

- No branch do `TaskCreate`, o `set` passa a incluir a linha:

```ts
              pendingCreates.set(block.id, {
                content: subject,
                activeForm: typeof activeForm === 'string' ? activeForm : subject,
                createLine: i,
              });
```

- No branch do `TaskUpdate`, dentro do `if (t)` junto da atribuição de status:

```ts
                t.status = status as TodoStatus;
                t.sourceLine = i;
```

- Na resolução do create (`tool_result`):

```ts
          if (taskId && !tasks.has(taskId)) {
            tasks.set(taskId, {
              content: pending.content,
              activeForm: pending.activeForm,
              status: 'pending',
              sourceLine: pending.createLine,
            });
            order.push(taskId);
          }
```

- No `return` final:

```ts
    return order.map(id => {
      const t = tasks.get(id)!;
      return makeTodo(t.content, t.activeForm, t.status, t.startedAt, t.completedAt, t.sourceLine);
    });
```

- [ ] **Step 5: Atualizar as asserções `toEqual` existentes do schema Task**

Os testes do describe `TaskCreate/TaskUpdate schema (AGENT_TEAMS)` comparam objetos inteiros — agora ganham `sourceLine`. Atualizar EXATAMENTE assim (linhas = índice 0-based no array passado a `writeTranscript`/arquivo do sub-agent):

1. `reconstructs todos from a stream of TaskCreate calls (all pending)` — creates nas linhas 0/2/4:

```ts
      expect(agents[0].todos).toEqual([
        { content: 'first task', activeForm: 'Doing first', status: 'pending', sourceLine: 0 },
        { content: 'second task', activeForm: 'Doing second', status: 'pending', sourceLine: 2 },
        { content: 'third task', activeForm: 'Doing third', status: 'pending', sourceLine: 4 },
      ]);
```

2. `applies TaskUpdate status changes by taskId` — updates finais nas linhas 5 e 6:

```ts
      expect(agents[0].todos).toEqual([
        { content: 'a', activeForm: 'A', status: 'completed', sourceLine: 5 },
        { content: 'b', activeForm: 'B', status: 'in_progress', sourceLine: 6 },
      ]);
```

3. `falls back to parsing Task #N from the result content when toolUseResult is absent` — update na linha 2:

```ts
      expect(agents[0].todos).toEqual([
        { content: 'only task', activeForm: 'Only', status: 'completed', sourceLine: 2 },
      ]);
```

4. `ignores TaskUpdate referring to an unknown taskId` — update ignorado; fica a linha do create (0):

```ts
      expect(agents[0].todos).toEqual([
        { content: 'a', activeForm: 'A', status: 'pending', sourceLine: 0 },
      ]);
```

5. `treats Task* on the main thread (non-sidechain) as the main agent list` — create do main na linha 0:

```ts
      expect(agents[0].todos).toEqual([
        { content: 'main task', activeForm: 'Doing main', status: 'pending', sourceLine: 0 },
      ]);
```

6. `uses the most recent schema when both TodoWrite and TaskCreate exist` — create na linha 1:

```ts
      expect(agents[0].todos).toEqual([
        { content: 'new schema', activeForm: 'New', status: 'pending', sourceLine: 1 },
      ]);
```

7. `renders sub-agent task lists in the new schema` — no arquivo do sub-agent: user(0), create(1), result(2), update(3):

```ts
      expect(subAgent!.todos).toEqual([
        { content: 'sub item', activeForm: 'Doing sub item', status: 'in_progress', sourceLine: 3 },
      ]);
```

(Os testes `ignores TaskUpdate with invalid status`, `records startedAt...`, `keeps the first timestamp...` e `leaves timing undefined...` usam acesso por propriedade — não mudam. Nota: no teste 4, o update inválido NÃO sobrescreve a linha porque o `t.sourceLine = i` fica dentro do mesmo `if` que valida taskId+status.)

- [ ] **Step 6: Rodar e ver passar (arquivo inteiro)**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: PASS — novos + antigos atualizados + todos os demais intactos.

- [ ] **Step 7: Suíte completa + commit**

Run: `npm test` → PASS.

```bash
git add src/types.ts src/services/todosParser.ts tests/services/todosParser.test.ts
git commit -m "feat(parser): sourceLine — linha da última transição de status por task"
```

---

### Task 2: Protocolo `openTodoSource` — store, i18n e extension

**Files:**
- Modify: `src/types.ts` (variante em `WebviewMessage`)
- Modify: `src/webview/stores.svelte.ts`
- Modify: `src/i18n/messages.ts` (2 chaves × 3 idiomas)
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `Todo.sourceLine` (Task 1); helpers existentes `transcriptPath`, `subAgentsDir`, `SAFE_SESSION_ID` (`./services/transcriptPaths`).
- Produces (Task 3 depende): `todosStore.openTodoSource(sessionId: string, agentId: string, line: number): void`; chaves i18n `todo.openSource` e `todo.sourceMissing`.

- [ ] **Step 1: Variante em `src/types.ts`**

Em `WebviewMessage`:

```ts
  | { type: 'openTodoSource'; sessionId: string; agentId: string; line: number }
```

- [ ] **Step 2: Método no store (`src/webview/stores.svelte.ts`)**

Junto de `requestProjectUsage`:

```ts
  openTodoSource(sessionId: string, agentId: string, line: number): void {
    this.post({ type: 'openTodoSource', sessionId, agentId, line });
  }
```

- [ ] **Step 3: Chaves i18n (`src/i18n/messages.ts`)**

Em `en`, após `'project.empty'`:

```ts
    'todo.openSource': 'Open in transcript',
    'todo.sourceMissing': 'Transcript not found (the session may have been deleted)',
```

Em `pt-br`, mesma posição:

```ts
    'todo.openSource': 'Abrir no transcript',
    'todo.sourceMissing': 'Transcript não encontrado (a sessão pode ter sido apagada)',
```

Em `es`, mesma posição:

```ts
    'todo.openSource': 'Abrir en el transcript',
    'todo.sourceMissing': 'Transcript no encontrado (la sesión puede haber sido eliminada)',
```

Run: `npx vitest run tests/i18n/messages.test.ts` → PASS.

- [ ] **Step 4: Handler no `src/extension.ts`**

Import novo (junto dos demais de services):

```ts
import { transcriptPath, subAgentsDir, SAFE_SESSION_ID } from './services/transcriptPaths';
```

Em `handleMessage`, novo ramo antes do `pickSession`:

```ts
    } else if (msg.type === 'openTodoSource') {
      void openTodoSource(claudeDir, msg);
```

Função no nível do módulo (após `promptInstallHook`):

```ts
// Abre o transcript do agente no editor, com a linha da mensagem selecionada.
// agentId igual ao sessionId = main agent (transcript principal); qualquer
// outro = sub-agent (agent-<id>.jsonl). Ids fora do padrão seguro são
// ignorados (defesa contra path traversal). Linha além do fim do arquivo:
// o VS Code posiciona no fim — aceitável (transcripts são append-only).
async function openTodoSource(
  claudeDir: string,
  msg: { sessionId: string; agentId: string; line: number },
): Promise<void> {
  if (!SAFE_SESSION_ID.test(msg.agentId)) return;
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!cwd) return;

  let filePath: string | null = null;
  if (msg.agentId === msg.sessionId) {
    filePath = transcriptPath(claudeDir, msg.sessionId, cwd);
  } else {
    const dir = subAgentsDir(claudeDir, msg.sessionId, cwd);
    if (dir) {
      const candidate = path.join(dir, `agent-${msg.agentId}.jsonl`);
      if (fs.existsSync(candidate)) filePath = candidate;
    }
  }
  if (!filePath) {
    const t = createT(resolveLocale());
    void vscode.window.showWarningMessage(t('todo.sourceMissing'));
    return;
  }

  const pos = new vscode.Position(Math.max(0, Math.floor(msg.line)), 0);
  await vscode.window.showTextDocument(vscode.Uri.file(filePath), {
    selection: new vscode.Range(pos, pos),
    preview: true,
  });
}
```

- [ ] **Step 5: Verificar e commitar**

Run: `npx tsc --noEmit` → sem erros. Run: `npm test` → PASS. Run: `npm run build` → 3 alvos ok.

```bash
git add src/types.ts src/webview/stores.svelte.ts src/i18n/messages.ts src/extension.ts
git commit -m "feat(panel): protocolo openTodoSource — abre o transcript na linha da task"
```

---

### Task 3: `TodoItem` clicável + roadmap

**Files:**
- Modify: `src/webview/lib/TodoItem.svelte`
- Modify: `src/webview/lib/AgentSection.svelte` (passa `sessionId`/`agentId`)
- Modify: `docs/ROADMAP.md` (item 1)

**Interfaces:**
- Consumes: `todosStore.openTodoSource(...)` e chave `todo.openSource` (Task 2); `Todo.sourceLine` (Task 1).
- Produces: clique funcionando de ponta a ponta.

- [ ] **Step 1: `TodoItem.svelte` — substituir `<script>` e markup**

`<script>` novo (o bloco `duration` continua igual):

```ts
  import type { Todo } from '../../types';
  import StatusIcon from './StatusIcon.svelte';
  import Icon from './Icon.svelte';
  import { formatDuration } from '../format';
  import { clock } from '../clock.svelte';
  import { todosStore } from '../stores.svelte';

  let { todo, completedMs, sessionId, agentId }:
    { todo: Todo; completedMs?: number; sessionId: string; agentId: string } = $props();

  let label = $derived(todo.status === 'in_progress' ? todo.activeForm : todo.content);
  let clickable = $derived(todo.sourceLine !== undefined);

  let duration = $derived.by(() => {
    if (todo.status === 'in_progress' && todo.startedAt !== undefined) {
      return { live: true, text: formatDuration(clock.now - todo.startedAt) };
    }
    if (todo.status === 'completed' && completedMs !== undefined) {
      return { live: false, text: completedMs < 1000 ? '<1s' : formatDuration(completedMs) };
    }
    return null;
  });

  function open(): void {
    if (todo.sourceLine !== undefined) {
      todosStore.openTodoSource(sessionId, agentId, todo.sourceLine);
    }
  }
```

Markup novo (o conteúdo interno é um snippet para não duplicar entre os dois ramos):

```svelte
{#snippet inner()}
  <StatusIcon status={todo.status} />
  <span class="label">{label}</span>
  {#if duration}
    <span class="duration" class:live={duration.live}>
      {#if duration.live}<Icon name="clock" size={12} />{/if}
      {duration.text}
    </span>
  {/if}
{/snippet}

<li class="todo" class:completed={todo.status === 'completed'} class:in-progress={todo.status === 'in_progress'}>
  {#if clickable}
    <button class="hit" onclick={open} title={todosStore.t('todo.openSource')}>
      {@render inner()}
    </button>
  {:else}
    {@render inner()}
  {/if}
</li>
```

CSS: adicionar ao `<style>` (o restante fica como está):

```css
  /* Botão invisível que envolve o conteúdo quando a task é clicável — herda o
     layout do li e só acrescenta o cursor. */
  .hit {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
```

- [ ] **Step 2: `AgentSection.svelte` — passar as props**

No `{#each}` da lista:

```svelte
        <TodoItem {todo} completedMs={durations[i]} sessionId={agent.sessionId} agentId={agent.agentId} />
```

- [ ] **Step 3: Verificar**

Run: `npx svelte-check` → 0 errors (warnings pré-existentes ok).
Run: `npm test` → PASS. Run: `npm run build` → 3 alvos ok.

- [ ] **Step 4: Verificação visual**

Usar a skill `preview-webview`: task com `sourceLine` mostra cursor pointer + tooltip; task sem `sourceLine` fica inerte; visual idêntico ao atual (ícone, label, duração). Se a skill não estiver disponível ao executor, marcar "pendente para o controller" no report — não improvisar.

- [ ] **Step 5: Roadmap**

Em `docs/ROADMAP.md`, item 1, trocar a linha de status (`- **Status:** 🔍 a investigar (parser atual)`) por:

```
- **Status:** 🚧 implementado — aguardando release 0.12.0. Spec: [docs/specs/2026-07-14-clickable-todos-design.md](specs/2026-07-14-clickable-todos-design.md) · plano: [docs/plans/2026-07-14-clickable-todos.md](plans/2026-07-14-clickable-todos.md). `sourceLine` (última transição de status) nos dois schemas; clique abre o `.jsonl` na linha. Viewer legível: spec futuro sobre a mesma infra.
```

- [ ] **Step 6: Commit**

```bash
git add src/webview/lib/TodoItem.svelte src/webview/lib/AgentSection.svelte docs/ROADMAP.md
git commit -m "feat(panel): task clicável abre o transcript na linha da última transição"
```
