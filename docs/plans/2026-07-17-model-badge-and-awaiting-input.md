# Badge de modelo + notificação "aguardando resposta" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Itens 20+22 do roadmap — badge de modelo atual por agente na árvore (main sempre; sub-agent só quando difere) e toast "aguardando sua resposta" quando há `AskUserQuestion`/`ExitPlanMode` sem resposta no transcript.

**Architecture:** (20) `readFileUsage` ganha `lastModel` na mesma passada; `AgentUsage.currentModel` flui parser → snapshot → webview; regra de exibição em função pura `modelBadge`. (22) função pura `detectAwaitingInput` sobre as linhas do transcript principal (reusa a leitura existente via novo `listSessionDetail`); `SessionSnapshot.awaitingInput` alimenta um novo kind do `SessionNotifier` com disparo na transição e supressão do `idle`.

**Tech Stack:** TypeScript, Svelte 5 (runes), vitest. Sem dependências novas.

**Specs:** [docs/specs/2026-07-17-model-badge-design.md](../specs/2026-07-17-model-badge-design.md) · [docs/specs/2026-07-17-awaiting-input-notification-design.md](../specs/2026-07-17-awaiting-input-notification-design.md)

## Global Constraints

- Módulos de serviço puros não importam `vscode` (padrão do repo; `sessionNotifier`, `todosParser`, `usageParser` seguem assim).
- i18n sempre ×3 (en base + pt-br + es) em `src/i18n/messages.ts` — o catálogo é tipado; faltar um idioma quebra o build.
- Campos novos em tipos do snapshot são **opcionais** e omitidos quando indefinidos (padrão `...(x !== undefined ? { x } : {})`).
- Comandos: testes `npm test`, build `npm run build`. Working dir: raiz do repo.
- Commits pequenos, mensagem em pt-BR no padrão `feat(escopo): ...` / `test(escopo): ...`, rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `lastModel` no usageParser + `AgentUsage.currentModel`

**Files:**
- Modify: `src/types.ts:37-42` (interface `AgentUsage`)
- Modify: `src/services/usageParser.ts:56-89` (`readFileUsage`) e `:98-115` (`usageForSession`)
- Test: `tests/services/usageParser.test.ts` (append no fim do arquivo)

**Interfaces:**
- Consumes: nada novo.
- Produces: `readFileUsage(filePath, skipSidechain): { models: ModelUsage[]; cache: CacheStats; lastModel?: string }`; `AgentUsage.currentModel?: string` (modelo da última entrada com usage do transcript do agente).

- [ ] **Step 1: Write the failing tests**

Append ao fim de `tests/services/usageParser.test.ts` (fora do describe existente; helpers locais):

```ts
describe('readFileUsage — lastModel', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lastmodel-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function entry(model: string, extra: object = {}): object {
    return {
      type: 'assistant',
      ...extra,
      message: { model, role: 'assistant', usage: { input_tokens: 10, output_tokens: 1 } },
    };
  }
  function write(lines: object[]): string {
    const p = path.join(dir, 't.jsonl');
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
    return p;
  }

  it('returns the model of the LAST usage-bearing entry (not the dominant one)', () => {
    const p = write([entry('claude-opus-4-8'), entry('claude-opus-4-8'), entry('claude-sonnet-4-5')]);
    expect(readFileUsage(p, false).lastModel).toBe('claude-sonnet-4-5');
  });

  it('is undefined when the file has no usage entries', () => {
    const p = write([{ type: 'user', message: { role: 'user', content: 'oi' } }]);
    expect(readFileUsage(p, false).lastModel).toBeUndefined();
  });

  it('skips synthetic entries', () => {
    const p = write([entry('claude-opus-4-8'), entry('<synthetic>')]);
    expect(readFileUsage(p, false).lastModel).toBe('claude-opus-4-8');
  });

  it('skips sidechain entries when skipSidechain', () => {
    const p = write([entry('claude-opus-4-8'), entry('claude-haiku-4-5', { isSidechain: true })]);
    expect(readFileUsage(p, true).lastModel).toBe('claude-opus-4-8');
    expect(readFileUsage(p, false).lastModel).toBe('claude-haiku-4-5');
  });
});

describe('usageForSession — currentModel', () => {
  let claudeDir: string;
  const CWD = '/home/user/proj';
  const SID = 's1';
  beforeEach(() => { claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curmodel-')); });
  afterEach(() => { fs.rmSync(claudeDir, { recursive: true, force: true }); });

  function assistant(model: string): object {
    return { type: 'assistant', message: { model, role: 'assistant', usage: { input_tokens: 5, output_tokens: 1 } } };
  }

  it('sets currentModel per agent from each transcript', () => {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(path.join(projDir, SID, 'subagents'), { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`),
      [assistant('claude-opus-4-8')].map(l => JSON.stringify(l)).join('\n'));
    fs.writeFileSync(path.join(projDir, SID, 'subagents', 'agent-a1.jsonl'),
      [assistant('claude-sonnet-4-5')].map(l => JSON.stringify(l)).join('\n'));

    const usage = new UsageParser(claudeDir).usageForSession(SID, CWD, [
      { agentId: SID, name: 'Main agent', isMain: true },
      { agentId: 'a1', name: 'Sub', isMain: false },
    ]);
    expect(usage.byAgent[0].currentModel).toBe('claude-opus-4-8');
    expect(usage.byAgent[1].currentModel).toBe('claude-sonnet-4-5');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/services/usageParser.test.ts`
Expected: FAIL — `lastModel`/`currentModel` são `undefined` onde se espera string (propriedade não existe ainda).

- [ ] **Step 3: Implement**

Em `src/types.ts`, na interface `AgentUsage` (após `models`):

```ts
export interface AgentUsage {
  agentId: string;
  name: string;        // "Main agent" ou nome do sub-agent
  isMain: boolean;
  models: ModelUsage[];
  currentModel?: string;  // modelo da ÚLTIMA entrada com usage do transcript
}
```

Em `src/services/usageParser.ts`, `readFileUsage`: tipo de retorno vira
`{ models: ModelUsage[]; cache: CacheStats; lastModel?: string }`; declarar
`let lastModel: string | undefined;` antes do loop; logo após a linha
`if (msg.model === '<synthetic>') continue;` adicionar `lastModel = msg.model;`
(as entradas sidechain/sem-usage já foram puladas pelos `continue` anteriores);
retornar `{ models: [...byModel.values()], cache, lastModel }` (nos dois `return`
— o do `catch` fica `{ models: [], cache: {...} }` sem `lastModel`).

Em `usageForSession`, trocar a desestruturação e o push:

```ts
const { models, cache, lastModel } = readFileUsage(filePath, agent.isMain);
if (models.length === 0) continue;

byAgent.push({
  agentId: agent.agentId,
  name: agent.name,
  isMain: agent.isMain,
  models,
  ...(lastModel !== undefined ? { currentModel: lastModel } : {}),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/usageParser.test.ts`
Expected: PASS (novos e antigos).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "feat(parser): lastModel por transcript — AgentUsage.currentModel (item 20)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `shortModel` estendido + `modelBadge` (funções puras)

**Files:**
- Modify: `src/webview/format.ts:115-118` (`shortModel`; adicionar `modelBadge` logo abaixo)
- Test: `tests/webview/format.test.ts` (append)

**Interfaces:**
- Consumes: nada.
- Produces: `shortModel(model: string): string` (agora remove sufixo de data legado, preserva `[1m]`); `modelBadge(current: string | undefined, mainModel: string | undefined, isMain: boolean): string | null`.

- [ ] **Step 1: Write the failing tests**

Append em `tests/webview/format.test.ts` (importar `modelBadge` junto com `shortModel` no import de `../../src/webview/format` — se `shortModel` ainda não é importado, adicionar):

```ts
describe('shortModel', () => {
  it('strips the claude- prefix', () => {
    expect(shortModel('claude-opus-4-8')).toBe('opus-4-8');
  });
  it('strips a legacy date suffix', () => {
    expect(shortModel('claude-3-5-sonnet-20241022')).toBe('3-5-sonnet');
  });
  it('strips the date but keeps the [1m] suffix', () => {
    expect(shortModel('claude-sonnet-4-5-20250929[1m]')).toBe('sonnet-4-5[1m]');
  });
  it('passes through an already-short id', () => {
    expect(shortModel('opus-4-8')).toBe('opus-4-8');
  });
});

describe('modelBadge', () => {
  it('main: shows whenever a model exists', () => {
    expect(modelBadge('claude-opus-4-8', undefined, true)).toBe('opus-4-8');
  });
  it('main: null without a model', () => {
    expect(modelBadge(undefined, undefined, true)).toBeNull();
  });
  it('sub-agent: hidden when equal to the main model', () => {
    expect(modelBadge('claude-opus-4-8', 'claude-opus-4-8', false)).toBeNull();
  });
  it('sub-agent: shown when it differs from the main model', () => {
    expect(modelBadge('claude-sonnet-4-5', 'claude-opus-4-8', false)).toBe('sonnet-4-5');
  });
  it('sub-agent: shown when the main has no reference model', () => {
    expect(modelBadge('claude-sonnet-4-5', undefined, false)).toBe('sonnet-4-5');
  });
  it('sub-agent: null without a model', () => {
    expect(modelBadge(undefined, 'claude-opus-4-8', false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/webview/format.test.ts`
Expected: FAIL — casos de data do `shortModel` e `modelBadge is not a function`.

- [ ] **Step 3: Implement**

Em `src/webview/format.ts`, substituir `shortModel` e adicionar `modelBadge`:

```ts
// "claude-opus-4-8" -> "opus-4-8"; sufixo de data legado cai, "[1m]" fica:
// "claude-sonnet-4-5-20250929[1m]" -> "sonnet-4-5[1m]".
export function shortModel(model: string): string {
  return model
    .replace(/^claude-/, '')
    .replace(/-20\d{6}(?=\[1m\]$|$)/, '');
}

// Texto do badge de modelo de um nó da árvore, ou null quando não exibir.
// Main: sempre que houver modelo. Sub-agent: só quando difere do main (a
// exceção é o que salta aos olhos); sem referência do main, mostra o que há.
export function modelBadge(
  current: string | undefined,
  mainModel: string | undefined,
  isMain: boolean,
): string | null {
  if (current === undefined) return null;
  if (!isMain && mainModel !== undefined && current === mainModel) return null;
  return shortModel(current);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/webview/format.test.ts`
Expected: PASS. (A mudança do `shortModel` afeta `UsageTable`/`ProjectUsageSection` só cosmeticamente — ids com data ficam mais curtos, comportamento desejado.)

- [ ] **Step 5: Commit**

```bash
git add src/webview/format.ts tests/webview/format.test.ts
git commit -m "feat(webview): shortModel com data legada + modelBadge (item 20)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: badge na árvore (App → AgentTree → AgentSection) + i18n + visual

**Files:**
- Modify: `src/webview/App.svelte:10-14,41-46`
- Modify: `src/webview/lib/AgentTree.svelte:9-27,34-36`
- Modify: `src/webview/lib/AgentSection.svelte:6,10-11,42-47` (+ bloco `<style>`)
- Modify: `src/i18n/messages.ts` (chave `agent.modelTooltip` nos 3 idiomas)

**Interfaces:**
- Consumes: `modelBadge`/`shortModel` (Task 2), `AgentUsage.currentModel` (Task 1).
- Produces: props novas — `AgentTree`: `mainModel?: string`; `AgentSection`: `currentModel?: string`, `usedModels?: string[]`, `mainModel?: string`.

- [ ] **Step 1: App.svelte — derivar `mainModel`**

No `<script>` (após `hasRunningSubAgent`):

```ts
// Modelo atual do main — referência para o badge dos sub-agents (só difere = mostra).
let mainModel = $derived(snapshot?.usage?.byAgent.find(a => a.isMain)?.currentModel);
```

E na chamada da árvore (linha ~44), adicionar a prop:

```svelte
<AgentTree node={root} usage={snapshot.usage} history={isHistory(root.agent)} {hasRunningSubAgent} {mainModel} />
```

- [ ] **Step 2: AgentTree.svelte — repassar modelo do nó + mainModel**

Props (linhas 9-10):

```ts
let { node, level = 0, usage, history = false, hasRunningSubAgent = false, mainModel }:
  { node: AgentNode; level?: number; usage?: SessionUsage; history?: boolean; hasRunningSubAgent?: boolean; mainModel?: string } = $props();

// Usage deste nó — alimenta o badge de modelo do cabeçalho.
let agentUsage = $derived(usage?.byAgent.find(a => a.agentId === node.agent.agentId));
```

Na chamada de `AgentSection` (linhas 21-27), adicionar:

```svelte
<AgentSection
  agent={node.agent}
  {history}
  defaultExpanded={node.agent.isMain || node.agent.status === 'running'}
  tokens={agentTotalTokens(usage?.byAgent, node.agent.agentId)}
  {hasRunningSubAgent}
  currentModel={agentUsage?.currentModel}
  usedModels={agentUsage?.models.map(m => m.model) ?? []}
  {mainModel}
/>
```

Na recursão (linha ~35), repassar: `<AgentTree node={child} level={childLevel} {usage} history={isHistory(child.agent)} {mainModel} />`

- [ ] **Step 3: AgentSection.svelte — renderizar o badge**

Import (linha 6): adicionar `modelBadge` e `shortModel` à lista de `../format`.

Props (linhas 10-11):

```ts
let { agent, defaultExpanded = true, history = false, tokens = null, hasRunningSubAgent = false, currentModel, usedModels = [], mainModel }:
  { agent: AgentTodos; defaultExpanded?: boolean; history?: boolean; tokens?: number | null; hasRunningSubAgent?: boolean; currentModel?: string; usedModels?: string[]; mainModel?: string } = $props();

let mBadge = $derived(modelBadge(currentModel, mainModel, agent.isMain));
```

No markup, logo APÓS o `type-badge` (linha 44) e antes do `tokens`:

```svelte
{#if mBadge}
  <span class="model-badge" title={todosStore.t('agent.modelTooltip', { models: usedModels.map(shortModel).join(', ') })}>{mBadge}</span>
{/if}
```

No `<style>`, junto dos estilos do `.type-badge` (mesma família visual, tom neutro/discreto):

```css
.model-badge {
  flex: none;
  font-size: 0.68em;
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
}
```

- [ ] **Step 4: i18n — chave do tooltip ×3**

Em `src/i18n/messages.ts`, junto de `agent.tokensTooltip` em cada idioma:

```ts
// en
'agent.modelTooltip': 'Models used: {models}',
// pt-br
'agent.modelTooltip': 'Modelos usados: {models}',
// es
'agent.modelTooltip': 'Modelos usados: {models}',
```

- [ ] **Step 5: Test + build**

Run: `npm test` → Expected: PASS (inclui testes de paridade i18n).
Run: `npm run build` → Expected: sem erros de compilação/Svelte.

- [ ] **Step 6: Visual check**

Invocar o skill `preview-webview` com um snapshot em que o main tem
`currentModel: 'claude-opus-4-8'` e um sub-agent tem `currentModel: 'claude-sonnet-4-5'`.
Conferir: badge `opus-4-8` no main; badge `sonnet-4-5` só no sub-agent divergente; nenhum
badge em sub-agent com o mesmo modelo do main; tooltip com a lista.

- [ ] **Step 7: Commit**

```bash
git add src/webview/App.svelte src/webview/lib/AgentTree.svelte src/webview/lib/AgentSection.svelte src/i18n/messages.ts
git commit -m "feat(panel): badge de modelo por agente — main sempre, sub-agent quando difere (item 20)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `detectAwaitingInput` + `listSessionDetail` no todosParser

**Files:**
- Modify: `src/types.ts` (tipo `AwaitingInput`; campo em `SessionSnapshot`)
- Modify: `src/services/todosParser.ts:73-95` (`listForSession` → delega) e `:129,176` (`listSubAgents` recebe linhas)
- Test: `tests/services/todosParser.test.ts` (append)

**Interfaces:**
- Consumes: nada novo.
- Produces: `export type AwaitingInput = 'question' | 'plan'` (types.ts); `SessionSnapshot.awaitingInput?: AwaitingInput`; `detectAwaitingInput(lines: string[], skipSidechain: boolean): AwaitingInput | null` (export de todosParser.ts); `TodosParser.listSessionDetail(sessionId, cwd): { agents: AgentTodos[]; awaitingInput: AwaitingInput | null }`; `listForSession` inalterado no contrato (delega).

- [ ] **Step 1: Write the failing tests**

Append em `tests/services/todosParser.test.ts` (describe novo, self-contained; ajustar imports do topo para incluir `detectAwaitingInput`):

```ts
describe('detectAwaitingInput', () => {
  const ask = (id: string) => JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: {} }] },
  });
  const plan = (id: string) => JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'ExitPlanMode', input: {} }] },
  });
  const answer = (id: string) => JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
  });
  const sidechainAsk = (id: string) => JSON.stringify({
    type: 'assistant', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: {} }] },
  });

  it('detects a pending question', () => {
    expect(detectAwaitingInput([ask('t1')], true)).toBe('question');
  });
  it('detects a pending plan approval', () => {
    expect(detectAwaitingInput([plan('t1')], true)).toBe('plan');
  });
  it('clears when the tool_result arrives (answer or harness timeout)', () => {
    expect(detectAwaitingInput([ask('t1'), answer('t1')], true)).toBeNull();
  });
  it('returns the most recent unresolved wait', () => {
    expect(detectAwaitingInput([ask('t1'), answer('t1'), plan('t2')], true)).toBe('plan');
    expect(detectAwaitingInput([plan('t1'), ask('t2'), answer('t1')], true)).toBe('question');
  });
  it('ignores sidechain questions when skipSidechain', () => {
    expect(detectAwaitingInput([sidechainAsk('t1')], true)).toBeNull();
  });
  it('null on a transcript without wait tools', () => {
    expect(detectAwaitingInput([JSON.stringify({ type: 'user', message: { role: 'user', content: 'oi' } })], true)).toBeNull();
  });
});

describe('listSessionDetail', () => {
  let claudeDir: string;
  const CWD = '/home/user/proj';
  const SID = 'sess-detail';
  beforeEach(() => { claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detail-')); });
  afterEach(() => { fs.rmSync(claudeDir, { recursive: true, force: true }); });

  function writeMain(lines: string[]): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${SID}.jsonl`), lines.join('\n'));
  }

  it('exposes awaitingInput from the main transcript alongside the agents', () => {
    writeMain([JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: {} }] },
    })]);
    const detail = new TodosParser(claudeDir).listSessionDetail(SID, CWD);
    expect(detail.awaitingInput).toBe('question');
    expect(Array.isArray(detail.agents)).toBe(true);
  });

  it('awaitingInput is null for a missing transcript', () => {
    expect(new TodosParser(claudeDir).listSessionDetail(SID, CWD).awaitingInput).toBeNull();
  });
});
```

Nota: se o arquivo de teste ainda não importa `encodeCwdToProjectDir`, adicionar
`import { encodeCwdToProjectDir } from '../../src/services/projectDir';` (padrão do
usageParser.test.ts).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/services/todosParser.test.ts`
Expected: FAIL — `detectAwaitingInput`/`listSessionDetail` não existem.

- [ ] **Step 3: Implement**

Em `src/types.ts`:

```ts
export type AwaitingInput = 'question' | 'plan';
```

e em `SessionSnapshot` (após `usage`):

```ts
export interface SessionSnapshot {
  sessionId: string;
  cwd: string;
  title: string;
  pinned: boolean;
  agents: AgentTodos[];
  usage?: SessionUsage;
  awaitingInput?: AwaitingInput;  // pergunta/plano do main sem resposta do usuário
}
```

Em `src/services/todosParser.ts`, import de tipos ganha `AwaitingInput`. Antes da
classe, a função exportada:

```ts
// tool_use que espera o usuário -> tipo da espera.
const WAIT_TOOLS: Record<string, AwaitingInput> = {
  AskUserQuestion: 'question',
  ExitPlanMode: 'plan',
};

// Última espera por input do usuário ainda sem resposta: um tool_use de
// AskUserQuestion/ExitPlanMode cujo tool_result não chegou (resposta, rejeição
// e o timeout do harness geram tool_result — a pendência limpa sozinha).
// Map preserva ordem de inserção → o último valor é o pendente mais recente.
export function detectAwaitingInput(lines: string[], skipSidechain: boolean): AwaitingInput | null {
  const pending = new Map<string, AwaitingInput>();
  for (const line of lines) {
    if (!line) continue;
    let entry: TranscriptEntry;
    try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
    if (skipSidechain && entry.isSidechain) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use' && typeof block.name === 'string'
          && block.name in WAIT_TOOLS && typeof block.id === 'string') {
        pending.set(block.id, WAIT_TOOLS[block.name]);
      } else if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        pending.delete(block.tool_use_id);
      }
    }
  }
  let last: AwaitingInput | null = null;
  for (const v of pending.values()) last = v;
  return last;
}
```

Na classe, `listForSession` vira delegação e o corpo migra para `listSessionDetail`,
lendo as linhas do main UMA vez (hoje `readLastTodos` e `collectDispatches` leem o
arquivo separadamente — a refatoração remove a segunda leitura):

```ts
listForSession(sessionId: string, cwd: string): AgentTodos[] {
  return this.listSessionDetail(sessionId, cwd).agents;
}

listSessionDetail(sessionId: string, cwd: string): { agents: AgentTodos[]; awaitingInput: AwaitingInput | null } {
  const transcriptPath = this.transcriptPath(sessionId, cwd);
  if (!transcriptPath) return { agents: [], awaitingInput: null };

  const mainLines = this.readLines(transcriptPath);
  const agents: AgentTodos[] = [];

  const main = this.readLastTodosFromLines(mainLines, true);
  if (main) {
    const stat = fs.statSync(transcriptPath);
    agents.push({
      sessionId,
      agentId: sessionId,
      name: 'Main agent',
      isMain: true,
      todos: main.todos,
      updatedAt: stat.mtimeMs,
      ...(main.updatedAt !== undefined ? { todosUpdatedAt: main.updatedAt } : {}),
    });
  }

  agents.push(...this.listSubAgents(sessionId, cwd, mainLines));
  return { agents, awaitingInput: detectAwaitingInput(mainLines, true) };
}
```

Em `listSubAgents`, trocar o 3º parâmetro `mainTranscriptPath: string` por
`mainLines: string[]` e, na montagem do índice (linha ~176), usar direto:
`for (const [id, d] of this.collectDispatches(mainLines, true)) {`.
O método privado `readLastTodos(transcriptPath, skipSidechain)` fica sem uso —
removê-lo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/todosParser.test.ts`
Expected: PASS (novos e todos os existentes — o contrato de `listForSession` não mudou).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/services/todosParser.ts tests/services/todosParser.test.ts
git commit -m "feat(parser): detectAwaitingInput + listSessionDetail — espera por input no transcript (item 22)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: kind `awaitingInput` no SessionNotifier

**Files:**
- Modify: `src/services/sessionNotifier.ts`
- Test: `tests/services/sessionNotifier.test.ts` (append)

**Interfaces:**
- Consumes: tipo `AwaitingInput` de `../types` (Task 4).
- Produces: `NotificationKind = 'idle' | 'allComplete' | 'awaitingInput'`; `NotifierInput.awaitingInput?: AwaitingInput | null` (opcional — call sites existentes seguem válidos); dispara `awaitingInput` na transição `null → valor` ou troca de kind; `idle` suprimido enquanto pendente.

- [ ] **Step 1: Write the failing tests**

Append dentro do `describe('SessionNotifier')` de `tests/services/sessionNotifier.test.ts`:

```ts
it('fires awaitingInput on the null -> question transition', () => {
  const n = new SessionNotifier();
  n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
  expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: false, awaitingInput: 'question', now: T0 + 1000 }))
    .toEqual(['awaitingInput']);
});

it('does not re-fire while the same wait stays pending', () => {
  const n = new SessionNotifier();
  n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
  n.observe({ sessionId: 's1', mtime: 2, allComplete: false, awaitingInput: 'question', now: T0 + 1000 });
  expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: false, awaitingInput: 'question', now: T0 + 2000 }))
    .toEqual([]);
});

it('re-fires when the wait kind changes (question -> plan)', () => {
  const n = new SessionNotifier();
  n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
  n.observe({ sessionId: 's1', mtime: 2, allComplete: false, awaitingInput: 'question', now: T0 + 1000 });
  expect(n.observe({ sessionId: 's1', mtime: 3, allComplete: false, awaitingInput: 'plan', now: T0 + 2000 }))
    .toEqual(['awaitingInput']);
});

it('re-fires after the wait resolves and a new one appears', () => {
  const n = new SessionNotifier();
  n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
  n.observe({ sessionId: 's1', mtime: 2, allComplete: false, awaitingInput: 'question', now: T0 + 1000 });
  n.observe({ sessionId: 's1', mtime: 3, allComplete: false, awaitingInput: null, now: T0 + 2000 });
  expect(n.observe({ sessionId: 's1', mtime: 4, allComplete: false, awaitingInput: 'question', now: T0 + 3000 }))
    .toEqual(['awaitingInput']);
});

it('never fires awaitingInput on the first observation of a session', () => {
  const n = new SessionNotifier();
  expect(n.observe({ sessionId: 's1', mtime: 1, allComplete: false, awaitingInput: 'question', now: T0 }))
    .toEqual([]);
});

it('suppresses idle while a wait is pending, and idle works again after it resolves', () => {
  const n = new SessionNotifier();
  n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
  const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
  // pendência surge junto da última atividade (o tool_use mudou o mtime)
  expect(n.observe({ sessionId: 's1', mtime: c1 + 1, allComplete: false, awaitingInput: 'question', now: c1 + 1 }))
    .toEqual(['awaitingInput']);
  // silêncio vencido, mas pendente aberto: idle NÃO dispara
  expect(n.observe({ sessionId: 's1', mtime: c1 + 1, allComplete: false, awaitingInput: 'question', now: c1 + 1 + IDLE_MS }))
    .toEqual([]);
  // resposta chega (mtime muda, pendência limpa); nova rajada + silêncio → idle volta a funcionar
  const t2 = c1 + 1 + IDLE_MS + 120_000;
  const c2 = burst(n, 's1', t2, ACTIVITY_MIN_MS);
  expect(n.observe({ sessionId: 's1', mtime: c2, allComplete: false, awaitingInput: null, now: c2 + IDLE_MS }))
    .toEqual(['idle']);
});

it('orders allComplete before awaitingInput in the same cycle', () => {
  const n = new SessionNotifier();
  n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
  expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: true, awaitingInput: 'question', now: T0 + 1000 }))
    .toEqual(['allComplete', 'awaitingInput']);
});
```

Nota: `burst` chama `observe` sem `awaitingInput` — o campo é opcional, chamadas
existentes não mudam.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/services/sessionNotifier.test.ts`
Expected: FAIL — kind `awaitingInput` nunca é emitido; teste de supressão vê `['idle']`.

- [ ] **Step 3: Implement**

Em `src/services/sessionNotifier.ts`:

```ts
import type { AwaitingInput } from '../types';

export type NotificationKind = 'idle' | 'allComplete' | 'awaitingInput';

export interface NotifierInput {
  sessionId: string;    // sessão exibida no painel
  mtime: number;        // transcriptMtime da sessão (0 se indisponível)
  allComplete: boolean; // main agent: todos.length > 0 && todas completed
  awaitingInput?: AwaitingInput | null;  // pergunta/plano pendente no transcript
  now: number;          // epoch ms, injetado
}
```

Estado novo na classe: `private prevAwaiting: AwaitingInput | null = null;`

No ramo de troca/estreia de sessão (início do `observe`), inicializar junto dos
demais: `this.prevAwaiting = input.awaitingInput ?? null;`

Depois do bloco do `allComplete` (linhas 47-49) e ANTES do bloco de mtime:

```ts
// awaitingInput: transição para pendente (ou troca de kind) = aviso novo;
// mesma pendência repetida não re-dispara.
const awaiting = input.awaitingInput ?? null;
if (awaiting !== null && awaiting !== this.prevAwaiting) out.push('awaitingInput');
this.prevAwaiting = awaiting;
```

E no ramo do idle (o `else if`), acrescentar a supressão — a condição vira:

```ts
} else if (
  awaiting === null
  && !this.idleNotified
  && this.lastChangeAt - this.activeSince >= ACTIVITY_MIN_MS
  && input.now - this.lastChangeAt >= IDLE_MS
) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/sessionNotifier.test.ts`
Expected: PASS (novos e antigos).

- [ ] **Step 5: Commit**

```bash
git add src/services/sessionNotifier.ts tests/services/sessionNotifier.test.ts
git commit -m "feat(notifier): kind awaitingInput — transição imediata, idle suprimido com pendência (item 22)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: snapshot propaga + host exibe (extension.ts) + i18n

**Files:**
- Modify: `src/services/snapshotService.ts:35-61` (`build`)
- Modify: `src/extension.ts:94-134` (`maybeToast` e `observeSession`)
- Modify: `src/i18n/messages.ts` (2 chaves ×3 idiomas)
- Test: `tests/services/snapshotService.test.ts`

**Interfaces:**
- Consumes: `listSessionDetail` (Task 4), kind `awaitingInput` (Task 5).
- Produces: `SessionSnapshot.awaitingInput` preenchido; toast com `notify.awaitingQuestion` / `notify.awaitingPlan`.

- [ ] **Step 1: Write the failing test**

Em `tests/services/snapshotService.test.ts`, o stub `makeParser` precisa do método
novo. Atualizar a fábrica (o `build()` passará a chamar `listSessionDetail`):

```ts
function makeParser(opts: {
  mtimes: Record<string, number | null>;
  titles?: Record<string, string | null>;
  awaitingInput?: 'question' | 'plan' | null;
}) {
  const agentsFor = (sessionId: string) => [
    { sessionId, agentId: sessionId, name: 'Main agent', isMain: true, todos: [], updatedAt: 0 },
  ];
  return {
    transcriptMtime: (sessionId: string, _cwd: string) => opts.mtimes[sessionId] ?? null,
    readSessionTitle: (sessionId: string, _cwd: string) => opts.titles?.[sessionId] ?? null,
    listForSession: (sessionId: string) => agentsFor(sessionId),
    listSessionDetail: (sessionId: string) => ({
      agents: agentsFor(sessionId),
      awaitingInput: opts.awaitingInput ?? null,
    }),
  };
}
```

E o teste novo, no fim do describe:

```ts
it('exposes awaitingInput on the snapshot when the parser reports a pending wait', () => {
  const resolver = {
    resolveCandidates: () => [
      { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
    ],
  };
  const parser = makeParser({ mtimes: { a: 1000 }, awaitingInput: 'question' });
  const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
  expect(svc.build()!.awaitingInput).toBe('question');
});

it('omits awaitingInput when there is no pending wait', () => {
  const resolver = {
    resolveCandidates: () => [
      { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
    ],
  };
  const parser = makeParser({ mtimes: { a: 1000 } });
  const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
  expect('awaitingInput' in svc.build()!).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- tests/services/snapshotService.test.ts`
Expected: os 2 novos FALHAM (`awaitingInput` undefined/presente errado); antigos passam.

- [ ] **Step 3: Implement — snapshotService**

Em `build()` (linha 40), trocar a chamada e propagar:

```ts
const detail = this.parser.listSessionDetail(chosen.sessionId, chosen.cwd);
const agents = detail.agents;
```

e no objeto de retorno (linha 53-60), adicionar:

```ts
return {
  sessionId: chosen.sessionId,
  cwd: chosen.cwd,
  title: chosen.title,
  pinned: chosen.sessionId === this.pinnedSessionId,
  agents,
  usage: this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents),
  ...(detail.awaitingInput !== null ? { awaitingInput: detail.awaitingInput } : {}),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/snapshotService.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement — host (extension.ts) + i18n**

Em `src/i18n/messages.ts`, junto das chaves `notify.*` em cada idioma:

```ts
// en
'notify.awaitingQuestion': '"{title}" — waiting for your answer',
'notify.awaitingPlan': '"{title}" — plan awaiting approval',
// pt-br
'notify.awaitingQuestion': '"{title}" — aguardando sua resposta',
'notify.awaitingPlan': '"{title}" — plano aguardando aprovação',
// es
'notify.awaitingQuestion': '"{title}" — esperando tu respuesta',
'notify.awaitingPlan': '"{title}" — plan esperando aprobación',
```

Em `src/extension.ts`, `maybeToast` (linha 94) ganha o kind da espera e a prioridade
`allComplete` > `awaitingInput` > `idle`:

```ts
const maybeToast = (kinds: NotificationKind[], title: string, awaiting: 'question' | 'plan' | null = null): void => {
  if (kinds.length === 0) return;
  const enabled = vscode.workspace.getConfiguration('claudeTodos').get<boolean>('notifications', true);
  if (!enabled || vscode.window.state.focused) return;
  const t = createT(resolveLocale());
  // Vários no mesmo observe: exibe um só, do mais conclusivo ao mais genérico.
  const message = kinds.includes('allComplete')
    ? t('notify.allComplete', { title })
    : kinds.includes('awaitingInput')
      ? t(awaiting === 'plan' ? 'notify.awaitingPlan' : 'notify.awaitingQuestion', { title })
      : t('notify.idle', { title });
  // ... (o restante do corpo — showInformationMessage e os botões — fica como está)
```

Em `observeSession` (linhas 126-132), alimentar e repassar:

```ts
const fired = notifier.observe({
  sessionId: snapshot.sessionId,
  mtime,
  allComplete,
  awaitingInput: snapshot.awaitingInput ?? null,
  now,
});
maybeToast(fired, snapshot.title, snapshot.awaitingInput ?? null);
```

- [ ] **Step 6: Full test + build**

Run: `npm test` → Expected: PASS (inclui paridade i18n ×3).
Run: `npm run build` → Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/services/snapshotService.ts src/extension.ts src/i18n/messages.ts tests/services/snapshotService.test.ts
git commit -m "feat(notify): toast aguardando resposta/plano — snapshot ao host, i18n x3 (item 22)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: verificação final + roadmap

**Files:**
- Modify: `docs/ROADMAP.md` (status dos itens 20 e 22)

- [ ] **Step 1: Suite completa e build**

Run: `npm test` → Expected: PASS, zero falhas.
Run: `npm run build` → Expected: sem erros.

- [ ] **Step 2: Verificação de comportamento real**

Invocar o skill `verify` (ou, no mínimo, o `preview-webview` para o badge — item 20)
e conferir o item 22 com um transcript real: abrir uma sessão do próprio repo em
`~/.claude/projects`, localizar um `AskUserQuestion` respondido e confirmar que
`detectAwaitingInput` sobre as linhas reais retorna `null` (e `'question'` ao truncar
o arquivo antes do `tool_result`).

- [ ] **Step 3: Atualizar o roadmap**

Em `docs/ROADMAP.md`, itens 20 e 22: `🔍 a investigar` → `✅ implementado — aguardando
release`, com uma linha citando spec + plano (padrão dos itens 18/19).

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): itens 20 e 22 implementados — aguardando release

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
