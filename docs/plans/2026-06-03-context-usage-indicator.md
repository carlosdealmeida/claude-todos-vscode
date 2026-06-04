# Indicador de % de contexto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o % de contexto usado da sessão na área "Tokens" do painel, com badge + barra fina e semáforo verde/amarelo/vermelho.

**Architecture:** O parser extrai o tamanho do contexto atual (input + cache da última mensagem do transcript principal) e o limite da janela (200k/1M pelo modelo). A UI (`UsageTable.svelte`) renderiza um badge e uma barra fina coloridos por um nível puro calculado em `format.ts`.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, esbuild.

**Spec:** `docs/specs/2026-06-03-context-usage-indicator-design.md`

---

## File Structure

- `src/services/usageParser.ts` — **Modify.** Nova função exportada `contextLimitFor` + método privado `contextForFile` + montagem de `context` em `usageForSession`.
- `src/types.ts` — **Modify.** Novo `ContextUsage`; campo opcional `context?` em `SessionUsage`.
- `src/webview/format.ts` — **Modify.** Novo `ContextLevel` + `contextLevel(pct)`.
- `src/webview/lib/UsageTable.svelte` — **Modify.** Badge no header + barra fina.
- `tests/services/usageParser.test.ts` — **Modify.** Testes de `contextLimitFor` e da extração de contexto.
- `tests/webview/format.test.ts` — **Modify.** Testes de `contextLevel`.

---

## Task 1: `contextLimitFor(model)` no parser

**Files:**
- Modify: `src/services/usageParser.ts`
- Test: `tests/services/usageParser.test.ts`

- [ ] **Step 1: Write the failing test**

Adicionar no topo de `tests/services/usageParser.test.ts`, trocar a linha de import existente e acrescentar um `describe` no fim do arquivo (antes do `});` final do `describe('UsageParser', ...)` — colocá-lo como um `describe` irmão no fim do arquivo):

```ts
// trocar a import de UsageParser por:
import { UsageParser, contextLimitFor } from '../../src/services/usageParser';
```

```ts
// novo describe (irmão, no fim do arquivo):
describe('contextLimitFor', () => {
  it('returns 1M when the model id advertises a 1m window', () => {
    expect(contextLimitFor('claude-opus-4-8[1m]')).toBe(1_000_000);
    expect(contextLimitFor('claude-sonnet-4-6-1M')).toBe(1_000_000);
  });
  it('defaults to 200k otherwise', () => {
    expect(contextLimitFor('claude-opus-4-8')).toBe(200_000);
    expect(contextLimitFor('gpt-x')).toBe(200_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — `contextLimitFor is not a function` / import não resolve.

- [ ] **Step 3: Write minimal implementation**

Em `src/services/usageParser.ts`, logo após os imports e antes de `interface AgentRef`:

```ts
const DEFAULT_CONTEXT_LIMIT = 200_000;
const ONE_MILLION = 1_000_000;

// The context window for a model: 1M when the id advertises it (e.g. the
// "[1m]" suffix), otherwise the 200k default.
export function contextLimitFor(model: string): number {
  return /1m/i.test(model) ? ONE_MILLION : DEFAULT_CONTEXT_LIMIT;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS (todos os testes do arquivo verdes).

- [ ] **Step 5: Commit**

```bash
git add src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "feat: contextLimitFor detecta janela 200k/1M pelo modelo"
```

---

## Task 2: Tipo `ContextUsage` + extração do contexto

**Files:**
- Modify: `src/types.ts`
- Modify: `src/services/usageParser.ts`
- Test: `tests/services/usageParser.test.ts`

- [ ] **Step 1: Write the failing test**

Adicionar este `describe` irmão no fim de `tests/services/usageParser.test.ts` (usa os helpers `assistant`/`writeMain`/`mainRef`/`encodeCwdToProjectDir` já definidos no arquivo):

```ts
describe('context window usage', () => {
  it('reads context from the last usage-bearing message of the main transcript', () => {
    writeMain([
      assistant('claude-opus-4-8', { input: 100, cacheCreate: 200, cacheRead: 50 }),
      assistant('claude-opus-4-8', { input: 1000, output: 30, cacheCreate: 2000, cacheRead: 5000 }),
    ]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    // última msg: input 1000 + cacheRead 5000 + cacheCreate 2000 = 8000 (output ignorado)
    expect(usage.context).toEqual({ tokens: 8000, limit: 200_000 });
  });

  it('detects the 1M window from the model id', () => {
    writeMain([assistant('claude-opus-4-8[1m]', { input: 10, cacheRead: 5 })]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.context).toEqual({ tokens: 15, limit: 1_000_000 });
  });

  it('ignores sidechain entries when picking the last message', () => {
    writeMain([
      { ...assistant('claude-opus-4-8', { input: 100, cacheRead: 50 }), isSidechain: false },
      { ...assistant('claude-sonnet-4-6', { input: 9999, cacheRead: 9999 }), isSidechain: true },
    ]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.context).toEqual({ tokens: 150, limit: 200_000 });
  });

  it('leaves context undefined when the transcript has no usage', () => {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${SID}.jsonl`),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
    );
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.context).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — `usage.context` é `undefined` em todos (campo não existe / não populado), e `toEqual({tokens..})` falha.

- [ ] **Step 3: Write minimal implementation**

3a. Em `src/types.ts`, adicionar a interface antes de `SessionUsage` e o campo dentro de `SessionUsage`:

```ts
export interface ContextUsage {
  tokens: number;  // input + cache da última mensagem do transcript principal
  limit: number;   // 200_000 | 1_000_000
}
```

```ts
export interface SessionUsage {
  byModel: ModelUsage[];
  byAgent: AgentUsage[];
  context?: ContextUsage;
}
```

3b. Em `src/services/usageParser.ts`, ampliar o type-import e adicionar a extração.

Trocar a linha de import de tipos:

```ts
import type { AgentUsage, ContextUsage, ModelUsage, SessionUsage } from '../types';
```

No corpo de `usageForSession`, trocar o `return` final por:

```ts
    let context: ContextUsage | undefined;
    const mainRef = agents.find(a => a.isMain);
    if (mainRef) {
      const mainFile = transcriptPath(this.claudeDir, sessionId, cwd);
      if (mainFile) context = this.contextForFile(mainFile);
    }

    return { byModel: this.aggregate(byAgent), byAgent, context };
```

Adicionar o método privado (por exemplo logo após `modelsForFile`):

```ts
  // The current context size = input + cache of the LAST usage-bearing message
  // in the main transcript (output is excluded; sidechain entries are skipped).
  // Returns undefined when the transcript has no usage yet.
  private contextForFile(filePath: string): ContextUsage | undefined {
    let lines: string[];
    try {
      lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return undefined;
    }

    let last: { usage: RawUsage; model: string } | undefined;
    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      if (entry.isSidechain) continue;
      const msg = entry.message;
      if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
      last = { usage: msg.usage, model: msg.model };
    }
    if (!last) return undefined;

    const u = last.usage;
    const tokens = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
    return { tokens, limit: contextLimitFor(last.model) };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS (todos verdes, incluindo os testes pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "feat: parser extrai tamanho do contexto da sessão"
```

---

## Task 3: `contextLevel(pct)` (semáforo)

**Files:**
- Modify: `src/webview/format.ts`
- Test: `tests/webview/format.test.ts`

- [ ] **Step 1: Write the failing test**

Trocar a import no topo de `tests/webview/format.test.ts`:

```ts
import { formatCompact, shortModel, contextLevel } from '../../src/webview/format';
```

Adicionar este `describe` no fim do arquivo:

```ts
describe('contextLevel', () => {
  it('is ok below 60%', () => {
    expect(contextLevel(0)).toBe('ok');
    expect(contextLevel(0.59)).toBe('ok');
  });
  it('is warn from 60% up to (but not including) 85%', () => {
    expect(contextLevel(0.60)).toBe('warn');
    expect(contextLevel(0.84)).toBe('warn');
  });
  it('is danger at 85% and above', () => {
    expect(contextLevel(0.85)).toBe('danger');
    expect(contextLevel(1)).toBe('danger');
  });
  it('treats values above 1 as danger', () => {
    expect(contextLevel(1.5)).toBe('danger');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/webview/format.test.ts`
Expected: FAIL — `contextLevel is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicionar ao fim de `src/webview/format.ts`:

```ts
export type ContextLevel = 'ok' | 'warn' | 'danger';

// Maps a context-fill ratio (0..1+) to a traffic-light level:
// ok < 0.60 <= warn < 0.85 <= danger.
export function contextLevel(pct: number): ContextLevel {
  if (pct >= 0.85) return 'danger';
  if (pct >= 0.60) return 'warn';
  return 'ok';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/webview/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/webview/format.ts tests/webview/format.test.ts
git commit -m "feat: contextLevel mapeia % de contexto em semáforo"
```

---

## Task 4: UI — badge + barra fina no `UsageTable.svelte`

**Files:**
- Modify: `src/webview/lib/UsageTable.svelte`

> Componentes Svelte não têm teste unitário neste projeto (a lógica testável vive em `format.ts`/serviços). A verificação é via `tsc`, suíte completa e `build`.

- [ ] **Step 1: Importar `contextLevel` e derivar os valores**

Trocar a primeira import do `<script>`:

```ts
  import { formatCompact, shortModel, contextLevel } from '../format';
```

Logo após `let { usage }: { usage: SessionUsage } = $props();`, adicionar:

```ts
  let ctx = $derived(usage.context);
  let ctxPct = $derived(ctx ? Math.min(ctx.tokens / ctx.limit, 1) : 0);
  let ctxLevel = $derived(ctx ? contextLevel(ctx.tokens / ctx.limit) : 'ok');
```

- [ ] **Step 2: Renderizar o badge no header e a barra fina**

Trocar o bloco `<div class="head"> ... </div>` por:

```svelte
    <div class="head">
      <span class="label">Tokens{#if ctx}<span class="ctx-badge {ctxLevel}">{Math.round(ctxPct * 100)}% ctx</span>{/if}</span>
      <button class="toggle" onclick={() => byAgent = !byAgent} aria-pressed={byAgent}>
        {byAgent ? '◂ por modelo' : 'por agente ▸'}
      </button>
    </div>

    {#if ctx}
      <div class="ctx-bar-row">
        <div class="ctx-bar"><div class="ctx-fill {ctxLevel}" style="width: {ctxPct * 100}%"></div></div>
        <span class="ctx-count">{formatCompact(ctx.tokens)}/{formatCompact(ctx.limit)}</span>
      </div>
    {/if}
```

- [ ] **Step 3: Adicionar o CSS**

Acrescentar ao bloco `<style>` (antes do `.model { ... }` final, por exemplo):

```css
  .ctx-badge {
    margin-left: 0.4rem;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.85em;
    font-weight: 600;
  }
  .ctx-badge.ok { color: var(--vscode-charts-green); }
  .ctx-badge.warn { color: var(--vscode-charts-yellow); }
  .ctx-badge.danger { color: var(--vscode-charts-red); }
  .ctx-bar-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
  }
  .ctx-bar {
    flex: 1;
    height: 4px;
    background: var(--vscode-panel-border);
    border-radius: 2px;
    overflow: hidden;
  }
  .ctx-fill { height: 100%; transition: width 200ms ease; }
  .ctx-fill.ok { background: var(--vscode-charts-green); }
  .ctx-fill.warn { background: var(--vscode-charts-yellow); }
  .ctx-fill.danger { background: var(--vscode-charts-red); }
  .ctx-count {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
```

- [ ] **Step 4: Verificar tipos, testes e build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `npx vitest run`
Expected: todos os testes verdes (suíte anterior + novos).

Run: `npm run build`
Expected: exit 0 (ext + hook + webview compilam).

- [ ] **Step 5: Commit**

```bash
git add src/webview/lib/UsageTable.svelte
git commit -m "feat: badge + barra de % de contexto no painel"
```

---

## Self-review (preenchido)

- **Cobertura da spec:** fonte do dado (Task 2), limite 200k/1M (Task 1), tipo `ContextUsage` (Task 2), `contextLevel`/limiares (Task 3), UI layout C (Task 4), edge cases — sem usage → `context` undefined (Task 2) + UI oculta via `{#if ctx}` (Task 4); `tokens > limit` → `Math.min(...,1)` no `ctxPct` e `contextLevel` retorna `danger` (Tasks 3/4). ✓
- **Arredondamento:** `Math.round(ctxPct * 100)` (Task 4) conforme spec. ✓
- **Consistência de tipos:** `ContextUsage {tokens, limit}`, `contextLimitFor`, `ContextLevel`, `contextLevel` usados com os mesmos nomes em todas as tarefas. ✓
- **Sem placeholders:** todo passo tem código ou comando concreto. ✓
