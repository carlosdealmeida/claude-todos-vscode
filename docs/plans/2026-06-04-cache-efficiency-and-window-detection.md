# Eficiência de cache + detecção de janela — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a detecção da janela de contexto (200k/1M) e adicionar um indicador de eficiência de cache (taxa de reaproveitamento + barra empilhada) ao painel.

**Architecture:** Parte 1 troca a heurística de `contextLimitFor` (família opus/sonnet 4+ ou evidência observada). Parte 2 adiciona um agregado `CacheStats` ao `SessionUsage` (computado em passagem única no parser) e renderiza um bloco novo na `UsageTable`, coexistindo com o indicador de contexto.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, esbuild.

**Spec:** `docs/specs/2026-06-04-cache-efficiency-and-window-detection-design.md`

---

## File Structure

- `src/services/usageParser.ts` — **Modify.** Nova heurística em `contextLimitFor`/`supportsOneMillion`; `contextForFile` passa os tokens observados; `modelsForFile` vira `modelsAndCacheForFile` (passagem única que também soma o breakdown de cache); `usageForSession` agrega `CacheStats`.
- `src/types.ts` — **Modify.** Novo `CacheStats`; campo `cache?` em `SessionUsage`.
- `src/webview/format.ts` — **Modify.** Novo `CacheLevel` + `cacheLevel(rate)`.
- `src/webview/lib/UsageTable.svelte` — **Modify.** Bloco de cache (rótulo + badge + barra empilhada + legenda).
- `tests/services/usageParser.test.ts` — **Modify.** Reescrever `contextLimitFor` tests; ajustar os context-extraction tests (opus-4-8 agora é 1M); novos tests de `CacheStats`.
- `tests/webview/format.test.ts` — **Modify.** Tests de `cacheLevel`.

---

## Task 1: Corrigir a detecção da janela (família + evidência)

**Files:**
- Modify: `src/services/usageParser.ts`
- Test: `tests/services/usageParser.test.ts`

Esta task muda o comportamento de `contextLimitFor`, então tanto os testes da função quanto os de extração de contexto (que chamam através de `contextForFile`) são atualizados.

- [ ] **Step 1: Reescrever os testes de `contextLimitFor`**

Em `tests/services/usageParser.test.ts`, substituir TODO o bloco `describe('contextLimitFor', ...)` existente por:

```ts
describe('contextLimitFor', () => {
  it('detects 1M for opus/sonnet generation 4+ by family', () => {
    expect(contextLimitFor('claude-opus-4-8')).toBe(1_000_000);
    expect(contextLimitFor('claude-sonnet-4-6')).toBe(1_000_000);
  });
  it('detects 1M from an explicit 1m suffix', () => {
    expect(contextLimitFor('claude-opus-4-8[1m]')).toBe(1_000_000);
    expect(contextLimitFor('claude-sonnet-4-6-1M')).toBe(1_000_000);
  });
  it('keeps 200k for haiku and pre-4 families', () => {
    expect(contextLimitFor('claude-haiku-4-5')).toBe(200_000);
    expect(contextLimitFor('claude-3-5-sonnet-20241022')).toBe(200_000);
  });
  it('elevates to 1M when observed tokens exceed 200k (evidence)', () => {
    expect(contextLimitFor('claude-haiku-4-5', 250_000)).toBe(1_000_000);
    expect(contextLimitFor('claude-haiku-4-5', 50_000)).toBe(200_000);
    expect(contextLimitFor('totally-unknown', 300_000)).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: Atualizar os context-extraction tests afetados**

Ainda em `tests/services/usageParser.test.ts`, dentro do `describe('context window usage', ...)`:

No teste `'reads context from the last usage-bearing message of the main transcript'`, trocar a asserção final de `limit: 200_000` para `limit: 1_000_000`:
```ts
    expect(usage.context).toEqual({ tokens: 8000, limit: 1_000_000 });
```

No teste `'ignores sidechain entries when picking the last message'`, trocar `limit: 200_000` para `limit: 1_000_000`:
```ts
    expect(usage.context).toEqual({ tokens: 150, limit: 1_000_000 });
```

Adicionar um novo teste no mesmo `describe` para a rede de segurança (evidência) num modelo que de outro modo seria 200k:
```ts
  it('elevates a 200k-family model to 1M when the observed context exceeds 200k', () => {
    writeMain([assistant('claude-haiku-4-5', { cacheRead: 250_000 })]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.context).toEqual({ tokens: 250_000, limit: 1_000_000 });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — os novos `contextLimitFor` casos de família falham (`200000` !== `1000000`), e os context-extraction atualizados falham, porque a implementação antiga só olha `/1m/`.

- [ ] **Step 4: Implementar a nova heurística**

Em `src/services/usageParser.ts`, substituir as linhas 6–13 (constantes + `contextLimitFor`) por:

```ts
const DEFAULT_CONTEXT_LIMIT = 200_000;
const ONE_MILLION = 1_000_000;

// opus/sonnet generation 4–19 (e.g. opus-4-8, sonnet-4-6). The `(?!\d)` stops
// the date-suffixed legacy id "claude-3-5-sonnet-20241022" from matching
// (its "sonnet-20" is neither [4-9] nor 1\d).
const ONE_M_FAMILY = /(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)/i;

function supportsOneMillion(model: string): boolean {
  return /1m/i.test(model) || ONE_M_FAMILY.test(model);
}

// The context window for a model. 1M when the family supports it (opus/sonnet
// gen 4+, or an explicit 1m suffix) OR when the observed context already
// exceeds 200k (proof of a larger window). Always elevates, never lowers.
export function contextLimitFor(model: string, observedTokens = 0): number {
  const base = supportsOneMillion(model) ? ONE_MILLION : DEFAULT_CONTEXT_LIMIT;
  return observedTokens > base ? ONE_MILLION : base;
}
```

In `contextForFile` (the `return` at the end of the method), pass the observed tokens:
```ts
    return { tokens, limit: contextLimitFor(last.model, tokens) };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS (all green). Also run `npx tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "fix: detecta janela 1M por família opus/sonnet 4+ ou evidência"
```

---

## Task 2: `CacheStats` — tipo + agregação no parser

**Files:**
- Modify: `src/types.ts`
- Modify: `src/services/usageParser.ts`
- Test: `tests/services/usageParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Adicionar este `describe` aninhado ao final do `describe('UsageParser', ...)` (reutiliza `assistant`/`writeMain`/`writeSubAgent`/`mainRef`/`SID`/`CWD`):

```ts
describe('cache stats', () => {
  it('aggregates input/read/creation across main and sub-agents', () => {
    writeMain([assistant('claude-opus-4-8', { input: 10, cacheRead: 100, cacheCreate: 5 })]);
    writeSubAgent('aaa', [assistant('claude-sonnet-4-6', { input: 4, cacheRead: 40, cacheCreate: 2 })]);
    const agents = [mainRef, { agentId: 'aaa', name: 'explorer', isMain: false }];
    const usage = parser.usageForSession(SID, CWD, agents);
    expect(usage.cache).toEqual({ input: 14, read: 140, creation: 7 });
  });

  it('skips sidechain entries in the main transcript (no double-count)', () => {
    writeMain([
      { ...assistant('claude-opus-4-8', { input: 10, cacheRead: 100 }), isSidechain: false },
      { ...assistant('claude-sonnet-4-6', { input: 999, cacheRead: 999 }), isSidechain: true },
    ]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.cache).toEqual({ input: 10, read: 100, creation: 0 });
  });

  it('leaves cache undefined when there is no usage', () => {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${SID}.jsonl`),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }));
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.cache).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — `usage.cache` é `undefined` (campo não existe / não populado).

- [ ] **Step 3: Add the type**

Em `src/types.ts`, adicionar antes de `SessionUsage`:
```ts
export interface CacheStats {
  input: number;     // entrada não-cacheada (Σ input_tokens)
  read: number;      // Σ cache_read_input_tokens
  creation: number;  // Σ cache_creation_input_tokens
}
```
E adicionar o campo opcional a `SessionUsage`:
```ts
export interface SessionUsage {
  byModel: ModelUsage[];  // totais da sessão agrupados por modelo
  byAgent: AgentUsage[];  // quebra por agente
  context?: ContextUsage;
  cache?: CacheStats;
}
```

- [ ] **Step 4: Single-pass aggregation in the parser**

Em `src/services/usageParser.ts`:

Ampliar o import de tipos:
```ts
import type { AgentUsage, CacheStats, ContextUsage, ModelUsage, SessionUsage } from '../types';
```

Substituir o método `modelsForFile` inteiro por uma versão que também soma o breakdown de cache numa passagem única (renomeada):
```ts
  // Reads one transcript file in a single pass. For the main transcript,
  // isSidechain entries are skipped (sub-agent turns come from their own
  // agent-*.jsonl). Returns one ModelUsage per distinct model AND the cache
  // breakdown (non-cached input, cache read, cache creation) for the file.
  private modelsAndCacheForFile(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats } {
    let lines: string[];
    try {
      lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return { models: [], cache: { input: 0, read: 0, creation: 0 } };
    }

    const byModel = new Map<string, ModelUsage>();
    const cache: CacheStats = { input: 0, read: 0, creation: 0 };
    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      if (skipSidechain && entry.isSidechain) continue;
      const msg = entry.message;
      if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
      const u = msg.usage;
      const input = num(u.input_tokens);
      const read = num(u.cache_read_input_tokens);
      const creation = num(u.cache_creation_input_tokens);
      const acc = byModel.get(msg.model) ?? { model: msg.model, input: 0, output: 0, cache: 0 };
      acc.input += input;
      acc.output += num(u.output_tokens);
      acc.cache += creation + read;
      byModel.set(msg.model, acc);
      cache.input += input;
      cache.read += read;
      cache.creation += creation;
    }
    return { models: [...byModel.values()], cache };
  }
```

Substituir o corpo de `usageForSession` (o loop + return) por:
```ts
  usageForSession(sessionId: string, cwd: string, agents: AgentRef[]): SessionUsage {
    const byAgent: AgentUsage[] = [];
    const sessionCache: CacheStats = { input: 0, read: 0, creation: 0 };

    for (const agent of agents) {
      const filePath = agent.isMain
        ? transcriptPath(this.claudeDir, sessionId, cwd)
        : this.subAgentFile(sessionId, cwd, agent.agentId);
      if (!filePath) continue;

      const { models, cache } = this.modelsAndCacheForFile(filePath, agent.isMain);
      if (models.length === 0) continue;

      byAgent.push({ agentId: agent.agentId, name: agent.name, isMain: agent.isMain, models });
      sessionCache.input += cache.input;
      sessionCache.read += cache.read;
      sessionCache.creation += cache.creation;
    }

    let context: ContextUsage | undefined;
    const hasMain = agents.some(a => a.isMain);
    if (hasMain) {
      const mainFile = transcriptPath(this.claudeDir, sessionId, cwd);
      if (mainFile) context = this.contextForFile(mainFile);
    }

    const cacheTotal = sessionCache.input + sessionCache.read + sessionCache.creation;
    const cache = cacheTotal > 0 ? sessionCache : undefined;

    return { byModel: this.aggregate(byAgent), byAgent, context, cache };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS (todos os tests, incluindo os pré-existentes de byModel/byAgent que continuam válidos pois `ModelUsage` não mudou). Run `npx tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "feat: parser agrega breakdown de cache (input/read/creation)"
```

---

## Task 3: `cacheLevel(rate)` (semáforo invertido)

**Files:**
- Modify: `src/webview/format.ts`
- Test: `tests/webview/format.test.ts`

- [ ] **Step 1: Write the failing test**

Trocar a import no topo de `tests/webview/format.test.ts` para incluir `cacheLevel`:
```ts
import { formatCompact, shortModel, contextLevel, cacheLevel } from '../../src/webview/format';
```

Adicionar ao final do arquivo:
```ts
describe('cacheLevel', () => {
  it('is good at 75% and above', () => {
    expect(cacheLevel(1)).toBe('good');
    expect(cacheLevel(0.75)).toBe('good');
  });
  it('is mid from 50% up to (but not including) 75%', () => {
    expect(cacheLevel(0.74)).toBe('mid');
    expect(cacheLevel(0.50)).toBe('mid');
  });
  it('is low below 50%', () => {
    expect(cacheLevel(0.49)).toBe('low');
    expect(cacheLevel(0)).toBe('low');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/webview/format.test.ts`
Expected: FAIL — `cacheLevel is not a function`.

- [ ] **Step 3: Implement**

Adicionar ao final de `src/webview/format.ts`:
```ts
export type CacheLevel = 'good' | 'mid' | 'low';

// Maps a cache-reuse ratio (0..1) to a traffic-light level. Inverted vs
// contextLevel: more reuse is better. good >= 0.75 > mid >= 0.50 > low.
export function cacheLevel(rate: number): CacheLevel {
  if (rate >= 0.75) return 'good';
  if (rate >= 0.50) return 'mid';
  return 'low';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/webview/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/webview/format.ts tests/webview/format.test.ts
git commit -m "feat: cacheLevel mapeia taxa de reaproveitamento em semáforo"
```

---

## Task 4: UI — bloco de cache no `UsageTable.svelte`

**Files:**
- Modify: `src/webview/lib/UsageTable.svelte`

> Sem teste unitário (componente Svelte). Verificação via tsc + build + preview visual (skill `preview-webview`).

- [ ] **Step 1: Importar `cacheLevel` e derivar os valores**

Trocar a primeira import do `<script>`:
```ts
  import { formatCompact, shortModel, contextLevel, cacheLevel } from '../format';
```

Após as derivações de contexto existentes (`ctxLevel`), adicionar:
```ts
  let cache = $derived(usage.cache);
  let cacheTotal = $derived(cache ? cache.input + cache.read + cache.creation : 0);
  let cacheRate = $derived(cache && cacheTotal > 0 ? cache.read / cacheTotal : 0);
  let cacheLvl = $derived(cacheLevel(cacheRate));
  function pctOf(part: number): number {
    return cacheTotal > 0 ? Math.round((part / cacheTotal) * 100) : 0;
  }
```

- [ ] **Step 2: Renderizar o bloco de cache**

Inserir, no template, logo **depois** do bloco `{#if ctx} ... {/if}` (a barra de contexto) e **antes** do `<table>`:

```svelte
    {#if cache && cacheTotal > 0}
      <div class="cache-head">
        <span class="cache-label">Cache</span>
        <span class="cache-badge {cacheLvl}">{Math.round(cacheRate * 100)}% reaproveitado</span>
      </div>
      <div class="cache-stack" aria-hidden="true">
        <div class="seg read" style="width: {pctOf(cache.read)}%"></div>
        <div class="seg create" style="width: {pctOf(cache.creation)}%"></div>
        <div class="seg new" style="width: {pctOf(cache.input)}%"></div>
      </div>
      <div class="cache-legend">
        <span><span class="cdot read"></span>lido {formatCompact(cache.read)}</span>
        <span><span class="cdot create"></span>criado {formatCompact(cache.creation)}</span>
        <span><span class="cdot new"></span>novo {formatCompact(cache.input)}</span>
      </div>
    {/if}
```

- [ ] **Step 3: Adicionar o CSS**

Acrescentar ao bloco `<style>`:
```css
  .cache-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.2rem;
  }
  .cache-label { font-size: 0.9em; }
  .cache-badge {
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.85em;
    font-weight: 600;
  }
  .cache-badge.good { color: var(--vscode-charts-green); background: color-mix(in srgb, var(--vscode-charts-green) 15%, transparent); }
  .cache-badge.mid { color: var(--vscode-charts-yellow); background: color-mix(in srgb, var(--vscode-charts-yellow) 15%, transparent); }
  .cache-badge.low { color: var(--vscode-charts-red); background: color-mix(in srgb, var(--vscode-charts-red) 15%, transparent); }
  .cache-stack {
    display: flex;
    height: 7px;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.25rem;
  }
  .cache-stack .seg { height: 100%; }
  .cache-stack .seg.read { background: var(--vscode-charts-green); }
  .cache-stack .seg.create { background: var(--vscode-charts-blue); }
  .cache-stack .seg.new { background: var(--vscode-descriptionForeground); }
  .cache-legend {
    display: flex;
    gap: 0.6rem;
    font-size: 0.75em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 0.4rem;
    flex-wrap: wrap;
  }
  .cdot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 2px;
    margin-right: 3px;
    vertical-align: middle;
  }
  .cdot.read { background: var(--vscode-charts-green); }
  .cdot.create { background: var(--vscode-charts-blue); }
  .cdot.new { background: var(--vscode-descriptionForeground); }
```

- [ ] **Step 4: Verificar tipos, testes e build**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0.
Run: `npx vitest run` → todos verdes.
Run: `npm run build` → exit 0 (somente os warnings pré-existentes de Node-version e do `$state` em AgentSection.svelte; nada novo de UsageTable.svelte).

- [ ] **Step 5: Commit**

```bash
git add src/webview/lib/UsageTable.svelte
git commit -m "feat: bloco de eficiência de cache no painel"
```

---

## Self-review (preenchido)

- **Cobertura da spec:** Parte 1 detecção (Task 1: família regex + evidência + `contextForFile` passa tokens); Parte 2 dados (Task 2: `CacheStats` + agregação passagem única); métrica/taxa (Task 2 dados + Task 4 cálculo `cacheRate`); `cacheLevel` semáforo (Task 3); UI badge+barra+legenda coexistindo (Task 4); edge `total===0` oculta (Task 2 retorna `undefined` + Task 4 `{#if cache && cacheTotal>0}`). ✓
- **Sem placeholders:** todo passo tem código/comando concreto. ✓
- **Consistência de tipos:** `CacheStats {input, read, creation}`, `contextLimitFor(model, observedTokens)`, `cacheLevel`/`CacheLevel`, `modelsAndCacheForFile` usados com os mesmos nomes em todas as tasks. ✓
- **Regressões previstas e tratadas:** mudar `contextLimitFor` quebra os tests de extração de contexto (opus-4-8 → 1M) — Task 1 Step 2 atualiza-os; renomear `modelsForFile` → único call site atualizado em Task 2 Step 4; `ModelUsage` inalterado preserva os tests de byModel/byAgent. ✓
