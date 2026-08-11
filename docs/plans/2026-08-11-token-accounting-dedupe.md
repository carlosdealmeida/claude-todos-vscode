# Contabilidade de tokens (R5): dedupe por request + `usage.iterations` — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a inflação ~2× dos totais de tokens (dedupe por request) e a leitura de contexto em turnos com advisor (`usage.iterations`), unificando a leitura do transcript principal numa passada só.

**Architecture:** Toda a mudança de comportamento vive em `readFileUsage` ([src/services/usageParser.ts](../../src/services/usageParser.ts)): a agregação passa a eleger um record vencedor por `requestId` (fallback `message.id`; sem nenhum, a linha conta sozinha — legado preservado) e o retorno ganha `context?: ContextUsage` computado da última entrada válida, preferindo a última iteration `type:"message"` quando `usage.iterations` existir. `usageForSession` passa a usar esse `context` e `contextForFile` morre (unificação R-perf). `ProjectUsageService` e o JetBrains (via `SessionCore`) herdam tudo sem mudança. Spec: [docs/specs/2026-08-11-token-accounting-dedupe-design.md](../specs/2026-08-11-token-accounting-dedupe-design.md).

**Tech Stack:** TypeScript estrito, vitest, Node `fs` puro. Sem dependência nova.

## Global Constraints

- Nenhuma mudança de UI, protocolo, schema ou i18n — só parser e docs.
- Fixtures/testes legados (sem `requestId`/`message.id`) devem continuar passando **sem alteração** — é o teste de compatibilidade.
- Entradas `<synthetic>` e (no main, `skipSidechain=true`) `isSidechain` seguem puladas ANTES de qualquer agrupamento.
- Regra do vencedor por request: record **final** = `stop_reason != null` OU `usage.iterations` presente (array); um final só é substituído por outro final; entre snapshots, vence o de maior `output_tokens` (empate: o último visto).
- Totais usam o usage **top-level** do vencedor (rollup = consumo real; advisor atribuído ao modelo do request — decisão 4 do spec). Contexto usa a última iteration `type:"message"` (decisão 2).
- Commits em pt-BR sem acentos (padrão do repo), com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Rodar testes com `npx vitest run <arquivo>` (alvo) e `npx vitest run` (suíte completa na última task).

---

### Task 1: Dedupe por request no `readFileUsage`

**Files:**
- Modify: `src/services/usageParser.ts:32-91` (`RawUsage`, `TranscriptEntry`, `readFileUsage`)
- Test: `tests/services/usageParser.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Consumes: assinatura atual `readFileUsage(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats; lastModel?: string }` — inalterada nesta task.
- Produces: mesma assinatura, semântica nova (dedupe). A Task 2 estende o retorno; a Task 3 depende só da semântica.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `tests/services/usageParser.test.ts` (fora dos `describe` existentes):

```ts
describe('readFileUsage — dedupe por request (formato multi-record)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  interface Tokens { input?: number; output?: number; cacheCreate?: number; cacheRead?: number }
  function record(
    requestId: string | undefined,
    model: string,
    t: Tokens,
    opts: { msgId?: string; stopReason?: string; iterations?: object[] } = {},
  ): object {
    return {
      type: 'assistant',
      ...(requestId !== undefined ? { requestId } : {}),
      message: {
        ...(opts.msgId !== undefined ? { id: opts.msgId } : {}),
        model,
        role: 'assistant',
        stop_reason: opts.stopReason ?? null,
        usage: {
          input_tokens: t.input ?? 0,
          output_tokens: t.output ?? 0,
          cache_creation_input_tokens: t.cacheCreate ?? 0,
          cache_read_input_tokens: t.cacheRead ?? 0,
          ...(opts.iterations !== undefined ? { iterations: opts.iterations } : {}),
        },
      },
    };
  }
  function write(lines: object[]): string {
    const p = path.join(dir, 't.jsonl');
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
    return p;
  }

  it('conta uma unica vez um request com o usage final replicado em N records (backfill completo)', () => {
    const final = { input: 4, output: 428, cacheCreate: 3249, cacheRead: 100_000 };
    const p = write([
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 4, output: 428, cache: 103_249 },
    ]);
  });

  it('prefere o record final (stop_reason) ao snapshot inicial do mesmo request', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 2, output: 1, cacheRead: 50_000 }),
      record('req_1', 'claude-opus-4-8', { input: 4, output: 250, cacheRead: 50_000 }, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 4, output: 250, cache: 50_000 },
    ]);
  });

  it('um final ja visto nao e substituido por snapshot posterior', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 4, output: 250 }, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', { input: 2, output: 999 }),
    ]);
    expect(readFileUsage(p, false).models[0].output).toBe(250);
  });

  it('sem record final (backfill perdido, #84223), vence o snapshot de maior output', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 2, output: 1, cacheRead: 10_000 }),
      record('req_1', 'claude-opus-4-8', { input: 2, output: 65, cacheRead: 10_000 }),
      record('req_1', 'claude-opus-4-8', { input: 2, output: 3, cacheRead: 10_000 }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 2, output: 65, cache: 10_000 },
    ]);
  });

  it('usage com iterations conta como final mesmo sem stop_reason', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 2, output: 999 }),
      record('req_1', 'claude-opus-4-8', { input: 4, output: 428 }, {
        iterations: [{ type: 'message', input_tokens: 4, output_tokens: 428 }],
      }),
    ]);
    expect(readFileUsage(p, false).models[0].output).toBe(428);
  });

  it('os totais de um request com iterations usam o usage top-level (rollup = consumo real)', () => {
    // rollup do advisor (#84738): top-level soma as iterations; os TOTAIS usam isso mesmo
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 4, output: 428, cacheCreate: 3249, cacheRead: 1_031_027 }, {
        stopReason: 'end_turn',
        iterations: [
          { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_122, cache_creation_input_tokens: 783, output_tokens: 65 },
          { type: 'advisor_message', model: 'claude-opus-5', input_tokens: 516_328, output_tokens: 13_610 },
          { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_905, cache_creation_input_tokens: 2466, output_tokens: 363 },
        ],
      }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 4, output: 428, cache: 1_034_276 },
    ]);
  });

  it('requests distintos somam normalmente', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 10, output: 5 }, { stopReason: 'end_turn' }),
      record('req_2', 'claude-opus-4-8', { input: 20, output: 7 }, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 30, output: 12, cache: 0 },
    ]);
  });

  it('sem requestId, deduplica pelo message.id (transcripts antigos)', () => {
    const p = write([
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }, { msgId: 'msg_1', stopReason: 'end_turn' }),
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }, { msgId: 'msg_1', stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models[0]).toEqual(
      { model: 'claude-opus-4-8', input: 10, output: 5, cache: 0 });
  });

  it('sem requestId nem message.id, cada linha conta sozinha (legado)', () => {
    const p = write([
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }),
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }),
    ]);
    expect(readFileUsage(p, false).models[0]).toEqual(
      { model: 'claude-opus-4-8', input: 20, output: 10, cache: 0 });
  });

  it('cache stats seguem o mesmo dedupe', () => {
    const final = { input: 4, output: 100, cacheCreate: 500, cacheRead: 9000 };
    const p = write([
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).cache).toEqual({ input: 4, read: 9000, creation: 500 });
  });

  it('lastModel continua sendo o da ultima entrada valida, mesmo com dedupe', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 1, output: 1 }, { stopReason: 'end_turn' }),
      record('req_2', 'claude-sonnet-4-6', { input: 1, output: 1 }, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).lastModel).toBe('claude-sonnet-4-6');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — os testes de dedupe quebram (a soma ingênua conta N×); os demais passam.

- [ ] **Step 3: Implementar o dedupe**

Em `src/services/usageParser.ts`:

(a) Estender os tipos internos (substituir as interfaces `RawUsage` e `TranscriptEntry` atuais):

```ts
interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  iterations?: unknown;
}

interface TranscriptEntry {
  type?: string;
  isSidechain?: boolean;
  requestId?: unknown;
  message?: {
    id?: unknown;
    model?: unknown;
    stop_reason?: unknown;
    usage?: RawUsage;
  };
}
```

(b) Substituir o corpo de `readFileUsage` (mantendo a assinatura e o doc-comment, ajustado):

```ts
// Lê um transcript em uma passada e devolve o uso por modelo + o breakdown de
// cache do arquivo. O transcript grava um record por content block, replicando
// o usage final do request em cada um (e às vezes só snapshots, quando o
// backfill falha — #84223) — por isso a agregação elege um VENCEDOR por
// requestId em vez de somar linhas: final (stop_reason/iterations) > snapshot
// de maior output. No transcript principal, entradas isSidechain são puladas
// (os turnos de sub-agents vêm dos próprios agent-*.jsonl). Compartilhada entre
// o uso por sessão (UsageParser) e o agregado do projeto (ProjectUsageService).
export function readFileUsage(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats; lastModel?: string } {
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  } catch {
    return { models: [], cache: { input: 0, read: 0, creation: 0 } };
  }

  interface Winner { model: string; usage: RawUsage; final: boolean }
  const winners = new Map<string, Winner>();
  let lineKey = 0;
  let lastModel: string | undefined;
  for (const line of lines) {
    if (!line) continue;
    let entry: TranscriptEntry;
    try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
    if (skipSidechain && entry.isSidechain) continue;
    const msg = entry.message;
    if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
    // Entradas sintéticas de erro de API não são uso real do modelo.
    if (msg.model === '<synthetic>') continue;
    lastModel = msg.model;
    const u = msg.usage;
    const key = typeof entry.requestId === 'string' ? entry.requestId
      : typeof msg.id === 'string' ? `msg:${msg.id}`
      : `line:${lineKey++}`;
    const final = msg.stop_reason != null || Array.isArray(u.iterations);
    const prev = winners.get(key);
    const replace = !prev
      || final
      || (!prev.final && num(u.output_tokens) >= num(prev.usage.output_tokens));
    if (replace) winners.set(key, { model: msg.model, usage: u, final });
  }

  const byModel = new Map<string, ModelUsage>();
  const cache: CacheStats = { input: 0, read: 0, creation: 0 };
  for (const { model, usage } of winners.values()) {
    const input = num(usage.input_tokens);
    const read = num(usage.cache_read_input_tokens);
    const creation = num(usage.cache_creation_input_tokens);
    const acc = byModel.get(model) ?? { model, input: 0, output: 0, cache: 0 };
    acc.input += input;
    acc.output += num(usage.output_tokens);
    acc.cache += creation + read;
    byModel.set(model, acc);
    cache.input += input;
    cache.read += read;
    cache.creation += creation;
  }
  return { models: [...byModel.values()], cache, lastModel };
}
```

- [ ] **Step 4: Rodar e confirmar que passam (inclusive os legados, intocados)**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS — todos, sem nenhuma mudança nos testes pré-existentes.

- [ ] **Step 5: Commit**

```bash
git add src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "fix(usage): deduplica records por request na contagem de tokens

O transcript grava um record por content block com o usage final replicado
(e as vezes so snapshots); somar linhas inflava os totais ~2x (medido).
Vencedor por requestId: final (stop_reason/iterations) > maior output.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Contexto na mesma passada, ciente de `usage.iterations` (`contextForFile` morre)

**Files:**
- Modify: `src/services/usageParser.ts` (`readFileUsage` — retorno novo `context`; `usageForSession` — usar o retorno; deletar `contextForFile`)
- Test: `tests/services/usageParser.test.ts` (casos novos no `describe('context window usage')` existente + 1 caso no describe de dedupe)

**Interfaces:**
- Consumes: `readFileUsage` da Task 1; `contextLimitFor(model, observedTokens)` e `ContextUsage { tokens, limit }` já existentes no módulo.
- Produces: `readFileUsage(filePath, skipSidechain): { models: ModelUsage[]; cache: CacheStats; lastModel?: string; context?: ContextUsage }`. `usageForSession` continua devolvendo `SessionUsage` idêntico (paridade). `ProjectUsageService` ignora o campo novo (nenhuma mudança lá).

- [ ] **Step 1: Escrever os testes que falham**

Dentro do `describe('context window usage')` existente (que usa `writeMain`/`parser`/`mainRef`), adicionar:

```ts
    it('usa a ultima iteration type:"message" quando o usage tem iterations (rollup do advisor)', () => {
      writeMain([
        {
          type: 'assistant',
          requestId: 'req_1',
          message: {
            model: 'claude-opus-4-8', role: 'assistant', stop_reason: 'end_turn',
            usage: {
              input_tokens: 4, output_tokens: 428,
              cache_creation_input_tokens: 3249, cache_read_input_tokens: 1_031_027,
              iterations: [
                { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_122, cache_creation_input_tokens: 783, output_tokens: 65 },
                { type: 'advisor_message', model: 'claude-opus-5', input_tokens: 516_328, output_tokens: 13_610 },
                { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_905, cache_creation_input_tokens: 2466, output_tokens: 363 },
              ],
            },
          },
        },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      // ultima iteration message: 2 + 515905 + 2466 = 518373 — NAO o rollup (1034280)
      expect(usage.context).toEqual({ tokens: 518_373, limit: 1_000_000 });
    });

    it('iterations vazio ou sem type:"message" cai no top-level', () => {
      writeMain([
        {
          type: 'assistant', requestId: 'r1',
          message: {
            model: 'claude-opus-4-8', role: 'assistant', stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 50, cache_creation_input_tokens: 0, iterations: [] },
          },
        },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 150, limit: 1_000_000 });
    });

    it('iterations sem nenhuma type:"message" (so advisor) tambem cai no top-level', () => {
      writeMain([
        {
          type: 'assistant', requestId: 'r1',
          message: {
            model: 'claude-opus-4-8', role: 'assistant', stop_reason: 'end_turn',
            usage: {
              input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 50, cache_creation_input_tokens: 0,
              iterations: [{ type: 'advisor_message', model: 'claude-opus-5', input_tokens: 9999, output_tokens: 10 }],
            },
          },
        },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 150, limit: 1_000_000 });
    });

    it('readFileUsage expoe o context do arquivo (mesma passada)', () => {
      writeMain([
        assistant('claude-opus-4-8', { input: 100, cacheCreate: 200, cacheRead: 50 }),
        assistant('claude-opus-4-8', { input: 1000, output: 30, cacheCreate: 2000, cacheRead: 5000 }),
      ]);
      const filePath = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), `${SID}.jsonl`);
      expect(readFileUsage(filePath, true).context).toEqual({ tokens: 8000, limit: 1_000_000 });
    });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — o caso do rollup reporta 1_034_280 (top-level) em vez de 518_373; o caso `readFileUsage.context` dá `undefined`.

- [ ] **Step 3: Implementar**

Em `src/services/usageParser.ts`:

(a) Importar o tipo (já vem de `../types`): garantir que `ContextUsage` está no import existente.

(b) Helper novo, acima de `readFileUsage`:

```ts
// O usage top-level de um record com advisor server-side soma as iterations
// (~2x o contexto real — #81620/#84738); o tamanho real do contexto é o da
// última iteration de mensagem, não a soma.
function contextTokens(u: RawUsage): number {
  if (Array.isArray(u.iterations)) {
    for (let i = u.iterations.length - 1; i >= 0; i--) {
      const it = u.iterations[i] as Record<string, unknown> | null;
      if (it && typeof it === 'object' && it['type'] === 'message') {
        return num(it['input_tokens']) + num(it['cache_read_input_tokens']) + num(it['cache_creation_input_tokens']);
      }
    }
  }
  return num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
}
```

(c) Em `readFileUsage`: tipo de retorno vira
`{ models: ModelUsage[]; cache: CacheStats; lastModel?: string; context?: ContextUsage }`;
no loop, junto de `lastModel = msg.model;` acrescentar `lastUsage = u;` (declarar
`let lastUsage: RawUsage | undefined;` ao lado de `lastModel` — atenção: a atribuição usa
`msg.usage` direto, antes da eleição do vencedor, porque o contexto segue a ÚLTIMA entrada,
não o vencedor); e antes do `return`:

```ts
  let context: ContextUsage | undefined;
  if (lastUsage !== undefined && lastModel !== undefined) {
    const tokens = contextTokens(lastUsage);
    context = { tokens, limit: contextLimitFor(lastModel, tokens) };
  }
  return { models: [...byModel.values()], cache, lastModel, context };
```

(d) Em `usageForSession`: apagar o bloco

```ts
    let context: ContextUsage | undefined;
    const hasMain = agents.some(a => a.isMain);
    if (hasMain) {
      const mainFile = transcriptPath(this.claudeDir, sessionId, cwd);
      if (mainFile) context = this.contextForFile(mainFile);
    }
```

e capturar o contexto dentro do loop existente (o `continue` de `models.length === 0`
fica DEPOIS da captura — arquivo com usage vazio produz `context` `undefined` de
qualquer forma):

```ts
    let context: ContextUsage | undefined;
    for (const agent of agents) {
      const filePath = agent.isMain
        ? transcriptPath(this.claudeDir, sessionId, cwd)
        : this.subAgentFile(sessionId, cwd, agent.agentId);
      if (!filePath) continue;

      const { models, cache, lastModel, context: fileContext } = readFileUsage(filePath, agent.isMain);
      if (agent.isMain) context = fileContext;
      if (models.length === 0) continue;
      // ... resto do corpo inalterado
```

(e) Deletar o método privado `contextForFile` inteiro.

- [ ] **Step 4: Rodar e confirmar que passam (paridade legada incluída)**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS — inclusive os 6 testes pré-existentes de `context window usage`
(paridade com o `contextForFile` morto) e os de `cache stats`.

- [ ] **Step 5: Commit**

```bash
git add src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "fix(usage): contexto le a ultima iteration message e cai a segunda leitura

Turnos com advisor somam as iterations no usage top-level (~2x o contexto
real); o indicador passa a usar a ultima iteration type:message. De quebra,
o contexto sai da mesma passada de readFileUsage e contextForFile morre
(unificacao R-perf do item 2).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Regressão do dashboard (`ProjectUsageService` herda o dedupe)

**Files:**
- Test: `tests/services/projectUsageService.test.ts` (caso novo no `describe` existente)

**Interfaces:**
- Consumes: `readFileUsage` deduplicado (Tasks 1–2); helpers `writeSession`/`service`/`NOW`/`SINCE` do próprio arquivo de teste.
- Produces: nada novo — guarda de regressão.

- [ ] **Step 1: Escrever o teste (deve passar de primeira — regressão, não TDD de feature)**

Adicionar dentro do `describe('ProjectUsageService')`:

```ts
  it('nao infla o agregado quando o transcript tem multiplos records por request', () => {
    const usageFinal = {
      input_tokens: 4, output_tokens: 428,
      cache_creation_input_tokens: 0, cache_read_input_tokens: 100,
    };
    const rec = {
      type: 'assistant',
      requestId: 'req_1',
      message: { model: 'claude-opus-4-8', role: 'assistant', stop_reason: 'end_turn', usage: usageFinal },
    };
    writeSession('multi', [rec, rec, rec], NOW - 1000);
    const usage = service.usageForProject(CWD, SINCE);
    expect(usage.byModel).toEqual([{ model: 'claude-opus-4-8', input: 4, output: 428, cache: 100 }]);
  });
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `npx vitest run tests/services/projectUsageService.test.ts`
Expected: PASS (se falhar, o dedupe da Task 1 tem furo — voltar lá antes de seguir).

- [ ] **Step 3: Commit**

```bash
git add tests/services/projectUsageService.test.ts
git commit -m "test(dashboard): agregado do projeto nao infla com records duplicados

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: CHANGELOG, ROADMAP e suíte completa

**Files:**
- Modify: `CHANGELOG.md` (seção `## [Unreleased]`)
- Modify: `docs/ROADMAP.md` (item R5 — status)

**Interfaces:**
- Consumes: Tasks 1–3 commitadas.
- Produces: docs consistentes com o código; suíte inteira verde.

- [ ] **Step 1: CHANGELOG — nota explícita da queda ~2×**

Em `CHANGELOG.md`, dentro de `## [Unreleased]`, adicionar após a seção `### Added` existente:

```markdown
### Fixed
- **Token totals were roughly doubled — they now reflect real usage.** Claude Code writes one
  transcript record per content block, repeating the request's final `usage` on each record
  (and sometimes leaving only early snapshots, see
  [#84223](https://github.com/anthropics/claude-code/issues/84223)); the parser summed every
  line, so the session table, the per-agent breakdown and the 7-day dashboard showed ~2× the
  real token counts (measured 1.97× across 40 local transcripts). Usage is now deduplicated
  per request, keeping the final record. **Numbers will visibly drop after updating — the old
  ones were inflated, no data was lost.** Cache-efficiency percentages were unaffected (both
  sides of the ratio were equally inflated).
- **Context indicator no longer doubles on server-side advisor turns.** Turns that consult
  the `advisor` roll up all sampling iterations into the top-level `usage` (~2× the real
  context, [#81620](https://github.com/anthropics/claude-code/issues/81620) /
  [#84738](https://github.com/anthropics/claude-code/issues/84738)); the context indicator
  now reads the last `type:"message"` iteration instead. The main transcript is also read
  once per refresh instead of twice (tokens and context come from the same pass).
```

- [ ] **Step 2: ROADMAP — fechar o R5**

Em `docs/ROADMAP.md`, no título do item R5, trocar

`### R5. Contabilidade de tokens — soma linha-a-linha infla ~2×; formato novo \`usage.iterations\` 📐 **prioridade**`

por

`### R5. Contabilidade de tokens — soma linha-a-linha infla ~2×; formato novo \`usage.iterations\` ✅ ENTREGUE (achados 1 e 2 · 2026-08-11)`

e acrescentar ao fim do item:

```markdown
- **✅ Entregue (2026-08-11):** achado 1 (dedupe por `requestId`, vencedor = record final) e
  achado 2 (contexto pela última iteration `type:"message"`) corrigidos, com a unificação
  R-perf junto (`contextForFile` removido — uma leitura do transcript principal por refresh).
  Achado 3 segue documentado como piso de subcontagem do dado. Spec:
  [docs/specs/2026-08-11-token-accounting-dedupe-design.md](specs/2026-08-11-token-accounting-dedupe-design.md)
  · plano: [docs/plans/2026-08-11-token-accounting-dedupe.md](plans/2026-08-11-token-accounting-dedupe.md).
```

Também atualizar a referência cruzada no item 2 (linha do "Bug novo a corrigir (varredura
2026-08-10)"): trocar "ver **R5, achado 2** (com medição local e correção proposta)" por
"corrigido — ver **R5** (✅ 2026-08-11)".

- [ ] **Step 3: Rodar a suíte completa**

Run: `npx vitest run`
Expected: PASS — nenhum teste do repo depende da soma inflada.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/ROADMAP.md
git commit -m "docs: changelog e roadmap do R5 (contabilidade de tokens)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
