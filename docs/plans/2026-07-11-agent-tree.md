# Árvore de Agentes ao Vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir a sessão como árvore expansível (main → sub-agents → aninhados) com badge de tipo e tokens por nó, trocando o matching heurístico por prompt pelo vínculo exato via `toolUseId` do `agent-*.meta.json`.

**Architecture:** O parser anota parentesco em campos opcionais do `AgentTodos` (lista plana preservada no snapshot); a webview monta a floresta com uma função pura (`buildTree`) e renderiza recursivamente com linhas-guia (layout A). Fallback por prompt exato quando não há meta.json. Spec: [docs/specs/2026-07-11-agent-tree-design.md](../specs/2026-07-11-agent-tree-design.md).

**Tech Stack:** TypeScript, Svelte 5 (runes), vitest, esbuild/vite. Sem dependências novas.

## Global Constraints

- Sem dependências novas em `package.json`.
- Campos opcionais anexados **só quando definidos** (padrão do repo — não inflar snapshot).
- Strings de UI novas nos **três idiomas** (`en`, `pt-br`, `es`) no catálogo `src/i18n/messages.ts`; `en` é a fonte do tipo.
- CSS via variáveis `--vscode-*` (theme-aware); nada hardcoded.
- Commits em português, conventional style (`feat(parser): …`).
- Rodar testes com `npx vitest run <arquivo>` (suíte completa: `npm test`). No Windows a suíte pode terminar com ruído `EPERM ... kill` do teardown do pool — é conhecido e não é falha; o que vale é `Tests N passed`.
- Comentários de código em português (padrão dominante do repo).

---

### Task 1: Leitor do `agent-*.meta.json`

**Files:**
- Create: `src/services/subAgentMeta.ts`
- Test: `tests/services/subAgentMeta.test.ts`

**Interfaces:**
- Consumes: nada (módulo folha; só `fs`).
- Produces: `interface SubAgentMeta { toolUseId: string; agentType?: string; description?: string; spawnDepth?: number }` e `function readSubAgentMeta(jsonlPath: string): SubAgentMeta | null`. A Task 2 importa ambos de `./subAgentMeta`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/services/subAgentMeta.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readSubAgentMeta } from '../../src/services/subAgentMeta';

describe('readSubAgentMeta', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, content: string): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  }

  it('reads a complete meta.json next to the transcript', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', JSON.stringify({
      agentType: 'general-purpose',
      description: 'Implementar Task 1',
      toolUseId: 'toolu_01XYZ',
      spawnDepth: 1,
    }));
    expect(readSubAgentMeta(jsonl)).toEqual({
      agentType: 'general-purpose',
      description: 'Implementar Task 1',
      toolUseId: 'toolu_01XYZ',
      spawnDepth: 1,
    });
  });

  it('returns null when the meta file does not exist', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    expect(readSubAgentMeta(jsonl)).toBeNull();
  });

  it('returns null when the meta file is not valid JSON', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', '{not json');
    expect(readSubAgentMeta(jsonl)).toBeNull();
  });

  it('returns null when toolUseId is missing or not a string', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', JSON.stringify({ agentType: 'Explore', spawnDepth: 2 }));
    expect(readSubAgentMeta(jsonl)).toBeNull();
  });

  it('omits optional fields with wrong types instead of failing', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', JSON.stringify({
      toolUseId: 'toolu_01A',
      agentType: 42,
      spawnDepth: 'two',
    }));
    expect(readSubAgentMeta(jsonl)).toEqual({ toolUseId: 'toolu_01A' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/subAgentMeta.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/subAgentMeta'`

- [ ] **Step 3: Implementar o módulo**

```ts
// src/services/subAgentMeta.ts
import * as fs from 'fs';

export interface SubAgentMeta {
  toolUseId: string;
  agentType?: string;
  description?: string;
  spawnDepth?: number;
}

// Lê o agent-<id>.meta.json gravado pelo Claude Code ao lado do transcript do
// sub-agent. Retorna null quando o arquivo não existe, não parseia ou não tem
// toolUseId — o chamador cai no matching heurístico por prompt nesses casos.
export function readSubAgentMeta(jsonlPath: string): SubAgentMeta | null {
  const metaPath = jsonlPath.replace(/\.jsonl$/, '.meta.json');
  let raw: string;
  try {
    raw = fs.readFileSync(metaPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const m = parsed as Record<string, unknown>;
  if (typeof m.toolUseId !== 'string' || m.toolUseId.length === 0) return null;
  const out: SubAgentMeta = { toolUseId: m.toolUseId };
  if (typeof m.agentType === 'string') out.agentType = m.agentType;
  if (typeof m.description === 'string') out.description = m.description;
  if (typeof m.spawnDepth === 'number') out.spawnDepth = m.spawnDepth;
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/services/subAgentMeta.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/subAgentMeta.ts tests/services/subAgentMeta.test.ts
git commit -m "feat(parser): leitor de agent-*.meta.json (toolUseId/agentType/spawnDepth)"
```

---

### Task 2: Matching por `toolUseId` com fallback por prompt

**Files:**
- Modify: `src/types.ts` (interface `AgentTodos`)
- Modify: `src/services/todosParser.ts` (reestruturação de `listSubAgents` + helpers)
- Test: `tests/services/todosParser.test.ts` (novos testes; os existentes DEVEM continuar verdes)

**Interfaces:**
- Consumes: `readSubAgentMeta(jsonlPath)` / `SubAgentMeta` da Task 1.
- Produces: `AgentTodos` com os campos opcionais `agentType?: string`, `parentAgentId?: string`, `depth?: number`. Sub-agents casados via meta ganham `parentAgentId = sessionId` (nesta task o pai é sempre o main; a Task 3 estende). Assinatura pública do parser inalterada: `listForSession(sessionId, cwd): AgentTodos[]`.

- [ ] **Step 1: Adicionar os campos em `src/types.ts`**

Na interface `AgentTodos` (após `status?: 'running' | 'completed';`):

```ts
  agentType?: string;      // do meta.json (ex.: "general-purpose", "Explore")
  parentAgentId?: string;  // agentId do agente que disparou este; ausente = filho do main
  depth?: number;          // spawnDepth do meta.json (1 = disparado pelo main)
```

- [ ] **Step 2: Escrever os testes que falham**

Adicionar em `tests/services/todosParser.test.ts`, antes do `it('does not emit duplicate…')` final, um novo `describe`. Adicionar também este helper junto aos demais (após `writeSubAgent`):

```ts
  function writeSubAgentMeta(sessionId: string, cwd: string, agentId: string, meta: object): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(cwd), sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  }
```

```ts
  describe('meta.json matching (toolUseId)', () => {
    it('matches by toolUseId even when the file prompt differs from the invocation prompt', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_A', 'Investigar parser', 'PROMPT DA INVOCAÇÃO'),
        agentResult('toolu_A', 'aaa111'),
      ]);
      // O prompt gravado no arquivo é DIFERENTE do da invocação — o matching
      // por prompt falharia; o toolUseId do meta.json resolve.
      writeSubAgent('s1', CWD, 'aaa111', 'prompt reescrito pelo harness', [
        { content: 'sub', activeForm: 'Sub', status: 'pending' },
      ]);
      writeSubAgentMeta('s1', CWD, 'aaa111', {
        agentType: 'general-purpose', description: 'Investigar parser',
        toolUseId: 'toolu_A', spawnDepth: 1,
      });
      const agents = parser.listForSession('s1', CWD);
      expect(agents).toHaveLength(2);
      expect(agents[1].agentId).toBe('aaa111');
      expect(agents[1].name).toBe('Investigar parser');
      expect(agents[1].status).toBe('completed');
    });

    it('propagates agentType, depth and parentAgentId from the meta', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_B', 'Explorar código', 'p1'),
      ]);
      writeSubAgent('s1', CWD, 'bbb222', 'p1', null);
      writeSubAgentMeta('s1', CWD, 'bbb222', {
        agentType: 'Explore', description: 'Explorar código',
        toolUseId: 'toolu_B', spawnDepth: 1,
      });
      const sub = parser.listForSession('s1', CWD)[1];
      expect(sub.agentType).toBe('Explore');
      expect(sub.depth).toBe(1);
      expect(sub.parentAgentId).toBe('s1');
      expect(sub.status).toBe('running');
    });

    it('falls back to prompt matching when the meta.json is corrupted', () => {
      const prompt = 'Auditar build';
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUse('toolu_C', 'audit-build', prompt),
        agentResult('toolu_C', 'ccc333'),
      ]);
      writeSubAgent('s1', CWD, 'ccc333', prompt, null);
      const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), 's1', 'subagents');
      fs.writeFileSync(path.join(dir, 'agent-ccc333.meta.json'), '{broken');
      const agents = parser.listForSession('s1', CWD);
      expect(agents).toHaveLength(2);
      expect(agents[1].name).toBe('audit-build');
      expect(agents[1].agentType).toBeUndefined();
    });

    it('excludes a meta-matched agent whose invocation was rejected', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_D', 'Rejeitado', 'p'),
        agentRejection('toolu_D'),
      ]);
      writeSubAgent('s1', CWD, 'ddd444', 'p', null);
      writeSubAgentMeta('s1', CWD, 'ddd444', { toolUseId: 'toolu_D', spawnDepth: 1 });
      expect(parser.listForSession('s1', CWD)).toHaveLength(1);
    });

    it('does not attach tree fields to legacy (prompt-matched) agents', () => {
      const prompt = 'Sessão antiga';
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUse('toolu_E', 'legacy', prompt),
        agentResult('toolu_E', 'eee555'),
      ]);
      writeSubAgent('s1', CWD, 'eee555', prompt, null);
      const sub = parser.listForSession('s1', CWD)[1];
      expect(sub.agentType).toBeUndefined();
      expect(sub.parentAgentId).toBeUndefined();
      expect(sub.depth).toBeUndefined();
    });
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: FAIL nos 5 testes novos (campos `undefined`, matching por prompt não encontra o arquivo do primeiro teste). Os testes antigos continuam PASS.

- [ ] **Step 4: Reestruturar `listSubAgents` no `todosParser.ts`**

Adicionar o import no topo:

```ts
import { readSubAgentMeta, type SubAgentMeta } from './subAgentMeta';
```

Adicionar o tipo `Dispatch` junto às interfaces privadas do arquivo (abaixo de `AgentInvocation`, que será REMOVIDA):

```ts
interface Dispatch {
  label?: string;   // input.name ?? input.description da invocação
  prompt?: string;
  result: 'none' | 'completed' | 'rejected';
}
```

Substituir os métodos `listSubAgents`, `readAgentInvocations` e `readSubAgentPrompt` por:

```ts
  private listSubAgents(sessionId: string, cwd: string, mainTranscriptPath: string): AgentTodos[] {
    const dir = this.subAgentsDir(sessionId, cwd);
    if (!dir) return [];

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
    } catch {
      return [];
    }
    if (files.length === 0) return [];

    // Dispatches do transcript principal: toolUseId -> invocação. O ordinal
    // registra a ordem de invocação para desempate estável na ordenação.
    const dispatches = this.collectDispatches(this.readLines(mainTranscriptPath));
    const ordinals = new Map<string, number>();
    let ord = 0;
    for (const id of dispatches.keys()) ordinals.set(id, ord++);

    const pending: { agent: AgentTodos; ordinal: number }[] = [];
    const seen = new Set<string>();
    const usedPromptIds = new Set<string>();

    for (const file of files) {
      const filePath = path.join(dir, file);
      const agentId = file.slice('agent-'.length, -'.jsonl'.length);
      if (seen.has(agentId)) continue;
      const lines = this.readLines(filePath);
      let updatedAt = 0;
      try { updatedAt = fs.statSync(filePath).mtimeMs; } catch { /* ignore */ }
      const todos = this.readLastTodosFromLines(lines, false) ?? [];
      const meta = readSubAgentMeta(filePath);

      if (meta) {
        // Caminho novo: vínculo exato invocação↔arquivo via toolUseId.
        const d = dispatches.get(meta.toolUseId);
        if (d?.result === 'rejected') continue;
        const agent: AgentTodos = {
          sessionId,
          agentId,
          name: d?.label ?? meta.description ?? agentId,
          isMain: false,
          todos,
          updatedAt,
        };
        if (d) {
          agent.status = d.result === 'completed' ? 'completed' : 'running';
          agent.parentAgentId = sessionId;
        }
        if (meta.agentType !== undefined) agent.agentType = meta.agentType;
        if (meta.spawnDepth !== undefined) agent.depth = meta.spawnDepth;
        seen.add(agentId);
        pending.push({
          agent,
          ordinal: d ? ordinals.get(meta.toolUseId)! : Number.MAX_SAFE_INTEGER,
        });
        continue;
      }

      // Caminho legado (sem meta.json): casa por prompt exato com uma
      // invocação do main ainda não consumida. Sem match → arquivo excluído.
      const prompt = this.firstUserPrompt(lines);
      if (prompt === null) continue;
      let matchedId: string | null = null;
      for (const [id, d] of dispatches) {
        if (usedPromptIds.has(id)) continue;
        if (d.label !== undefined && d.prompt === prompt) { matchedId = id; break; }
      }
      if (matchedId === null) continue;
      usedPromptIds.add(matchedId);
      const d = dispatches.get(matchedId)!;
      if (d.result === 'rejected') continue;
      seen.add(agentId);
      pending.push({
        agent: {
          sessionId,
          agentId,
          name: d.label!,
          isMain: false,
          status: d.result === 'completed' ? 'completed' : 'running',
          todos,
          updatedAt,
        },
        ordinal: ordinals.get(matchedId)!,
      });
    }

    pending.sort((a, b) => {
      const ga = this.subAgentGroup(a.agent);
      const gb = this.subAgentGroup(b.agent);
      if (ga !== gb) return ga - gb;
      if (a.agent.updatedAt !== b.agent.updatedAt) return b.agent.updatedAt - a.agent.updatedAt;
      return a.ordinal - b.ordinal;
    });
    return pending.map(p => p.agent);
  }

  // Varre um transcript e devolve os disparos do tool Agent: toolUseId ->
  // {label, prompt, result}. `result` reflete o tool_result correspondente:
  // 'none' = ainda rodando; 'completed' = terminou (toolUseResult.agentId
  // presente); 'rejected' = recusado pelo usuário ou morto por erro.
  private collectDispatches(lines: string[]): Map<string, Dispatch> {
    const out = new Map<string, Dispatch>();
    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === 'tool_use' && block.name === 'Agent' && typeof block.id === 'string') {
          const name = block.input?.name;
          const description = block.input?.description;
          const label = typeof name === 'string' ? name
            : typeof description === 'string' ? description
            : undefined;
          const prompt = block.input?.prompt;
          out.set(block.id, {
            label,
            prompt: typeof prompt === 'string' ? prompt : undefined,
            result: 'none',
          });
        }
        if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          const d = out.get(block.tool_use_id);
          if (d) d.result = typeof entry.toolUseResult?.agentId === 'string' ? 'completed' : 'rejected';
        }
      }
    }
    return out;
  }

  private readLines(filePath: string): string[] {
    try {
      return fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return [];
    }
  }

  // Primeiro user message com content string — é o prompt do sub-agent.
  private firstUserPrompt(lines: string[]): string | null {
    for (const line of lines) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.type === 'user') {
          const content = entry.message?.content;
          if (typeof content === 'string') return content;
        }
      } catch { /* skip malformed line */ }
    }
    return null;
  }
```

Ajustar `readLastTodos` para delegar em uma variante que recebe linhas (os métodos internos `detectSchema`, `readLastTodoWriteSnapshot`, `extractTodoWriteTimings` e `readTaskStream` já recebem `lines` e não mudam):

```ts
  private readLastTodos(transcriptPath: string, skipSidechain: boolean): Todo[] | null {
    return this.readLastTodosFromLines(this.readLines(transcriptPath), skipSidechain);
  }

  private readLastTodosFromLines(lines: string[], skipSidechain: boolean): Todo[] | null {
    if (lines.length === 0) return null;
    const schema = this.detectSchema(lines, skipSidechain);
    if (schema === 'TodoWrite') {
      const todos = this.readLastTodoWriteSnapshot(lines, skipSidechain);
      if (!todos) return null;
      const timings = this.extractTodoWriteTimings(lines, skipSidechain);
      return todos.map(t => {
        const timing = timings.get(t.content);
        return timing
          ? makeTodo(t.content, t.activeForm, t.status, timing.startedAt, timing.completedAt)
          : t;
      });
    }
    if (schema === 'Task') return this.readTaskStream(lines, skipSidechain);
    return null;
  }
```

Atenção: `readLastTodos(transcriptPath, true)` continua sendo chamado em `listForSession` para o main — comportamento preservado (arquivo inexistente → `readLines` devolve `[]` → `null`). Remover a interface `AgentInvocation`, agora sem uso.

- [ ] **Step 5: Rodar e ver passar (novos + antigos)**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo os 5 novos. Nenhum teste antigo pode quebrar.

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Expected: PASS (157 + novos). `snapshotService.test.ts` e `usageParser.test.ts` intactos.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/services/todosParser.ts tests/services/todosParser.test.ts
git commit -m "feat(parser): matching de sub-agents por toolUseId com fallback por prompt"
```

---

### Task 3: Índice de parentesco e agentes aninhados (`spawnDepth ≥ 2`)

**Files:**
- Modify: `src/services/todosParser.ts` (só `listSubAgents`)
- Test: `tests/services/todosParser.test.ts`

**Interfaces:**
- Consumes: `collectDispatches`, `readLines`, `firstUserPrompt`, `readLastTodosFromLines` (Task 2).
- Produces: sub-agents com `parentAgentId` apontando para o agente cujo transcript contém seu `toolUseId` (main **ou** outro sub-agent). Meta órfão (toolUseId não encontrado em nenhum transcript) → agente **incluído**, sem `parentAgentId` e sem `status` (a webview pendura no main).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar dentro do `describe('meta.json matching (toolUseId)')`. Antes, adicionar este helper junto aos demais:

```ts
  // Sub-agent cujo transcript também DISPARA outro agente (para testes de aninhamento).
  function writeSubAgentWithDispatch(
    sessionId: string, cwd: string, agentId: string, prompt: string,
    dispatch: { toolUseId: string; description: string; childPrompt: string; completedAgentId?: string },
  ): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(cwd), sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    const lines: object[] = [
      { type: 'user', isSidechain: true, agentId, message: { role: 'user', content: prompt } },
      {
        type: 'assistant', isSidechain: true, agentId,
        message: { content: [{ type: 'tool_use', name: 'Agent', id: dispatch.toolUseId, input: { description: dispatch.description, prompt: dispatch.childPrompt } }] },
      },
    ];
    if (dispatch.completedAgentId) {
      lines.push({
        type: 'user', isSidechain: true, agentId,
        toolUseResult: { agentId: dispatch.completedAgentId, status: 'completed' },
        message: { content: [{ type: 'tool_result', tool_use_id: dispatch.toolUseId, content: 'done' }] },
      });
    }
    fs.writeFileSync(path.join(dir, `agent-${agentId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n'));
  }
```

```ts
    it('parents a depth-2 agent to the sub-agent that dispatched it', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_P', 'Pai', 'p-pai'),
      ]);
      writeSubAgentWithDispatch('s1', CWD, 'pai111', 'p-pai',
        { toolUseId: 'toolu_F', description: 'Filho aninhado', childPrompt: 'p-filho' });
      writeSubAgentMeta('s1', CWD, 'pai111', { agentType: 'general-purpose', toolUseId: 'toolu_P', spawnDepth: 1 });
      writeSubAgent('s1', CWD, 'filho22', 'p-filho', null);
      writeSubAgentMeta('s1', CWD, 'filho22', { agentType: 'Explore', description: 'Filho aninhado', toolUseId: 'toolu_F', spawnDepth: 2 });

      const agents = parser.listForSession('s1', CWD);
      const filho = agents.find(a => a.agentId === 'filho22')!;
      expect(filho).toBeDefined();
      expect(filho.parentAgentId).toBe('pai111');
      expect(filho.name).toBe('Filho aninhado');
      expect(filho.depth).toBe(2);
      expect(filho.status).toBe('running');  // sem tool_result no transcript do pai
    });

    it('marks a depth-2 agent completed from the tool_result in the parent transcript', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_P', 'Pai', 'p-pai'),
      ]);
      writeSubAgentWithDispatch('s1', CWD, 'pai111', 'p-pai',
        { toolUseId: 'toolu_F', description: 'Filho', childPrompt: 'p-filho', completedAgentId: 'filho22' });
      writeSubAgentMeta('s1', CWD, 'pai111', { toolUseId: 'toolu_P', spawnDepth: 1 });
      writeSubAgent('s1', CWD, 'filho22', 'p-filho', null);
      writeSubAgentMeta('s1', CWD, 'filho22', { toolUseId: 'toolu_F', spawnDepth: 2 });

      const filho = parser.listForSession('s1', CWD).find(a => a.agentId === 'filho22')!;
      expect(filho.status).toBe('completed');
    });

    it('includes an orphan meta agent (toolUseId not found anywhere) without parent or status', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
      ]);
      writeSubAgent('s1', CWD, 'orfao1', 'p-x', [
        { content: 'trabalho', activeForm: 'Trabalhando', status: 'completed' },
      ]);
      writeSubAgentMeta('s1', CWD, 'orfao1', { agentType: 'general-purpose', description: 'Sessão compactada', toolUseId: 'toolu_GONE', spawnDepth: 1 });

      const agents = parser.listForSession('s1', CWD);
      const orfao = agents.find(a => a.agentId === 'orfao1')!;
      expect(orfao).toBeDefined();
      expect(orfao.name).toBe('Sessão compactada');
      expect(orfao.parentAgentId).toBeUndefined();
      expect(orfao.status).toBeUndefined();
      expect(orfao.todos).toHaveLength(1);
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: FAIL — no primeiro teste `filho.parentAgentId` é `'s1'`... na verdade `undefined` (dispatch `toolu_F` não está no main); no órfão o teste passa parcialmente. Ao menos os dois testes de depth-2 DEVEM falhar.

- [ ] **Step 3: Estender `listSubAgents` com o índice global**

Substituir o corpo de `listSubAgents` (da Task 2) por esta versão — a diferença é a **pass 1** que lê todos os arquivos antes de casar, e o índice `toolUseId → dono`:

```ts
  private listSubAgents(sessionId: string, cwd: string, mainTranscriptPath: string): AgentTodos[] {
    const dir = this.subAgentsDir(sessionId, cwd);
    if (!dir) return [];

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
    } catch {
      return [];
    }
    if (files.length === 0) return [];

    // Pass 1 — lê cada arquivo uma única vez: prompt, todos, meta e os
    // dispatches de Agent feitos DENTRO daquele transcript (para aninhados).
    interface FileInfo {
      agentId: string;
      prompt: string | null;
      todos: Todo[];
      updatedAt: number;
      meta: SubAgentMeta | null;
      dispatches: Map<string, Dispatch>;
    }
    const infos: FileInfo[] = [];
    for (const file of files) {
      const filePath = path.join(dir, file);
      const lines = this.readLines(filePath);
      let updatedAt = 0;
      try { updatedAt = fs.statSync(filePath).mtimeMs; } catch { /* ignore */ }
      infos.push({
        agentId: file.slice('agent-'.length, -'.jsonl'.length),
        prompt: this.firstUserPrompt(lines),
        todos: this.readLastTodosFromLines(lines, false) ?? [],
        updatedAt,
        meta: readSubAgentMeta(filePath),
        dispatches: this.collectDispatches(lines),
      });
    }

    // Índice global: toolUseId -> dono do transcript onde a invocação vive.
    // Main primeiro (dono = sessionId); first-wins em colisão (defensivo —
    // ids de tool_use são únicos por construção). O ordinal preserva a ordem
    // de invocação para desempate estável na ordenação final.
    const index = new Map<string, { ownerAgentId: string; dispatch: Dispatch; ordinal: number }>();
    let ord = 0;
    for (const [id, d] of this.collectDispatches(this.readLines(mainTranscriptPath))) {
      if (!index.has(id)) index.set(id, { ownerAgentId: sessionId, dispatch: d, ordinal: ord++ });
    }
    for (const info of infos) {
      for (const [id, d] of info.dispatches) {
        if (!index.has(id)) index.set(id, { ownerAgentId: info.agentId, dispatch: d, ordinal: ord++ });
      }
    }

    // Pass 2 — casa cada arquivo: meta.toolUseId (exato) ou prompt (legado).
    const pending: { agent: AgentTodos; ordinal: number }[] = [];
    const seen = new Set<string>();
    const usedPromptIds = new Set<string>();

    for (const info of infos) {
      if (seen.has(info.agentId)) continue;

      if (info.meta) {
        const entry = index.get(info.meta.toolUseId);
        if (entry?.dispatch.result === 'rejected') continue;
        const agent: AgentTodos = {
          sessionId,
          agentId: info.agentId,
          name: entry?.dispatch.label ?? info.meta.description ?? info.agentId,
          isMain: false,
          todos: info.todos,
          updatedAt: info.updatedAt,
        };
        if (entry) {
          agent.status = entry.dispatch.result === 'completed' ? 'completed' : 'running';
          agent.parentAgentId = entry.ownerAgentId;
        }
        if (info.meta.agentType !== undefined) agent.agentType = info.meta.agentType;
        if (info.meta.spawnDepth !== undefined) agent.depth = info.meta.spawnDepth;
        seen.add(info.agentId);
        pending.push({ agent, ordinal: entry ? entry.ordinal : Number.MAX_SAFE_INTEGER });
        continue;
      }

      // Legado: casa por prompt exato com uma invocação do MAIN não consumida.
      if (info.prompt === null) continue;
      let matched: { id: string; entry: { ownerAgentId: string; dispatch: Dispatch; ordinal: number } } | null = null;
      for (const [id, entry] of index) {
        if (entry.ownerAgentId !== sessionId || usedPromptIds.has(id)) continue;
        if (entry.dispatch.label !== undefined && entry.dispatch.prompt === info.prompt) {
          matched = { id, entry };
          break;
        }
      }
      if (matched === null) continue;
      usedPromptIds.add(matched.id);
      if (matched.entry.dispatch.result === 'rejected') continue;
      seen.add(info.agentId);
      pending.push({
        agent: {
          sessionId,
          agentId: info.agentId,
          name: matched.entry.dispatch.label!,
          isMain: false,
          status: matched.entry.dispatch.result === 'completed' ? 'completed' : 'running',
          todos: info.todos,
          updatedAt: info.updatedAt,
        },
        ordinal: matched.entry.ordinal,
      });
    }

    pending.sort((a, b) => {
      const ga = this.subAgentGroup(a.agent);
      const gb = this.subAgentGroup(b.agent);
      if (ga !== gb) return ga - gb;
      if (a.agent.updatedAt !== b.agent.updatedAt) return b.agent.updatedAt - a.agent.updatedAt;
      return a.ordinal - b.ordinal;
    });
    return pending.map(p => p.agent);
  }
```

Nota: `parentAgentId` de depth-1 vale `sessionId` (o agentId do main) — a webview trata os dois jeitos ("sem pai" e "pai = main") de forma idêntica.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: PASS — arquivo inteiro, incluindo os 3 novos e TODOS os anteriores.

- [ ] **Step 5: Suíte completa + commit**

Run: `npm test` → Expected: PASS.

```bash
git add src/services/todosParser.ts tests/services/todosParser.test.ts
git commit -m "feat(parser): índice de parentesco e agentes aninhados (spawnDepth >= 2)"
```

---

### Task 4: `buildTree` — floresta de agentes (webview, puro)

**Files:**
- Create: `src/webview/tree.ts`
- Test: `tests/webview/tree.test.ts`

**Interfaces:**
- Consumes: `AgentTodos` de `src/types.ts` (campos da Task 2).
- Produces: `interface AgentNode { agent: AgentTodos; children: AgentNode[] }`, `buildTree(agents: AgentTodos[]): AgentNode[]` e `isHistory(agent: AgentTodos): boolean` (movida de `App.svelte`). A Task 6 importa os três de `../tree` (a partir de `lib/`) / `./tree` (a partir de `App.svelte`).

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/webview/tree.test.ts
import { describe, it, expect } from 'vitest';
import { buildTree, isHistory } from '../../src/webview/tree';
import type { AgentTodos } from '../../src/types';

function agent(over: Partial<AgentTodos> & { agentId: string }): AgentTodos {
  return {
    sessionId: 's1', name: over.agentId, isMain: false, todos: [], updatedAt: 0,
    ...over,
  };
}

describe('buildTree', () => {
  it('nests direct children under the main agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const a = agent({ agentId: 'a', parentAgentId: 's1' });
    const b = agent({ agentId: 'b', parentAgentId: 's1' });
    const roots = buildTree([main, a, b]);
    expect(roots).toHaveLength(1);
    expect(roots[0].agent.agentId).toBe('s1');
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['a', 'b']);
  });

  it('nests a depth-2 agent under its dispatching sub-agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const pai = agent({ agentId: 'pai', parentAgentId: 's1' });
    const filho = agent({ agentId: 'filho', parentAgentId: 'pai', depth: 2 });
    const roots = buildTree([main, pai, filho]);
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].children.map(c => c.agent.agentId)).toEqual(['filho']);
  });

  it('attaches legacy agents (no parentAgentId) to the main agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const legacy = agent({ agentId: 'leg' });
    const roots = buildTree([main, legacy]);
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['leg']);
  });

  it('attaches agents whose parent is not in the list to the main agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const orfao = agent({ agentId: 'x', parentAgentId: 'sumiu' });
    const roots = buildTree([main, orfao]);
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['x']);
  });

  it('promotes agents to roots when there is no main in the list', () => {
    const a = agent({ agentId: 'a' });
    const b = agent({ agentId: 'b', parentAgentId: 'a' });
    const roots = buildTree([a, b]);
    expect(roots.map(r => r.agent.agentId)).toEqual(['a']);
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['b']);
  });

  it('preserves the input order among siblings', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const c = agent({ agentId: 'c', parentAgentId: 's1' });
    const a = agent({ agentId: 'a', parentAgentId: 's1' });
    const roots = buildTree([main, c, a]);
    expect(roots[0].children.map(x => x.agent.agentId)).toEqual(['c', 'a']);
  });
});

describe('isHistory', () => {
  it('is true only for non-main, non-running agents without todos', () => {
    expect(isHistory(agent({ agentId: 'x', status: 'completed' }))).toBe(true);
    expect(isHistory(agent({ agentId: 'x' }))).toBe(true);  // status undefined (órfão)
    expect(isHistory(agent({ agentId: 'x', status: 'running' }))).toBe(false);
    expect(isHistory(agent({ agentId: 's1', isMain: true }))).toBe(false);
    expect(isHistory(agent({
      agentId: 'x', status: 'completed',
      todos: [{ content: 'c', activeForm: 'C', status: 'completed' }],
    }))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/webview/tree.test.ts`
Expected: FAIL — `Cannot find module '../../src/webview/tree'`

- [ ] **Step 3: Implementar**

```ts
// src/webview/tree.ts
import type { AgentTodos } from '../types';

export interface AgentNode {
  agent: AgentTodos;
  children: AgentNode[];
}

// Sub-agent que já terminou e nunca teve todos: só faz sentido como histórico.
export function isHistory(agent: AgentTodos): boolean {
  return !agent.isMain && agent.status !== 'running' && agent.todos.length === 0;
}

// Monta a floresta a partir da lista plana do snapshot. Regras:
// - main agents viram raízes;
// - filho vai para o parentAgentId quando esse agente está na lista;
// - pai ausente/desconhecido → filho do primeiro main (órfão nunca some);
// - sem main na lista → o agente vira raiz;
// - a ordem relativa da lista é preservada entre irmãos (o parser já ordena).
export function buildTree(agents: AgentTodos[]): AgentNode[] {
  const nodes = new Map<string, AgentNode>();
  for (const a of agents) nodes.set(a.agentId, { agent: a, children: [] });
  const mainNode = agents.filter(a => a.isMain).map(a => nodes.get(a.agentId)!)[0];

  const roots: AgentNode[] = [];
  for (const a of agents) {
    const node = nodes.get(a.agentId)!;
    if (a.isMain) {
      roots.push(node);
      continue;
    }
    const parent = a.parentAgentId !== undefined ? nodes.get(a.parentAgentId) : undefined;
    if (parent !== undefined && parent !== node) parent.children.push(node);
    else if (mainNode !== undefined && mainNode !== node) mainNode.children.push(node);
    else roots.push(node);
  }
  return roots;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/webview/tree.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/webview/tree.ts tests/webview/tree.test.ts
git commit -m "feat(webview): buildTree — floresta de agentes a partir do snapshot plano"
```

---

### Task 5: `format.ts` — tokens por agente e tom do badge

**Files:**
- Modify: `src/webview/format.ts`
- Test: `tests/webview/format.test.ts`

**Interfaces:**
- Consumes: `AgentUsage` de `src/types.ts` (já existe: `{ agentId, name, isMain, models: ModelUsage[] }`).
- Produces: `agentTotalTokens(byAgent: AgentUsage[] | undefined, agentId: string): number | null` e `agentTypeTone(agentType: string): AgentTypeTone` com `type AgentTypeTone = 'explore' | 'plan' | 'general' | 'neutral'`. A Task 6 importa ambos de `../format` (a partir de `lib/`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `tests/webview/format.test.ts`:

```ts
import { agentTotalTokens, agentTypeTone } from '../../src/webview/format';
import type { AgentUsage } from '../../src/types';

describe('agentTotalTokens', () => {
  const byAgent: AgentUsage[] = [
    {
      agentId: 'a1', name: 'sub', isMain: false,
      models: [
        { model: 'claude-opus-4-8', input: 100, output: 50, cache: 1000 },
        { model: 'claude-haiku-4-5', input: 10, output: 5, cache: 0 },
      ],
    },
    { agentId: 'vazio', name: 'v', isMain: false, models: [] },
  ];

  it('sums input + output + cache across models', () => {
    expect(agentTotalTokens(byAgent, 'a1')).toBe(1165);
  });

  it('returns null for an agent without usage or unknown agent', () => {
    expect(agentTotalTokens(byAgent, 'vazio')).toBeNull();
    expect(agentTotalTokens(byAgent, 'nope')).toBeNull();
    expect(agentTotalTokens(undefined, 'a1')).toBeNull();
  });
});

describe('agentTypeTone', () => {
  it('maps known types to their tone, case-insensitive', () => {
    expect(agentTypeTone('Explore')).toBe('explore');
    expect(agentTypeTone('Plan')).toBe('plan');
    expect(agentTypeTone('general-purpose')).toBe('general');
  });

  it('falls back to neutral for custom types', () => {
    expect(agentTypeTone('claude-code-guide')).toBe('neutral');
    expect(agentTypeTone('statusline-setup')).toBe('neutral');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/webview/format.test.ts`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Implementar em `src/webview/format.ts`**

Ajustar o import de tipos no topo (`Todo` já é importado):

```ts
import type { Todo, AgentUsage } from '../types';
```

Adicionar ao final do arquivo:

```ts
// Total de tokens de um agente (input + output + cache somados entre modelos),
// para o contador do nó na árvore. null quando o agente não tem usage.
export function agentTotalTokens(byAgent: AgentUsage[] | undefined, agentId: string): number | null {
  const agent = byAgent?.find(a => a.agentId === agentId);
  if (!agent || agent.models.length === 0) return null;
  let total = 0;
  for (const m of agent.models) total += m.input + m.output + m.cache;
  return total;
}

export type AgentTypeTone = 'explore' | 'plan' | 'general' | 'neutral';

// Tom visual do badge de tipo do agente: tipos conhecidos ganham cor própria,
// custom caem no neutro. Case-insensitive (o harness usa "Explore"/"Plan").
export function agentTypeTone(agentType: string): AgentTypeTone {
  const t = agentType.toLowerCase();
  if (t === 'explore') return 'explore';
  if (t === 'plan') return 'plan';
  if (t.startsWith('general')) return 'general';
  return 'neutral';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/webview/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/webview/format.ts tests/webview/format.test.ts
git commit -m "feat(webview): agentTotalTokens e agentTypeTone para o nó da árvore"
```

---

### Task 6: UI — árvore com linhas-guia, badge de tipo e tokens

**Files:**
- Create: `src/webview/lib/AgentTree.svelte`
- Modify: `src/webview/lib/AgentSection.svelte`
- Modify: `src/webview/App.svelte`
- Modify: `src/i18n/messages.ts` (3 idiomas)

**Interfaces:**
- Consumes: `buildTree`/`isHistory`/`AgentNode` (Task 4), `agentTotalTokens`/`agentTypeTone`/`formatCompact` (Task 5), `AgentSection` existente.
- Produces: `AgentTree.svelte` com props `{ node: AgentNode; level?: number; usage?: SessionUsage; history?: boolean }`; `AgentSection.svelte` ganha a prop opcional `tokens?: number | null`. Chaves i18n novas: `agent.typeTooltip` (`{type}`), `agent.tokensTooltip`.

- [ ] **Step 1: Chaves i18n nos três idiomas em `src/i18n/messages.ts`**

Em `en`, após `'agent.noTodos'`:

```ts
    'agent.typeTooltip': 'Agent type: {type}',
    'agent.tokensTooltip': 'Tokens used by this agent (input + output + cache)',
```

Em `pt-br`, mesma posição:

```ts
    'agent.typeTooltip': 'Tipo do agente: {type}',
    'agent.tokensTooltip': 'Tokens usados por este agente (entrada + saída + cache)',
```

Em `es`, mesma posição:

```ts
    'agent.typeTooltip': 'Tipo de agente: {type}',
    'agent.tokensTooltip': 'Tokens usados por este agente (entrada + salida + caché)',
```

Run: `npx vitest run tests/i18n/messages.test.ts` → Expected: PASS (o teste de paridade de chaves cobre os 3 idiomas).

- [ ] **Step 2: `AgentSection.svelte` — badge de tipo + tokens no cabeçalho**

No `<script>`, trocar a linha de props e adicionar imports:

```ts
  import { summarizeTiming, formatDuration, completedTaskDurations, formatCompact, agentTypeTone } from '../format';

  let { agent, defaultExpanded = true, history = false, tokens = null }:
    { agent: AgentTodos; defaultExpanded?: boolean; history?: boolean; tokens?: number | null } = $props();
```

No markup do header, entre `<span class="title">…</span>` e `<span class="counts">`:

```svelte
    {#if agent.agentType}
      <span class="type-badge tone-{agentTypeTone(agent.agentType)}" title={todosStore.t('agent.typeTooltip', { type: agent.agentType })}>{agent.agentType}</span>
    {/if}
    {#if tokens !== null}
      <span class="tokens" title={todosStore.t('agent.tokensTooltip')}>{formatCompact(tokens)}</span>
    {/if}
```

No `<style>`: **remover** a regra `.agent.sub { margin-left: var(--sp-3); }` (o recuo agora vem da árvore) e adicionar:

```css
  .type-badge {
    flex: none;
    font-size: 0.72em;
    padding: 1px 6px;
    border-radius: 8px;
    max-width: 12ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tone);
    background: color-mix(in srgb, var(--tone) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
  }
  .tone-explore { --tone: var(--vscode-charts-green); }
  .tone-plan { --tone: var(--vscode-charts-yellow); }
  .tone-general { --tone: var(--vscode-charts-blue); }
  .tone-neutral { --tone: var(--vscode-descriptionForeground); }
  .tokens {
    flex: none;
    font-size: 0.8em;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
```

- [ ] **Step 3: Criar `src/webview/lib/AgentTree.svelte`**

```svelte
<script lang="ts">
  import AgentTree from './AgentTree.svelte';
  import AgentSection from './AgentSection.svelte';
  import { isHistory, type AgentNode } from '../tree';
  import { agentTotalTokens } from '../format';
  import { todosStore } from '../stores.svelte';
  import type { SessionUsage } from '../../types';

  let { node, level = 0, usage, history = false }:
    { node: AgentNode; level?: number; usage?: SessionUsage; history?: boolean } = $props();

  // Cap de recuo: a partir do 4º nível a árvore achata (o painel é estreito e
  // spawnDepth > 3 é raríssimo).
  let childLevel = $derived(Math.min(level + 1, 3));

  function isFirstHistory(children: AgentNode[], i: number): boolean {
    return isHistory(children[i].agent) && (i === 0 || !isHistory(children[i - 1].agent));
  }
</script>

<AgentSection
  agent={node.agent}
  {history}
  defaultExpanded={node.agent.isMain || node.agent.status === 'running'}
  tokens={agentTotalTokens(usage?.byAgent, node.agent.agentId)}
/>
{#if node.children.length > 0}
  <div class="kids" class:railed={level < 3}>
    {#each node.children as child, i (child.agent.agentId)}
      {#if level === 0 && isFirstHistory(node.children, i)}
        <div class="history-divider">{todosStore.t('app.historyDivider')}</div>
      {/if}
      <div class="branch" class:railed={level < 3}>
        <AgentTree node={child} level={childLevel} {usage} history={isHistory(child.agent)} />
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Linhas-guia (layout A do design): recuo + trilho vertical no contêiner dos
     filhos e um conector horizontal curto por filho, na altura do cabeçalho. */
  .kids.railed {
    margin-left: var(--sp-2);
    padding-left: var(--sp-2);
    border-left: 1px solid var(--vscode-panel-border);
  }
  .branch.railed {
    position: relative;
  }
  .branch.railed::before {
    content: '';
    position: absolute;
    left: calc(-1 * var(--sp-2));
    top: 16px;
    width: calc(var(--sp-2) - 2px);
    height: 1px;
    background: var(--vscode-panel-border);
  }
  .history-divider {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    text-transform: uppercase;
    font-size: 0.7em;
    letter-spacing: 0.5px;
    color: var(--muted);
    margin: var(--sp-2) var(--sp-1) var(--sp-1);
  }
  .history-divider::before,
  .history-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--vscode-panel-border);
  }
</style>
```

- [ ] **Step 4: `App.svelte` — usar a árvore**

No `<script>`: remover as funções `isHistory` e `isFirstHistory` e o import de `AgentSection`; adicionar:

```ts
  import AgentTree from './lib/AgentTree.svelte';
  import { buildTree } from './tree';
```

(remover também o import agora órfão de `AgentTodos` se ficar sem uso).

Substituir o bloco `{#if snapshot.agents.length > 0} … {/if}` da lista por:

```svelte
    {#if snapshot.agents.length > 0}
      <div class="agents">
        {#each buildTree(snapshot.agents) as root (root.agent.agentId)}
          <AgentTree node={root} usage={snapshot.usage} />
        {/each}
      </div>
    {:else}
```

(o `{:else}` do "aguardando tasks" fica como está). No `<style>`, remover a regra `.history-divider` e seus `::before/::after` (migraram para `AgentTree.svelte`).

- [ ] **Step 5: Verificar que compila e a suíte passa**

Run: `npx svelte-check --workspace . 2>&1 | tail -5` (ou `npx svelte-check`)
Expected: 0 errors (warnings pré-existentes são aceitáveis).

Run: `npm test` → Expected: PASS.

Run: `npm run build` → Expected: build dos três alvos sem erro.

- [ ] **Step 6: Verificação visual**

Usar a skill `preview-webview` (screenshot real do painel Svelte) e conferir: hierarquia com trilhos, badge de tipo colorido, tokens no cabeçalho, divisor "histórico" só no nível raiz, tema dark/light. Se a skill não estiver disponível no contexto do executor, reportar para o orquestrador verificar.

- [ ] **Step 7: Commit**

```bash
git add src/webview/lib/AgentTree.svelte src/webview/lib/AgentSection.svelte src/webview/App.svelte src/i18n/messages.ts
git commit -m "feat(panel): árvore de agentes com linhas-guia, badge de tipo e tokens por nó"
```

---

### Task 7: Verificação final e roadmap

**Files:**
- Modify: `docs/ROADMAP.md` (item 13)

**Interfaces:**
- Consumes: tudo acima implementado e verde.
- Produces: branch pronta para release 0.9.0 (release em si fica fora deste plano).

- [ ] **Step 1: Suíte completa + build**

Run: `npm test` → Expected: PASS (todos os arquivos).
Run: `npm run build` → Expected: sem erros.

- [ ] **Step 2: Smoke test ao vivo**

Rodar a skill `smoke-test` do projeto (main + 3 sub-agents com task tracking). Conferir no painel: sub-agents aparecem aninhados sob o main com badge e tokens; o main expande por padrão; agentes running expandem por padrão.

- [ ] **Step 3: Atualizar o roadmap**

Em `docs/ROADMAP.md`, item 13, trocar a linha de status:

```
### 13. Árvore de agentes ao vivo ("mission control") 🚧 implementado — aguardando release 0.9.0
```

E acrescentar ao final do item:

```
- **Status (2026-07):** implementado — spec: [docs/specs/2026-07-11-agent-tree-design.md](specs/2026-07-11-agent-tree-design.md) · plano: [docs/plans/2026-07-11-agent-tree.md](plans/2026-07-11-agent-tree.md). Matching por `toolUseId` com fallback por prompt; agentes aninhados (`spawnDepth ≥ 2`) exibidos sob quem os disparou; badge de tipo + tokens por nó. Falta: release 0.9.0.
```

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): item 13 (árvore de agentes) implementado, aguardando release"
```
