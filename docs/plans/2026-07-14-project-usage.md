# Uso Agregado do Projeto ("Últimos 7 dias") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloco colapsável no painel com o uso agregado do workspace nos últimos 7 dias — N sessões, tokens por modelo e eficiência de cache — com agregação lazy e memo por arquivo.

**Architecture:** `ProjectUsageService` novo varre o diretório encodado do projeto, qualifica sessões por `mtime` e soma o uso (transcript + subagents) reusando a leitura extraída do `usageParser` (`readFileUsage`), com memoização por `(path, mtimeMs, size)`. A UI pede os dados só ao expandir, via par de mensagens novo (`projectUsage`) — o snapshot existente não muda. Spec: [docs/specs/2026-07-14-project-usage-dashboard-design.md](../specs/2026-07-14-project-usage-dashboard-design.md).

**Tech Stack:** TypeScript, Svelte 5 (runes), vitest. Sem dependências novas.

## Global Constraints

- Sem dependências novas em `package.json`.
- Comportamento por sessão do `usageParser` INALTERADO (a extração de `readFileUsage` é refactor puro; suíte existente deve seguir verde).
- Snapshot existente não muda nem engorda — o agregado viaja só no par de mensagens novo.
- Janela: `Date.now() - 7 * 24 * 3600 * 1000`, filtrada pelo `mtime` do transcript principal; subagents entram junto com a sessão qualificada.
- Regras de sidechain iguais às do uso por sessão: transcript principal com `skipSidechain: true`, `agent-*.jsonl` com `false`.
- Erro de leitura em um arquivo contribui zero e não derruba o agregado.
- Strings novas nos TRÊS idiomas (`en`, `pt-br`, `es`); CSS só via variáveis `--vscode-*`.
- Comentários em português; commits em português, conventional style.
- No Windows `npm test` pode terminar com ruído `EPERM ... kill` do teardown — conhecido, NÃO é falha; vale o `Tests N passed`.

---

### Task 1: Extrair `readFileUsage` do `usageParser` (refactor puro)

**Files:**
- Modify: `src/services/usageParser.ts`
- Test: `tests/services/usageParser.test.ts` (só adições)

**Interfaces:**
- Consumes: nada novo.
- Produces (Task 2 depende): `export function readFileUsage(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats }` exportada de `src/services/usageParser.ts`. Métodos e comportamento da classe `UsageParser` inalterados.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/services/usageParser.test.ts` (dentro do `describe('UsageParser')`, usando os helpers `assistant`/`writeMain` existentes) e ajustar o import do topo para incluir a função:

```ts
import { UsageParser, contextLimitFor, readFileUsage } from '../../src/services/usageParser';
```

```ts
  describe('readFileUsage (função exportada)', () => {
    it('reads models and cache from a file, honoring skipSidechain', () => {
      writeMain([
        assistant('claude-opus-4-8', { input: 100, output: 10, cacheCreate: 200, cacheRead: 5 }),
        { ...assistant('claude-haiku-4-5', { input: 999, output: 9 }), isSidechain: true },
      ]);
      const filePath = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), `${SID}.jsonl`);
      const withSkip = readFileUsage(filePath, true);
      expect(withSkip.models).toEqual([{ model: 'claude-opus-4-8', input: 100, output: 10, cache: 205 }]);
      expect(withSkip.cache).toEqual({ input: 100, read: 5, creation: 200 });
      const withoutSkip = readFileUsage(filePath, false);
      expect(withoutSkip.models).toHaveLength(2);
    });

    it('returns empty usage for a missing file', () => {
      expect(readFileUsage(path.join(claudeDir, 'nope.jsonl'), true))
        .toEqual({ models: [], cache: { input: 0, read: 0, creation: 0 } });
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — `readFileUsage` não é exportada.

- [ ] **Step 3: Extrair a função**

Em `src/services/usageParser.ts`, mover o CORPO do método privado `modelsAndCacheForFile` para uma função exportada no nível do módulo (colocar após a função `num`, antes da classe), e fazer o método delegar:

```ts
// Lê um transcript em uma passada e devolve o uso por modelo + o breakdown de
// cache do arquivo. No transcript principal, entradas isSidechain são puladas
// (os turnos de sub-agents vêm dos próprios agent-*.jsonl). Compartilhada entre
// o uso por sessão (UsageParser) e o agregado do projeto (ProjectUsageService).
export function readFileUsage(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats } {
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

E o método da classe vira:

```ts
  private modelsAndCacheForFile(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats } {
    return readFileUsage(filePath, skipSidechain);
  }
```

- [ ] **Step 4: Rodar e ver passar (novos + TODOS os existentes)**

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: PASS — arquivo inteiro (refactor não muda comportamento).

- [ ] **Step 5: Suíte completa + commit**

Run: `npm test` → PASS.

```bash
git add src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "refactor(usage): extrai readFileUsage para reuso pelo agregado do projeto"
```

---

### Task 2: `ProjectUsageService` — agregado com memo por arquivo

**Files:**
- Modify: `src/types.ts` (interface `ProjectUsage`)
- Create: `src/services/projectUsageService.ts`
- Test: `tests/services/projectUsageService.test.ts`

**Interfaces:**
- Consumes: `readFileUsage` (Task 1); helpers existentes `cwdCandidates` (`./transcriptPaths`) e `encodeCwdToProjectDir` (`./projectDir`); tipos `ModelUsage`, `CacheStats`.
- Produces (Tasks 3/4 dependem): em `src/types.ts`,
  `export interface ProjectUsage { sessions: number; byModel: ModelUsage[]; cache?: CacheStats }`;
  em `src/services/projectUsageService.ts`,
  `export class ProjectUsageService { constructor(claudeDir: string); usageForProject(cwd: string, sinceMs: number): ProjectUsage }`.

- [ ] **Step 1: Adicionar o tipo em `src/types.ts`**

Após a interface `SessionUsage`:

```ts
export interface ProjectUsage {
  sessions: number;        // sessões com atividade (mtime) na janela
  byModel: ModelUsage[];   // totais agregados por modelo
  cache?: CacheStats;      // agregado read/creation/input; undefined se zero
}
```

- [ ] **Step 2: Escrever os testes que falham**

```ts
// tests/services/projectUsageService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectUsageService } from '../../src/services/projectUsageService';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

describe('ProjectUsageService', () => {
  let claudeDir: string;
  let service: ProjectUsageService;
  const CWD = '/home/user/proj';
  const NOW = Date.now();
  const SINCE = NOW - 7 * 24 * 3600 * 1000;

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-usage-test-'));
    service = new ProjectUsageService(claudeDir);
  });
  afterEach(() => {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  function assistant(model: string, u: Partial<{ input: number; output: number; cacheCreate: number; cacheRead: number }>, sidechain = false): object {
    return {
      type: 'assistant',
      ...(sidechain ? { isSidechain: true } : {}),
      message: {
        model,
        role: 'assistant',
        usage: {
          input_tokens: u.input ?? 0,
          output_tokens: u.output ?? 0,
          cache_creation_input_tokens: u.cacheCreate ?? 0,
          cache_read_input_tokens: u.cacheRead ?? 0,
        },
      },
    };
  }

  function projDir(): string {
    return path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
  }

  function writeSession(sessionId: string, lines: object[], mtimeMs: number): string {
    fs.mkdirSync(projDir(), { recursive: true });
    const p = path.join(projDir(), `${sessionId}.jsonl`);
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
    fs.utimesSync(p, new Date(mtimeMs), new Date(mtimeMs));
    return p;
  }

  function writeSubAgent(sessionId: string, agentId: string, lines: object[]): void {
    const dir = path.join(projDir(), sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `agent-${agentId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n'));
  }

  it('returns zeroed usage when the project dir does not exist', () => {
    expect(service.usageForProject(CWD, SINCE)).toEqual({ sessions: 0, byModel: [] });
  });

  it('aggregates sessions inside the window and ignores older ones', () => {
    writeSession('recent', [assistant('claude-opus-4-8', { input: 100, output: 10 })], NOW - 1000);
    writeSession('old', [assistant('claude-opus-4-8', { input: 999, output: 99 })], SINCE - 24 * 3600 * 1000);
    const usage = service.usageForProject(CWD, SINCE);
    expect(usage.sessions).toBe(1);
    expect(usage.byModel).toEqual([{ model: 'claude-opus-4-8', input: 100, output: 10, cache: 0 }]);
  });

  it('sums sub-agent files of a qualifying session (sidechain rules)', () => {
    writeSession('s1', [
      assistant('claude-opus-4-8', { input: 100, output: 10 }),
      assistant('claude-haiku-4-5', { input: 555, output: 5 }, true), // sidechain no main: ignorada
    ], NOW - 1000);
    writeSubAgent('s1', 'a1', [assistant('claude-haiku-4-5', { input: 30, output: 3, cacheRead: 70 }, true)]);
    const usage = service.usageForProject(CWD, SINCE);
    expect(usage.sessions).toBe(1);
    expect(usage.byModel).toEqual([
      { model: 'claude-opus-4-8', input: 100, output: 10, cache: 0 },
      { model: 'claude-haiku-4-5', input: 30, output: 3, cache: 70 },
    ]);
    expect(usage.cache).toEqual({ input: 130, read: 70, creation: 0 });
  });

  it('a corrupted transcript contributes zero without breaking the aggregate', () => {
    fs.mkdirSync(projDir(), { recursive: true });
    const bad = path.join(projDir(), 'bad.jsonl');
    fs.writeFileSync(bad, 'not json at all\n{broken');
    fs.utimesSync(bad, new Date(NOW - 1000), new Date(NOW - 1000));
    writeSession('good', [assistant('claude-opus-4-8', { input: 10, output: 1 })], NOW - 1000);
    const usage = service.usageForProject(CWD, SINCE);
    expect(usage.sessions).toBe(2); // qualifica por mtime, mesmo sem usage
    expect(usage.byModel).toEqual([{ model: 'claude-opus-4-8', input: 10, output: 1, cache: 0 }]);
  });

  it('memo: same (mtime, size) is NOT re-read; changed mtime is', () => {
    const p = writeSession('s1', [assistant('claude-opus-4-8', { input: 100, output: 10 })], NOW - 5000);
    const stat = fs.statSync(p);
    expect(service.usageForProject(CWD, SINCE).byModel[0].input).toBe(100);

    // Conteúdo diferente com o MESMO tamanho em bytes e mesmo mtime → memo hit
    // (retorna o valor antigo, provando que não releu o arquivo).
    const original = fs.readFileSync(p, 'utf-8');
    const tweaked = original.replace('"input_tokens":100', '"input_tokens":900');
    expect(tweaked.length).toBe(original.length);
    fs.writeFileSync(p, tweaked);
    fs.utimesSync(p, new Date(stat.mtimeMs), new Date(stat.mtimeMs));
    expect(service.usageForProject(CWD, SINCE).byModel[0].input).toBe(100);

    // mtime novo → invalida e relê
    fs.utimesSync(p, new Date(NOW - 1000), new Date(NOW - 1000));
    expect(service.usageForProject(CWD, SINCE).byModel[0].input).toBe(900);
  });

  it('repeated aggregation does not double-count (memo values are not mutated)', () => {
    writeSession('s1', [assistant('claude-opus-4-8', { input: 100, output: 10, cacheRead: 40 })], NOW - 1000);
    const first = service.usageForProject(CWD, SINCE);
    const second = service.usageForProject(CWD, SINCE);
    expect(second).toEqual(first);
    expect(second.byModel).toEqual([{ model: 'claude-opus-4-8', input: 100, output: 10, cache: 40 }]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/services/projectUsageService.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar**

```ts
// src/services/projectUsageService.ts
import * as fs from 'fs';
import * as path from 'path';
import { cwdCandidates } from './transcriptPaths';
import { encodeCwdToProjectDir } from './projectDir';
import { readFileUsage } from './usageParser';
import type { CacheStats, ModelUsage, ProjectUsage } from '../types';

interface FileMemo {
  mtimeMs: number;
  size: number;
  models: ModelUsage[];
  cache: CacheStats;
}

// Agrega o uso de todas as sessões do projeto com atividade na janela.
// Lazy por natureza (só é chamado quando o bloco expande) e com memoização por
// arquivo — cada transcript só é relido quando (mtime, size) muda; na prática,
// só a sessão ativa paga leitura em expansões repetidas.
export class ProjectUsageService {
  private readonly memo = new Map<string, FileMemo>();

  constructor(private readonly claudeDir: string) {}

  usageForProject(cwd: string, sinceMs: number): ProjectUsage {
    const dir = this.projectDir(cwd);
    if (!dir) return { sessions: 0, byModel: [] };

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch {
      return { sessions: 0, byModel: [] };
    }

    const seen = new Set<string>();
    const byModel = new Map<string, ModelUsage>();
    const cache: CacheStats = { input: 0, read: 0, creation: 0 };
    let sessions = 0;

    // Soma um arquivo no acumulador. Os objetos do memo nunca são mutados —
    // os acumuladores são sempre instâncias novas deste scan.
    const addFile = (filePath: string, skipSidechain: boolean): void => {
      const usage = this.readCached(filePath, skipSidechain);
      if (!usage) return;
      seen.add(filePath);
      for (const m of usage.models) {
        const acc = byModel.get(m.model) ?? { model: m.model, input: 0, output: 0, cache: 0 };
        acc.input += m.input;
        acc.output += m.output;
        acc.cache += m.cache;
        byModel.set(m.model, acc);
      }
      cache.input += usage.cache.input;
      cache.read += usage.cache.read;
      cache.creation += usage.cache.creation;
    };

    for (const file of files) {
      const mainPath = path.join(dir, file);
      let stat: fs.Stats;
      try { stat = fs.statSync(mainPath); } catch { continue; }
      if (stat.mtimeMs < sinceMs) continue;
      // Sessão qualifica por atividade (mtime), mesmo que ainda não tenha usage.
      sessions++;
      addFile(mainPath, true);

      const sessionId = file.slice(0, -'.jsonl'.length);
      const subDir = path.join(dir, sessionId, 'subagents');
      let subFiles: string[] = [];
      try {
        subFiles = fs.readdirSync(subDir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
      } catch { /* sessão sem subagents */ }
      for (const sub of subFiles) addFile(path.join(subDir, sub), false);
    }

    // Poda: arquivos fora da janela ou removidos saem do memo (se voltarem a
    // mudar, o mtime novo os traz de volta e eles são relidos de qualquer jeito).
    for (const key of this.memo.keys()) {
      if (!seen.has(key)) this.memo.delete(key);
    }

    const total = cache.input + cache.read + cache.creation;
    return {
      sessions,
      byModel: [...byModel.values()],
      ...(total > 0 ? { cache } : {}),
    };
  }

  private readCached(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats } | null {
    let stat: fs.Stats;
    try { stat = fs.statSync(filePath); } catch { return null; }
    const hit = this.memo.get(filePath);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return { models: hit.models, cache: hit.cache };
    }
    const usage = readFileUsage(filePath, skipSidechain);
    this.memo.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, ...usage });
    return usage;
  }

  private projectDir(cwd: string): string | null {
    for (const candidate of cwdCandidates(cwd)) {
      const d = path.join(this.claudeDir, 'projects', encodeCwdToProjectDir(candidate));
      if (fs.existsSync(d)) return d;
    }
    return null;
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/services/projectUsageService.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Suíte completa + commit**

Run: `npm test` → PASS.

```bash
git add src/types.ts src/services/projectUsageService.ts tests/services/projectUsageService.test.ts
git commit -m "feat(usage): ProjectUsageService — agregado de 7 dias com memo por arquivo"
```

---

### Task 3: Protocolo `projectUsage` — extension, providers e store

**Files:**
- Modify: `src/types.ts` (uniões de mensagens)
- Modify: `src/providers/todosViewProvider.ts`
- Modify: `src/providers/todosPanelProvider.ts`
- Modify: `src/extension.ts`
- Modify: `src/webview/stores.svelte.ts`

**Interfaces:**
- Consumes: `ProjectUsageService`/`ProjectUsage` (Task 2).
- Produces (Task 4 depende): `todosStore.projectUsage: ProjectUsage | null | undefined` (undefined = nunca carregado), `todosStore.projectUsageLoading: boolean`, `todosStore.requestProjectUsage(): void`.

- [ ] **Step 1: Mensagens em `src/types.ts`**

Importar o tipo não é preciso (mesmo arquivo). Em `ExtensionMessage`, adicionar a variante:

```ts
  | { type: 'projectUsage'; usage: ProjectUsage | null }
```

Em `WebviewMessage`:

```ts
  | { type: 'projectUsage' }
```

- [ ] **Step 2: `pushProjectUsage` nos dois providers**

Em `src/providers/todosViewProvider.ts`, adicionar o import do tipo e o método após `pushLocale`:

```ts
import type { ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
```

```ts
  pushProjectUsage(usage: ProjectUsage | null): void {
    if (!this.view) return;
    const msg: ExtensionMessage = { type: 'projectUsage', usage };
    this.view.webview.postMessage(msg);
  }
```

Em `src/providers/todosPanelProvider.ts`, o mesmo, trocando `this.view` por `this.panel`:

```ts
import type { ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
```

```ts
  pushProjectUsage(usage: ProjectUsage | null): void {
    if (!this.panel) return;
    const msg: ExtensionMessage = { type: 'projectUsage', usage };
    this.panel.webview.postMessage(msg);
  }
```

- [ ] **Step 3: Handler no `src/extension.ts`**

Imports novos:

```ts
import { ProjectUsageService } from './services/projectUsageService';
```

Constante no nível do módulo (junto de `HOOK_EVENTS`):

```ts
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
```

Em `activate`, após `const usageParser = new UsageParser(claudeDir);`:

```ts
  const projectUsageService = new ProjectUsageService(claudeDir);
```

Em `handleMessage`, novo ramo antes do `pickSession`:

```ts
    } else if (msg.type === 'projectUsage') {
      const folders = vscode.workspace.workspaceFolders;
      const cwd = folders?.[0]?.uri.fsPath ?? null;
      const usage = cwd ? projectUsageService.usageForProject(cwd, Date.now() - SEVEN_DAYS_MS) : null;
      viewProvider.pushProjectUsage(usage);
      panelProvider.pushProjectUsage(usage);
```

- [ ] **Step 4: Store no webview (`src/webview/stores.svelte.ts`)**

Importar o tipo:

```ts
import type { SessionSnapshot, ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
```

Estados novos na classe (junto de `snapshot`):

```ts
  projectUsage = $state<ProjectUsage | null | undefined>(undefined);
  projectUsageLoading = $state(false);
```

Novo case no `handle`:

```ts
      case 'projectUsage':
        this.projectUsage = msg.usage;
        this.projectUsageLoading = false;
        break;
```

Método novo (junto de `refresh`):

```ts
  requestProjectUsage(): void {
    this.projectUsageLoading = true;
    this.post({ type: 'projectUsage' });
  }
```

- [ ] **Step 5: Verificar e commitar**

Run: `npx tsc --noEmit` → sem erros. Run: `npm test` → PASS. Run: `npm run build` → 3 alvos ok.

```bash
git add src/types.ts src/providers/todosViewProvider.ts src/providers/todosPanelProvider.ts src/extension.ts src/webview/stores.svelte.ts
git commit -m "feat(usage): protocolo projectUsage — pedido lazy do webview e resposta aos dois providers"
```

---

### Task 4: `ProjectUsageSection` — UI, i18n e roadmap

**Files:**
- Create: `src/webview/lib/ProjectUsageSection.svelte`
- Modify: `src/webview/App.svelte`
- Modify: `src/i18n/messages.ts` (4 chaves × 3 idiomas)
- Modify: `docs/ROADMAP.md` (item 16)

**Interfaces:**
- Consumes: `todosStore.projectUsage`/`projectUsageLoading`/`requestProjectUsage()` (Task 3); `formatCompact`, `shortModel`, `cacheLevel` de `../format`; `Icon` existente.
- Produces: bloco visível no painel.

- [ ] **Step 1: Chaves i18n em `src/i18n/messages.ts`**

Em `en`, após `'notify.disable'`:

```ts
    'project.title': 'Last 7 days · this project',
    'project.sessions': '{n} sessions',
    'project.loading': 'Aggregating usage…',
    'project.empty': 'No activity in the last 7 days',
```

Em `pt-br`, mesma posição:

```ts
    'project.title': 'Últimos 7 dias · este projeto',
    'project.sessions': '{n} sessões',
    'project.loading': 'Agregando uso…',
    'project.empty': 'Sem atividade nos últimos 7 dias',
```

Em `es`, mesma posição:

```ts
    'project.title': 'Últimos 7 días · este proyecto',
    'project.sessions': '{n} sesiones',
    'project.loading': 'Agregando uso…',
    'project.empty': 'Sin actividad en los últimos 7 días',
```

Run: `npx vitest run tests/i18n/messages.test.ts` → PASS.

- [ ] **Step 2: Criar `src/webview/lib/ProjectUsageSection.svelte`**

```svelte
<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { ModelUsage } from '../../types';
  import { formatCompact, shortModel, cacheLevel } from '../format';
  import { todosStore } from '../stores.svelte';
  import Icon from './Icon.svelte';

  let expanded = $state(false);

  // Lazy por design: a agregação só roda quando o usuário expande; expandir de
  // novo re-pede (dados frescos — o memo do serviço torna isso barato).
  function toggle(): void {
    expanded = !expanded;
    if (expanded) todosStore.requestProjectUsage();
  }

  let usage = $derived(todosStore.projectUsage);
  let loading = $derived(todosStore.projectUsageLoading);

  let cache = $derived(usage?.cache);
  let cacheTotal = $derived(cache ? cache.input + cache.read + cache.creation : 0);
  let cacheRate = $derived(cache && cacheTotal > 0 ? cache.read / cacheTotal : 0);
  let cacheLvl = $derived(cacheLevel(cacheRate));
  function pctOf(part: number): number {
    return cacheTotal > 0 ? Math.round((part / cacheTotal) * 100) : 0;
  }

  function total(rows: ModelUsage[]): ModelUsage {
    return rows.reduce(
      (acc, r) => ({ model: '', input: acc.input + r.input, output: acc.output + r.output, cache: acc.cache + r.cache }),
      { model: '', input: 0, output: 0, cache: 0 },
    );
  }
  let modelTotal = $derived(usage ? total(usage.byModel) : { model: '', input: 0, output: 0, cache: 0 });
</script>

<section class="project">
  <button class="header" onclick={toggle} aria-expanded={expanded}>
    <span class="chevron" class:open={expanded}><Icon name="chevron" size={12} /></span>
    <span class="title">{todosStore.t('project.title')}</span>
    {#if expanded && usage && usage.sessions > 0}
      <span class="count">{todosStore.t('project.sessions', { n: usage.sessions })}</span>
    {/if}
  </button>

  {#if expanded}
    <div class="body" transition:slide={{ duration: 180 }}>
      {#if loading && usage === undefined}
        <p class="note">{todosStore.t('project.loading')}</p>
      {:else if !usage || usage.sessions === 0}
        <p class="note">{todosStore.t('project.empty')}</p>
      {:else}
        {#if cache && cacheTotal > 0}
          <div class="cache-head">
            <span class="cache-label">{todosStore.t('usage.cache')}</span>
            <span class="cache-badge {cacheLvl}">{todosStore.t('usage.cacheReuse', { pct: Math.round(cacheRate * 100) })}</span>
          </div>
          <div class="cache-stack" aria-hidden="true">
            <div class="seg read" style="width: {pctOf(cache.read)}%"></div>
            <div class="seg create" style="width: {pctOf(cache.creation)}%"></div>
            <div class="seg new" style="width: {pctOf(cache.input)}%"></div>
          </div>
        {/if}
        <table>
          <thead>
            <tr>
              <th class="name">{todosStore.t('usage.colModel')}</th>
              <th>{todosStore.t('usage.colInput')}</th>
              <th>{todosStore.t('usage.colOutput')}</th>
              <th>{todosStore.t('usage.cache')}</th>
            </tr>
          </thead>
          <tbody>
            {#each usage.byModel as m (m.model)}
              <tr>
                <td class="name" title={m.model}>{shortModel(m.model)}</td>
                <td title={String(m.input)}>{formatCompact(m.input)}</td>
                <td title={String(m.output)}>{formatCompact(m.output)}</td>
                <td title={String(m.cache)}>{formatCompact(m.cache)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td class="name">{todosStore.t('usage.total')}</td>
              <td title={String(modelTotal.input)}>{formatCompact(modelTotal.input)}</td>
              <td title={String(modelTotal.output)}>{formatCompact(modelTotal.output)}</td>
              <td title={String(modelTotal.cache)}>{formatCompact(modelTotal.cache)}</td>
            </tr>
          </tfoot>
        </table>
      {/if}
    </div>
  {/if}
</section>

<style>
  .project {
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius);
    margin: 0 var(--sp-1) var(--sp-2);
    font-size: 0.85em;
  }
  .header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    padding: 0.4rem var(--sp-2);
    cursor: pointer;
    text-align: left;
  }
  .header:hover { background: var(--vscode-list-hoverBackground); }
  .chevron {
    display: inline-flex;
    align-items: center;
    transition: transform 150ms ease;
    opacity: 0.65;
  }
  .chevron.open { transform: rotate(90deg); }
  .title {
    flex: 1;
    text-transform: uppercase;
    font-size: 0.8em;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
  }
  .count {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    font-variant-numeric: tabular-nums;
  }
  .body { padding: 0 var(--sp-2) 0.4rem; }
  .note {
    padding: 0.2rem 0 0.3rem;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 0.15rem 0.3rem; white-space: nowrap; }
  th.name, td.name { text-align: left; }
  thead th {
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  tfoot td {
    border-top: 1px solid var(--vscode-panel-border);
    font-weight: 600;
  }
  .cache-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0.1rem 0 0.2rem;
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
    margin-bottom: 0.35rem;
  }
  .cache-stack .seg { height: 100%; }
  .cache-stack .seg.read { background: var(--vscode-charts-green); }
  .cache-stack .seg.create { background: var(--vscode-charts-blue); }
  .cache-stack .seg.new { background: var(--vscode-descriptionForeground); }
</style>
```

- [ ] **Step 3: Incluir no `src/webview/App.svelte`**

Import novo:

```ts
  import ProjectUsageSection from './lib/ProjectUsageSection.svelte';
```

No markup, logo APÓS o bloco `{#if snapshot.usage}<UsageTable usage={snapshot.usage} />{/if}`:

```svelte
    <ProjectUsageSection />
```

- [ ] **Step 4: Verificar**

Run: `npx svelte-check` → 0 errors (warnings pré-existentes ok).
Run: `npm test` → PASS. Run: `npm run build` → 3 alvos ok.

- [ ] **Step 5: Verificação visual**

Usar a skill `preview-webview`: bloco colapsado por padrão sob a UsageTable; expandido mostrando contadores/tabela/cache; estado vazio. Se a skill não estiver disponível no contexto do executor, marcar "pendente para o controller" no report — não improvisar.

- [ ] **Step 6: Roadmap**

Em `docs/ROADMAP.md`, item 16, trocar o heading por:

```
### 16. Dashboard de uso/custo agregado (projeto/semana) 🚧 implementado — aguardando release 0.11.0
```

E acrescentar como último bullet do item:

```
- **Status (2026-07):** implementado — spec: [docs/specs/2026-07-14-project-usage-dashboard-design.md](specs/2026-07-14-project-usage-dashboard-design.md) · plano: [docs/plans/2026-07-14-project-usage.md](plans/2026-07-14-project-usage.md). Bloco "Últimos 7 dias · este projeto" colapsável no painel (N sessões, tokens por modelo, cache agregado), agregação lazy com memo por arquivo, protocolo dedicado sem tocar o snapshot. Falta: release 0.11.0.
```

- [ ] **Step 7: Commit**

```bash
git add src/webview/lib/ProjectUsageSection.svelte src/webview/App.svelte src/i18n/messages.ts docs/ROADMAP.md
git commit -m "feat(panel): bloco Últimos 7 dias — uso agregado do projeto (lazy, i18n)"
```
