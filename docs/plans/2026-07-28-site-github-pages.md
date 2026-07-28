# Site no GitHub Pages com demo interativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar um site estático que roda o painel real da extensão no browser, alimentado por fixtures gravadas pelo parser de produção, para que qualquer pessoa explore as funcionalidades sem instalar nada.

**Architecture:** Um projeto Astro em `site/`, isolado do build da extensão (package.json próprio), que importa `src/webview/App.svelte` como island Svelte. O painel se comunica com o site pelo mesmo `WebviewBridge` que usa no VS Code e no JetBrains — o site apenas injeta uma terceira implementação em `window.__claudeTodosDemo`. Os dados vêm de roteiros JSON gerados offline por um script que roda o `SnapshotService` real sobre transcripts truncados progressivamente.

**Tech Stack:** Astro 5 + `@astrojs/svelte`, Svelte 5 (mesma versão do produto), vitest (testes na raiz), GitHub Pages via Actions.

**Spec:** [docs/specs/2026-07-28-site-github-pages-design.md](../specs/2026-07-28-site-github-pages-design.md)

## Global Constraints

- **Node 20+.** É o que o CI usa (`.github/workflows/ci.yml`, `node-version: '20'`).
- **Os hosts reais não podem mudar de comportamento.** VS Code e JetBrains devem continuar resolvendo exatamente o mesmo bridge de hoje. `window.__claudeTodosDemo` nunca existe neles.
- **`site/` tem package.json próprio.** As dependências do Astro não entram no `npm ci` da extensão nem no build do plugin JetBrains.
- **Base path:** `/claude-todos-vscode` — o site é publicado em `https://carlosdealmeida.github.io/claude-todos-vscode/`.
- **Nunca hex fixo dentro de `src/webview/`.** Os componentes derivam tudo de variáveis do tema (regra vigente em `src/webview/app.css`). O site define as variáveis; não altera os componentes.
- **Locale suportado:** `'en' | 'pt-br' | 'es' | 'zh-cn' | 'zh-tw'` (`src/i18n/locale.ts`). Nas rotas do site, `pt-br` aparece como `/pt/`.
- **Testes:** vitest, `tests/**/*.test.ts`, `environment: 'node'`, estilo `describe`/`it`/`expect` com `vi.fn()` (ver `tests/webview/bridge.test.ts`).
- **Commits:** prefixo convencional com escopo — `feat(site):`, `test(site):`, `chore(ci):`.

---

## Fatia 1 — Infra

### Task 1: Esqueleto Astro que compila e serve uma página

**Files:**
- Create: `site/package.json`
- Create: `site/astro.config.mjs`
- Create: `site/tsconfig.json`
- Create: `site/src/pages/index.astro`
- Create: `site/.gitignore`
- Modify: `.vscodeignore` (adicionar `site/**`)

**Interfaces:**
- Consumes: nada.
- Produces: um build estático em `site/dist/` gerado por `npm run build` executado dentro de `site/`.

- [ ] **Step 1: Criar o package.json do site**

`site/package.json`:

```json
{
  "name": "claude-todos-site",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "devDependencies": {
    "@astrojs/svelte": "^7.0.0",
    "astro": "^5.0.0",
    "svelte": "^5.55.9",
    "typescript": "^5.9.3"
  }
}
```

A versão do Svelte é fixada igual à da raiz (`^5.55.9`) de propósito: o site compila componentes do produto, e duas versões diferentes de Svelte no mesmo bundle produzem erros de runtime difíceis de diagnosticar.

- [ ] **Step 2: Criar a config do Astro**

`site/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://carlosdealmeida.github.io',
  base: '/claude-todos-vscode',
  integrations: [svelte()],
  vite: {
    server: {
      // O site importa componentes de ../src/webview, fora da raiz do Astro.
      fs: { allow: ['..'] },
    },
  },
});
```

- [ ] **Step 3: Criar o tsconfig do site**

`site/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*", "../src/webview/**/*", "../src/types.ts", "../src/i18n/**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4: Criar a página inicial provisória**

`site/src/pages/index.astro`:

```astro
---
const base = import.meta.env.BASE_URL;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Todos — observability for your Claude Code agents</title>
  </head>
  <body>
    <main>
      <h1>Claude Todos</h1>
      <p>Observability for your Claude Code agents.</p>
      <p><a href={`${base}/`}>base path ok</a></p>
    </main>
  </body>
</html>
```

- [ ] **Step 5: Ignorar artefatos do site**

`site/.gitignore`:

```
dist/
node_modules/
.astro/
```

- [ ] **Step 6: Manter o site fora do pacote da extensão**

Adicionar ao final de `.vscodeignore`:

```
site/**
```

- [ ] **Step 7: Instalar e verificar que compila**

Run: `cd site && npm install && npm run build`
Expected: build conclui sem erro e cria `site/dist/index.html`.

Verificar que o base path foi aplicado:

Run: `grep -o '/claude-todos-vscode/' site/dist/index.html`
Expected: pelo menos uma ocorrência.

- [ ] **Step 8: Verificar que o build da extensão segue intacto**

Run (na raiz): `npm run build && npm test`
Expected: ambos passam, sem nenhuma mudança de comportamento.

- [ ] **Step 9: Commit**

```bash
git add site/ .vscodeignore
git commit -m "feat(site): esqueleto Astro com base path do GitHub Pages"
```

---

### Task 2: Deploy automático no GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `site/dist/` produzido pela Task 1.
- Produces: site publicado em `https://carlosdealmeida.github.io/claude-todos-vscode/` a cada push em `master`.

- [ ] **Step 1: Criar o workflow**

`.github/workflows/pages.yml`:

```yaml
name: Deploy site

on:
  push:
    branches: [master]
    paths:
      - 'site/**'
      - 'src/webview/**'
      - 'README*.md'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

# O deploy do Pages precisa escrever no ambiente github-pages; nada alem disso.
permissions:
  contents: read
  pages: write
  id-token: write

# Um deploy por vez; nao cancela um em andamento para nao publicar pela metade.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # Duas arvores de dependencia: a raiz fornece os componentes do webview,
      # site/ fornece o Astro.
      - run: npm ci
      - run: npm ci
        working-directory: site

      - run: npm run build
        working-directory: site

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Habilitar o Pages no repositório**

No GitHub: **Settings → Pages → Build and deployment → Source = GitHub Actions**. Sem esse passo o job `deploy` falha com `Error: Not Found`.

- [ ] **Step 3: Commit e verificar o deploy**

```bash
git add .github/workflows/pages.yml
git commit -m "chore(ci): publica o site no GitHub Pages a cada push"
git push
```

Run: `gh run watch`
Expected: os dois jobs verdes, e `https://carlosdealmeida.github.io/claude-todos-vscode/` servindo a página da Task 1.

---

## Fatia 2 — Demo

### Task 3: Terceiro caminho no `createBridge()`

Sem isto o painel nem carrega no browser: `createBridge()` cai no JCEF, e o `TodosStore` posta `ready` no construtor contra um `window.__jcefPost` inexistente.

**Files:**
- Modify: `src/webview/bridge.ts:44-46`
- Test: `tests/webview/bridge.test.ts`

**Interfaces:**
- Consumes: `WebviewBridge` (já existe em `src/webview/bridge.ts`).
- Produces: `createBridge(win?: Window): WebviewBridge` — retorna `win.__claudeTodosDemo` quando presente. O tipo `DemoWindow` é exportado para o site.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/webview/bridge.test.ts`:

```ts
import { createVscodeBridge, createJcefBridge, createBridge } from '../../src/webview/bridge';

describe('createBridge', () => {
  it('prefers window.__claudeTodosDemo when present', () => {
    const demo = { post: vi.fn(), onMessage: vi.fn() };
    const win = { __claudeTodosDemo: demo, __jcefPost: vi.fn(), addEventListener: vi.fn() };
    expect(createBridge(win as any)).toBe(demo);
  });

  it('falls back to the JCEF bridge when there is no demo and no vscode api', () => {
    const __jcefPost = vi.fn();
    const win = { __jcefPost, addEventListener: vi.fn() };
    const bridge = createBridge(win as any);
    bridge.post({ type: 'ready' });
    expect(__jcefPost).toHaveBeenCalledWith(JSON.stringify({ type: 'ready' }));
  });
});
```

Nota: a linha de `import` acima substitui a que já existe no topo do arquivo — não duplicar.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/webview/bridge.test.ts`
Expected: FAIL — `createBridge` hoje não aceita argumento, então o primeiro caso recebe o bridge JCEF em vez de `demo`.

- [ ] **Step 3: Implementar**

Substituir o final de `src/webview/bridge.ts` (linhas 44-46):

```ts
// Host demo (site publico): a pagina injeta uma implementacao completa em
// `window.__claudeTodosDemo` antes de montar o App. A variavel nunca existe no
// VS Code nem no JCEF, entao os dois hosts reais seguem inalterados.
export interface DemoWindow {
  __claudeTodosDemo?: WebviewBridge;
}

export function createBridge(win: Window = window): WebviewBridge {
  const demo = (win as unknown as DemoWindow).__claudeTodosDemo;
  if (demo) return demo;
  return typeof acquireVsCodeApi !== 'undefined'
    ? createVscodeBridge(win)
    : createJcefBridge(win as unknown as JcefWindow);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/webview/bridge.test.ts`
Expected: PASS, incluindo os quatro testes que já existiam.

- [ ] **Step 5: Verificar tipos**

Run: `npm run typecheck && npm run check:svelte`
Expected: ambos limpos.

- [ ] **Step 6: Commit**

```bash
git add src/webview/bridge.ts tests/webview/bridge.test.ts
git commit -m "feat(webview): terceiro caminho no createBridge para o site de demo"
```

---

### Task 4: Tema simulado do VS Code, dark e light

**Files:**
- Create: `site/src/demo/theme.css`

**Interfaces:**
- Consumes: nada.
- Produces: as 20 variáveis `--vscode-*` que os componentes exigem, sob `:root` (dark) e `:root[data-theme="light"]`.

A lista é exaustiva: são exatamente as 20 usadas em `src/webview/`. Faltando qualquer uma, o componente correspondente renderiza sem cor.

- [ ] **Step 1: Criar a folha de tema**

`site/src/demo/theme.css`:

```css
/* Simula as variaveis que o VS Code injeta na webview. Valores do tema Dark+
   e do Light+ padrao. A lista cobre as 20 vars usadas em src/webview/ — uma
   var faltando renderiza o componente correspondente sem cor. */
:root {
  --vscode-font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
  --vscode-font-size: 13px;
  --vscode-editor-font-family: "Cascadia Mono", Consolas, "Courier New", monospace;

  --vscode-foreground: #cccccc;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-errorForeground: #f14c4c;
  --vscode-focusBorder: #007fd4;
  --vscode-panel-border: #3c3c3c;
  --vscode-list-hoverBackground: #2a2d2e;
  --vscode-sideBarSectionHeader-background: #2a2a2a;
  --vscode-textBlockQuote-background: #222222;
  --vscode-badge-background: #4d4d4d;
  --vscode-badge-foreground: #ffffff;
  --vscode-progressBar-background: #0e70c0;
  --vscode-testing-iconPassed: #73c991;

  --vscode-charts-blue: #4daafc;
  --vscode-charts-green: #89d185;
  --vscode-charts-yellow: #e6c07b;
  --vscode-charts-orange: #d18616;
  --vscode-charts-red: #f14c4c;

  --demo-editor-background: #1e1e1e;
}

:root[data-theme="light"] {
  --vscode-foreground: #3b3b3b;
  --vscode-descriptionForeground: #6a6a6a;
  --vscode-errorForeground: #e51400;
  --vscode-focusBorder: #005fb8;
  --vscode-panel-border: #e5e5e5;
  --vscode-list-hoverBackground: #f0f0f0;
  --vscode-sideBarSectionHeader-background: #eeeeee;
  --vscode-textBlockQuote-background: #f5f5f5;
  --vscode-badge-background: #cccccc;
  --vscode-badge-foreground: #3b3b3b;
  --vscode-progressBar-background: #005fb8;
  --vscode-testing-iconPassed: #257e25;

  --vscode-charts-blue: #1a85ff;
  --vscode-charts-green: #388a34;
  --vscode-charts-yellow: #b89500;
  --vscode-charts-orange: #d18616;
  --vscode-charts-red: #e51400;

  --demo-editor-background: #ffffff;
}
```

- [ ] **Step 2: Conferir que nenhuma variável ficou de fora**

Run (na raiz):

```bash
diff <(grep -rho '\-\-vscode-[a-zA-Z0-9-]*' src/webview/ | sort -u) \
     <(grep -o '^\s*--vscode-[a-zA-Z0-9-]*' site/src/demo/theme.css | tr -d ' ' | sort -u)
```

Expected: nenhuma saída (os dois conjuntos são idênticos).

- [ ] **Step 3: Commit**

```bash
git add site/src/demo/theme.css
git commit -m "feat(site): tema simulado do VS Code em dark e light"
```

---

### Task 5: `reanchor` — deslocar os timestamps de um snapshot

Sem isto, uma fixture gravada hoje exibe "task em andamento há 47 dias" daqui a dois meses, porque `src/webview/clock.svelte.ts` compara contra `Date.now()` real.

**Files:**
- Create: `site/src/demo/reanchor.ts`
- Test: `tests/site/reanchor.test.ts`

**Interfaces:**
- Consumes: `SessionSnapshot`, `AgentTodos`, `Todo` de `src/types.ts`.
- Produces: `reanchor(snapshot: SessionSnapshot, deltaMs: number): SessionSnapshot` — cópia com `Todo.startedAt`, `Todo.completedAt`, `AgentTodos.updatedAt` e `AgentTodos.todosUpdatedAt` deslocados. Campos ausentes continuam ausentes. Não muta a entrada.

- [ ] **Step 1: Escrever o teste que falha**

`tests/site/reanchor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reanchor } from '../../site/src/demo/reanchor';
import type { SessionSnapshot } from '../../src/types';

function snap(): SessionSnapshot {
  return {
    sessionId: 's1',
    cwd: '/repo',
    title: 'demo',
    pinned: false,
    agents: [{
      sessionId: 's1',
      agentId: 's1',
      name: 'Main agent',
      isMain: true,
      updatedAt: 1000,
      todosUpdatedAt: 900,
      todos: [
        { content: 'a', status: 'completed', activeForm: 'Fazendo a', startedAt: 100, completedAt: 500 },
        { content: 'b', status: 'in_progress', activeForm: 'Fazendo b', startedAt: 600 },
        { content: 'c', status: 'pending', activeForm: 'Fazendo c' },
      ],
    }],
  };
}

describe('reanchor', () => {
  it('shifts every timestamp by delta', () => {
    const out = reanchor(snap(), 10_000);
    const agent = out.agents[0];
    expect(agent.updatedAt).toBe(11_000);
    expect(agent.todosUpdatedAt).toBe(10_900);
    expect(agent.todos[0].startedAt).toBe(10_100);
    expect(agent.todos[0].completedAt).toBe(10_500);
    expect(agent.todos[1].startedAt).toBe(10_600);
  });

  it('leaves absent timestamps absent', () => {
    const out = reanchor(snap(), 10_000);
    expect('startedAt' in out.agents[0].todos[2]).toBe(false);
    expect(out.agents[0].todos[2].status).toBe('pending');
  });

  it('does not mutate the input', () => {
    const input = snap();
    reanchor(input, 10_000);
    expect(input.agents[0].updatedAt).toBe(1000);
    expect(input.agents[0].todos[0].startedAt).toBe(100);
  });

  it('accepts a negative delta', () => {
    const out = reanchor(snap(), -100);
    expect(out.agents[0].todos[0].startedAt).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/site/reanchor.test.ts`
Expected: FAIL — o módulo `site/src/demo/reanchor` não existe.

- [ ] **Step 3: Implementar**

`site/src/demo/reanchor.ts`:

```ts
import type { SessionSnapshot, AgentTodos, Todo } from '../../../src/types';

// Campos ausentes tem que continuar ausentes: `undefined + delta` viraria NaN,
// e a UI trata ausencia como "sem informacao de tempo", nao como zero.
function shift(value: number | undefined, deltaMs: number): number | undefined {
  return value === undefined ? undefined : value + deltaMs;
}

function shiftTodo(todo: Todo, deltaMs: number): Todo {
  const out: Todo = { ...todo };
  if (todo.startedAt !== undefined) out.startedAt = todo.startedAt + deltaMs;
  if (todo.completedAt !== undefined) out.completedAt = todo.completedAt + deltaMs;
  return out;
}

function shiftAgent(agent: AgentTodos, deltaMs: number): AgentTodos {
  const out: AgentTodos = {
    ...agent,
    updatedAt: agent.updatedAt + deltaMs,
    todos: agent.todos.map((t) => shiftTodo(t, deltaMs)),
  };
  const todosUpdatedAt = shift(agent.todosUpdatedAt, deltaMs);
  if (todosUpdatedAt !== undefined) out.todosUpdatedAt = todosUpdatedAt;
  return out;
}

// Desloca todo o eixo temporal de um snapshot gravado para a janela do "agora"
// do visitante. Puro: nao muta a entrada.
export function reanchor(snapshot: SessionSnapshot, deltaMs: number): SessionSnapshot {
  return {
    ...snapshot,
    agents: snapshot.agents.map((a) => shiftAgent(a, deltaMs)),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/site/reanchor.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add site/src/demo/reanchor.ts tests/site/reanchor.test.ts
git commit -m "feat(site): reanchor de timestamps das fixtures"
```

---

### Task 6: Tipos do roteiro e o player

**Files:**
- Create: `site/src/demo/types.ts`
- Create: `site/src/demo/player.ts`
- Test: `tests/site/player.test.ts`

**Interfaces:**
- Consumes: `reanchor` (Task 5); `SessionSnapshot`, `ProjectUsage` de `src/types.ts`.
- Produces:
  - `type FeatureId = 'agent-tree' | 'live-tasks' | 'task-timing' | 'tokens-cache' | 'dashboard' | 'notifications' | 'i18n'`
  - `interface DemoScript { id: string; recordedAt: number; durationMs: number; markers: { feature: FeatureId; atMs: number }[]; frames: { atMs: number; snapshot: SessionSnapshot }[]; projectUsage: ProjectUsage }`
  - `frameAt(script: DemoScript, tMs: number): SessionSnapshot | null`
  - `createPlayer(script, opts): Player` com `{ play(), pause(), seek(ms), seekToFeature(id), tMs, playing, destroy() }`

- [ ] **Step 1: Definir os tipos**

`site/src/demo/types.ts`:

```ts
import type { SessionSnapshot, ProjectUsage } from '../../../src/types';

// As 7 features que a landing enumera; cada uma tem um marcador no roteiro.
export type FeatureId =
  | 'agent-tree'
  | 'live-tasks'
  | 'task-timing'
  | 'tokens-cache'
  | 'dashboard'
  | 'notifications'
  | 'i18n';

export interface DemoMarker {
  feature: FeatureId;
  atMs: number;
}

export interface DemoFrame {
  atMs: number;
  snapshot: SessionSnapshot;
}

export interface DemoScript {
  id: string;
  recordedAt: number;   // epoch ms da gravacao — base da reancoragem
  durationMs: number;
  markers: DemoMarker[];
  frames: DemoFrame[];  // ordenados por atMs crescente
  projectUsage: ProjectUsage;
}
```

- [ ] **Step 2: Escrever o teste que falha**

`tests/site/player.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { frameAt, createPlayer } from '../../site/src/demo/player';
import type { DemoScript } from '../../site/src/demo/types';
import type { SessionSnapshot } from '../../src/types';

function snapWithTitle(title: string): SessionSnapshot {
  return { sessionId: 's1', cwd: '/repo', title, pinned: false, agents: [] };
}

const script: DemoScript = {
  id: 'test',
  recordedAt: 1_000_000,
  durationMs: 3000,
  markers: [
    { feature: 'agent-tree', atMs: 0 },
    { feature: 'dashboard', atMs: 2000 },
  ],
  frames: [
    { atMs: 0, snapshot: snapWithTitle('f0') },
    { atMs: 1000, snapshot: snapWithTitle('f1') },
    { atMs: 2000, snapshot: snapWithTitle('f2') },
  ],
  projectUsage: { sessions: 0, byModel: [], byAgentType: [] },
};

describe('frameAt', () => {
  it('returns the last frame at or before t', () => {
    expect(frameAt(script, 1500)?.title).toBe('f1');
    expect(frameAt(script, 1000)?.title).toBe('f1');
    expect(frameAt(script, 9999)?.title).toBe('f2');
  });

  it('returns null before the first frame', () => {
    const late = { ...script, frames: [{ atMs: 500, snapshot: snapWithTitle('x') }] };
    expect(frameAt(late, 100)).toBeNull();
  });
});

describe('createPlayer', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(5_000_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('emits the frame at t=0 on play, reanchored to now', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    expect(seen.at(-1)?.title).toBe('f0');
    p.destroy();
  });

  it('advances through frames as time passes', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    vi.advanceTimersByTime(1100);
    expect(seen.at(-1)?.title).toBe('f1');
    p.destroy();
  });

  it('loops back to the start after durationMs', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    vi.advanceTimersByTime(3200);
    expect(seen.at(-1)?.title).toBe('f0');
    p.destroy();
  });

  it('seekToFeature jumps to the marker', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.seekToFeature('dashboard');
    expect(p.tMs).toBe(2000);
    expect(seen.at(-1)?.title).toBe('f2');
    p.destroy();
  });

  it('keeps re-emitting while paused so live timers stay frozen', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.seek(1000);
    const before = seen.length;
    vi.advanceTimersByTime(2000);
    expect(seen.length).toBeGreaterThan(before);
    expect(seen.at(-1)?.title).toBe('f1');
    expect(p.tMs).toBe(1000);
    p.destroy();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run tests/site/player.test.ts`
Expected: FAIL — `site/src/demo/player` não existe.

- [ ] **Step 4: Implementar**

`site/src/demo/player.ts`:

```ts
import type { SessionSnapshot } from '../../../src/types';
import type { DemoScript, FeatureId } from './types';
import { reanchor } from './reanchor';

const TICK_MS = 250;

export interface PlayerOptions {
  onSnapshot(snapshot: SessionSnapshot): void;
}

export interface Player {
  readonly tMs: number;
  readonly playing: boolean;
  play(): void;
  pause(): void;
  seek(tMs: number): void;
  seekToFeature(feature: FeatureId): void;
  destroy(): void;
}

// Cada frame carrega o estado completo (nao delta), entao exibir o instante t e
// so achar o ultimo frame com atMs <= t. Seek para tras sai de graca.
export function frameAt(script: DemoScript, tMs: number): SessionSnapshot | null {
  let found: SessionSnapshot | null = null;
  for (const frame of script.frames) {
    if (frame.atMs > tMs) break;
    found = frame.snapshot;
  }
  return found;
}

export function createPlayer(script: DemoScript, opts: PlayerOptions): Player {
  let tMs = 0;
  let playing = false;

  // Reancora em funcao do t atual: no instante t do roteiro, o inicio da
  // gravacao equivale a `Date.now() - t`. Tocando a 1x o relogio do painel
  // avanca em sincronia sozinho; pausado, re-emitir a cada tick recalcula o
  // delta e congela os cronometros em vez de deixa-los correndo.
  function emit(): void {
    const snapshot = frameAt(script, tMs);
    if (!snapshot) return;
    opts.onSnapshot(reanchor(snapshot, Date.now() - (script.recordedAt + tMs)));
  }

  const timer = setInterval(() => {
    if (playing) {
      tMs += TICK_MS;
      if (tMs >= script.durationMs) tMs = 0;
    }
    emit();
  }, TICK_MS);

  return {
    get tMs() { return tMs; },
    get playing() { return playing; },
    play() { playing = true; emit(); },
    pause() { playing = false; },
    seek(next: number) {
      tMs = Math.max(0, Math.min(next, script.durationMs));
      emit();
    },
    seekToFeature(feature: FeatureId) {
      const marker = script.markers.find((m) => m.feature === feature);
      if (marker) this.seek(marker.atMs);
    },
    destroy() { clearInterval(timer); },
  };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/site/player.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add site/src/demo/types.ts site/src/demo/player.ts tests/site/player.test.ts
git commit -m "feat(site): tipos do roteiro e player com reancoragem"
```

---

### Task 7: `demoBridge` — o painel conversando com o site

**Files:**
- Create: `site/src/demo/demoBridge.ts`
- Test: `tests/site/demoBridge.test.ts`

**Interfaces:**
- Consumes: `WebviewBridge` de `src/webview/bridge.ts`; `Player` e `DemoScript` (Task 6).
- Produces: `createDemoBridge(deps: DemoBridgeDeps): WebviewBridge`, onde
  `DemoBridgeDeps = { script: DemoScript; player: Player; locale: Locale; onOpenSource(sessionId, agentId, line): void; onPickSession(): void }`.
  Expõe também `pushSnapshot(snapshot)` e `pushLocale(locale)` pelo objeto retornado (tipado como `DemoBridge extends WebviewBridge`).

- [ ] **Step 1: Escrever o teste que falha**

`tests/site/demoBridge.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDemoBridge } from '../../site/src/demo/demoBridge';
import type { DemoScript } from '../../site/src/demo/types';
import type { ExtensionMessage } from '../../src/types';

const script: DemoScript = {
  id: 'test',
  recordedAt: 0,
  durationMs: 1000,
  markers: [],
  frames: [{ atMs: 0, snapshot: { sessionId: 's1', cwd: '/r', title: 't', pinned: false, agents: [] } }],
  projectUsage: { sessions: 7, byModel: [], byAgentType: [] },
};

function fakePlayer() {
  return { tMs: 0, playing: false, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), seekToFeature: vi.fn(), destroy: vi.fn() };
}

describe('createDemoBridge', () => {
  it('starts the player when the panel reports ready', () => {
    const player = fakePlayer();
    const bridge = createDemoBridge({ script, player, locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage(() => {});
    bridge.post({ type: 'ready' });
    expect(player.play).toHaveBeenCalled();
  });

  it('sends the current locale on ready', () => {
    const seen: ExtensionMessage[] = [];
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'zh-tw', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage((m) => seen.push(m));
    bridge.post({ type: 'ready' });
    expect(seen).toContainEqual({ type: 'locale', locale: 'zh-tw' });
  });

  it('answers projectUsage with the script fixture', () => {
    const seen: ExtensionMessage[] = [];
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage((m) => seen.push(m));
    bridge.post({ type: 'projectUsage' });
    expect(seen).toContainEqual({ type: 'projectUsage', usage: script.projectUsage });
  });

  it('routes openTodoSource to the host callback', () => {
    const onOpenSource = vi.fn();
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource, onPickSession: vi.fn() });
    bridge.onMessage(() => {});
    bridge.post({ type: 'openTodoSource', sessionId: 's1', agentId: 'a1', line: 42 });
    expect(onOpenSource).toHaveBeenCalledWith('s1', 'a1', 42);
  });

  it('routes pickSession to the host callback', () => {
    const onPickSession = vi.fn();
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession });
    bridge.onMessage(() => {});
    bridge.post({ type: 'pickSession' });
    expect(onPickSession).toHaveBeenCalled();
  });

  it('ignores messages posted before a handler is registered', () => {
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    expect(() => bridge.post({ type: 'refresh' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/site/demoBridge.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`site/src/demo/demoBridge.ts`:

```ts
import type { WebviewBridge } from '../../../src/webview/bridge';
import type { ExtensionMessage, SessionSnapshot, WebviewMessage } from '../../../src/types';
import type { Locale } from '../../../src/i18n/locale';
import type { DemoScript } from './types';
import type { Player } from './player';

export interface DemoBridgeDeps {
  script: DemoScript;
  player: Player;
  locale: Locale;
  onOpenSource(sessionId: string, agentId: string, line: number): void;
  onPickSession(): void;
}

export interface DemoBridge extends WebviewBridge {
  pushSnapshot(snapshot: SessionSnapshot): void;
  pushLocale(locale: Locale): void;
}

export function createDemoBridge(deps: DemoBridgeDeps): DemoBridge {
  let handler: ((msg: ExtensionMessage) => void) | null = null;
  const send = (msg: ExtensionMessage): void => { handler?.(msg); };

  return {
    onMessage(next) { handler = next; },

    post(msg: WebviewMessage) {
      switch (msg.type) {
        case 'ready':
          send({ type: 'locale', locale: deps.locale });
          deps.player.play();
          break;
        case 'refresh':
          // O player re-emite a cada tick; nada a fazer alem de nao quebrar.
          break;
        case 'projectUsage':
          send({ type: 'projectUsage', usage: deps.script.projectUsage });
          break;
        case 'openTodoSource':
          deps.onOpenSource(msg.sessionId, msg.agentId, msg.line);
          break;
        case 'pickSession':
          deps.onPickSession();
          break;
        case 'openPanel':
          // O painel ja esta visivel no site.
          break;
      }
    },

    pushSnapshot(snapshot) { send({ type: 'snapshot', snapshot }); },
    pushLocale(locale) { send({ type: 'locale', locale }); },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/site/demoBridge.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add site/src/demo/demoBridge.ts tests/site/demoBridge.test.ts
git commit -m "feat(site): demoBridge respondendo ao protocolo do painel"
```

---

### Task 8: Gravador de fixtures a partir do parser real

**Files:**
- Create: `scripts/recordDemo.mts`
- Modify: `package.json` (script `demo:record`)

**Interfaces:**
- Consumes: `SnapshotService`, `SessionResolver`, `TodosParser`, `UsageParser` de `src/services/`; `DemoScript` (Task 6).
- Produces: `site/src/demo/scripts/smoke-test.json` conforme `DemoScript`.

O gravador trunca o `.jsonl` progressivamente e chama o parser real a cada corte, de modo que todo frame é, por construção, uma saída legítima da extensão.

- [ ] **Step 1: Escrever o gravador**

`scripts/recordDemo.mts`:

```ts
// Gera uma fixture de demo rodando o parser DE PRODUCAO sobre um transcript
// real, truncado progressivamente. Cada corte vira um frame. Roda em Node, onde
// `fs` existe — o site so consome o JSON resultante.
//
// Uso: npm run demo:record -- <caminho-do-.jsonl> <id-do-roteiro>
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SnapshotService } from '../src/services/snapshotService';
import { SessionResolver } from '../src/services/sessionResolver';
import { TodosParser } from '../src/services/todosParser';
import { UsageParser } from '../src/services/usageParser';

const MAX_FRAMES = 120;          // teto do spec — evita inchar o bundle
const FRAME_SPACING_MS = 1000;   // 1 frame/s de roteiro

const [transcriptPath, scriptId] = process.argv.slice(2);
if (!transcriptPath || !scriptId) {
  console.error('uso: npm run demo:record -- <caminho-do-.jsonl> <id>');
  process.exit(1);
}

const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);

// Amostragem uniforme quando o transcript passa do teto de frames.
const step = Math.max(1, Math.ceil(lines.length / MAX_FRAMES));
const cuts: number[] = [];
for (let i = step; i <= lines.length; i += step) cuts.push(i);
if (cuts.at(-1) !== lines.length) cuts.push(lines.length);

// Sandbox: recria a estrutura de ~/.claude num diretorio temporario e vai
// reescrevendo o transcript truncado, para que o parser real leia do disco
// exatamente como leria numa sessao de verdade.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-todos-demo-'));
const sessionId = path.basename(transcriptPath, '.jsonl');
const cwd = process.cwd();

const frames: { atMs: number; snapshot: SessionSnapshot }[] = [];

for (const [index, cut] of cuts.entries()) {
  writeTruncated(lines.slice(0, cut));
  const snapshot = buildService().build();
  if (!snapshot) continue;
  frames.push({ atMs: index * FRAME_SPACING_MS, snapshot });
}

const script = {
  id: scriptId,
  recordedAt: Date.now(),
  durationMs: frames.length * FRAME_SPACING_MS,
  // Preenchidos a mao apos inspecionar os frames (Step 4).
  markers: [],
  frames,
  // O dashboard agrega a JANELA DE 7 DIAS do projeto, nao esta sessao: nao ha o
  // que derivar de um transcript unico. Copiar o bloco `projectUsage` de uma das
  // fixtures encenadas da Task 9, ou ajustar os numeros a mao.
  projectUsage: { sessions: 0, byModel: [], byAgentType: [] },
};

const outPath = path.join('site', 'src', 'demo', 'scripts', `${scriptId}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(script, null, 2)}\n`);
console.log(`${frames.length} frames -> ${outPath}`);
console.log('Proximos passos: preencher `markers` e `projectUsage`.');

function writeTruncated(slice: string[]): void {
  // Mesma codificacao que o Claude Code usa em ~/.claude/projects.
  const dir = path.join(sandbox, 'projects', encodeCwdToProjectDir(cwd));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${slice.join('\n')}\n`);
}

function buildService(): SnapshotService {
  // O SnapshotService so chama `resolveCandidates()` no resolver; um stub evita
  // construir um BridgeFile de verdade so para apontar uma sessao.
  const resolver = {
    resolveCandidates: () => [{ cwd, sessionId, terminalPid: null, startedAt: 0 }],
  } as unknown as SessionResolver;
  return new SnapshotService(resolver, new TodosParser(sandbox), new UsageParser(sandbox));
}
```

Os imports no topo precisam incluir `encodeCwdToProjectDir` e o tipo do snapshot:

```ts
import { encodeCwdToProjectDir } from '../src/services/projectDir';
import type { SessionSnapshot } from '../src/types';
```

Assinaturas conferidas contra o código atual: `new TodosParser(claudeDir)` e `new UsageParser(claudeDir)` (`src/services/todosParser.ts:204`, `src/services/usageParser.ts:94`); `SessionResolver` recebe `(bridge: BridgeFile, getWorkspaceCwds: () => string[])`, por isso o stub acima em vez de instanciá-lo.

- [ ] **Step 2: Registrar o script**

Adicionar em `package.json`, dentro de `scripts`:

```json
"demo:record": "tsx scripts/recordDemo.mts"
```

E `tsx` em `devDependencies`:

```json
"tsx": "^4.19.2"
```

- [ ] **Step 3: Gravar a fixture do smoke-test**

Rodar `/smoke-test` numa sessão do Claude Code neste repositório, localizar o `.jsonl` gerado em `~/.claude/projects/<cwd-encoded>/` e então:

Run: `npm install && npm run demo:record -- "<caminho-do-.jsonl>" smoke-test`
Expected: mensagem `N frames -> site/src/demo/scripts/smoke-test.json`, com `N` entre 20 e 120.

- [ ] **Step 4: Preencher os marcadores**

Abrir `site/src/demo/scripts/smoke-test.json` e preencher `markers` com os instantes em que cada feature fica visível, por exemplo:

```json
"markers": [
  { "feature": "live-tasks", "atMs": 0 },
  { "feature": "agent-tree", "atMs": 8000 },
  { "feature": "task-timing", "atMs": 15000 },
  { "feature": "tokens-cache", "atMs": 22000 }
]
```

Os valores dependem da gravação: inspecionar os frames para escolher instantes em que o estado correspondente existe de fato.

- [ ] **Step 5: Commit**

```bash
git add scripts/recordDemo.mts package.json package-lock.json site/src/demo/scripts/smoke-test.json
git commit -m "feat(site): gravador de fixtures usando o parser de producao"
```

---

### Task 9: Fixtures encenadas e o teste que impede apodrecimento

**Files:**
- Create: `site/src/demo/scripts/contexto-critico.json`
- Create: `site/src/demo/scripts/lista-defasada.json`
- Test: `tests/site/scripts.test.ts`

**Interfaces:**
- Consumes: `DemoScript` (Task 6).
- Produces: três roteiros válidos em `site/src/demo/scripts/`, todos cobertos pelo teste de schema.

- [ ] **Step 1: Escrever o teste que falha**

`tests/site/scripts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DemoScript } from '../../site/src/demo/types';
import type { Todo } from '../../src/types';

const DIR = path.join('site', 'src', 'demo', 'scripts');
const FEATURES = new Set(['agent-tree', 'live-tasks', 'task-timing', 'tokens-cache', 'dashboard', 'notifications', 'i18n']);
const STATUSES = new Set(['pending', 'in_progress', 'completed']);

function load(): { name: string; script: DemoScript }[] {
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')) as DemoScript }));
}

describe('demo scripts', () => {
  it('ships the three expected scripts', () => {
    expect(load().map((s) => s.name).sort())
      .toEqual(['contexto-critico.json', 'lista-defasada.json', 'smoke-test.json']);
  });

  it.each(load())('$name has frames ordered by atMs and within duration', ({ script }) => {
    expect(script.frames.length).toBeGreaterThan(0);
    expect(script.frames.length).toBeLessThanOrEqual(120);
    for (let i = 1; i < script.frames.length; i++) {
      expect(script.frames[i].atMs).toBeGreaterThan(script.frames[i - 1].atMs);
    }
    expect(script.frames.at(-1)!.atMs).toBeLessThanOrEqual(script.durationMs);
  });

  it.each(load())('$name conforms to the SessionSnapshot shape', ({ script }) => {
    for (const frame of script.frames) {
      const s = frame.snapshot;
      expect(typeof s.sessionId).toBe('string');
      expect(typeof s.cwd).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(typeof s.pinned).toBe('boolean');
      expect(Array.isArray(s.agents)).toBe(true);
      for (const agent of s.agents) {
        expect(typeof agent.agentId).toBe('string');
        expect(typeof agent.isMain).toBe('boolean');
        expect(typeof agent.updatedAt).toBe('number');
        agent.todos.forEach((todo: Todo) => {
          expect(STATUSES.has(todo.status)).toBe(true);
          expect(typeof todo.content).toBe('string');
          expect(typeof todo.activeForm).toBe('string');
        });
      }
    }
  });

  it.each(load())('$name uses only known feature ids in markers', ({ script }) => {
    for (const marker of script.markers) {
      expect(FEATURES.has(marker.feature)).toBe(true);
      expect(marker.atMs).toBeLessThanOrEqual(script.durationMs);
    }
  });

  it('covers every feature across the three scripts', () => {
    const covered = new Set(load().flatMap(({ script }) => script.markers.map((m) => m.feature)));
    for (const feature of FEATURES) expect(covered.has(feature)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/site/scripts.test.ts`
Expected: FAIL — só `smoke-test.json` existe.

- [ ] **Step 3: Escrever a fixture de contexto crítico**

`site/src/demo/scripts/contexto-critico.json` — dois frames bastam para o estado ser legível:

```json
{
  "id": "contexto-critico",
  "recordedAt": 1785000000000,
  "durationMs": 4000,
  "markers": [
    { "feature": "tokens-cache", "atMs": 0 },
    { "feature": "notifications", "atMs": 2000 }
  ],
  "frames": [
    {
      "atMs": 0,
      "snapshot": {
        "sessionId": "demo-ctx",
        "cwd": "/home/dev/claude-todos-vscode",
        "title": "Refatorando o parser de transcripts",
        "pinned": false,
        "agents": [
          {
            "sessionId": "demo-ctx",
            "agentId": "demo-ctx",
            "name": "Main agent",
            "isMain": true,
            "status": "running",
            "updatedAt": 1785000000000,
            "todos": [
              { "content": "Mapear os consumidores do parser", "status": "completed", "activeForm": "Mapeando os consumidores do parser", "startedAt": 1784999400000, "completedAt": 1784999760000 },
              { "content": "Unificar as duas passagens de leitura", "status": "in_progress", "activeForm": "Unificando as duas passagens de leitura", "startedAt": 1784999760000 }
            ]
          }
        ],
        "usage": {
          "byModel": [{ "model": "claude-opus-4-8", "input": 41000, "output": 12800, "cache": 1290000 }],
          "byAgent": [{ "agentId": "demo-ctx", "name": "Main agent", "isMain": true, "models": [{ "model": "claude-opus-4-8", "input": 41000, "output": 12800, "cache": 1290000 }], "currentModel": "claude-opus-4-8" }],
          "context": { "tokens": 184000, "limit": 200000 },
          "cache": { "input": 41000, "read": 1160000, "creation": 130000 }
        }
      }
    },
    {
      "atMs": 2000,
      "snapshot": {
        "sessionId": "demo-ctx",
        "cwd": "/home/dev/claude-todos-vscode",
        "title": "Refatorando o parser de transcripts",
        "pinned": false,
        "awaitingInput": "question",
        "agents": [
          {
            "sessionId": "demo-ctx",
            "agentId": "demo-ctx",
            "name": "Main agent",
            "isMain": true,
            "status": "running",
            "updatedAt": 1785000002000,
            "todos": [
              { "content": "Mapear os consumidores do parser", "status": "completed", "activeForm": "Mapeando os consumidores do parser", "startedAt": 1784999400000, "completedAt": 1784999760000 },
              { "content": "Unificar as duas passagens de leitura", "status": "in_progress", "activeForm": "Unificando as duas passagens de leitura", "startedAt": 1784999760000 }
            ]
          }
        ],
        "usage": {
          "byModel": [{ "model": "claude-opus-4-8", "input": 43000, "output": 13400, "cache": 1310000 }],
          "byAgent": [{ "agentId": "demo-ctx", "name": "Main agent", "isMain": true, "models": [{ "model": "claude-opus-4-8", "input": 43000, "output": 13400, "cache": 1310000 }], "currentModel": "claude-opus-4-8" }],
          "context": { "tokens": 191000, "limit": 200000 },
          "cache": { "input": 43000, "read": 1180000, "creation": 130000 }
        }
      }
    }
  ],
  "projectUsage": {
    "sessions": 9,
    "byModel": [
      { "model": "claude-opus-4-8", "input": 210000, "output": 68000, "cache": 5400000 },
      { "model": "claude-sonnet-4-5", "input": 88000, "output": 31000, "cache": 1900000 }
    ],
    "byAgentType": [
      { "agentType": "main", "input": 180000, "output": 54000, "cache": 4100000 },
      { "agentType": "Explore", "input": 74000, "output": 26000, "cache": 2100000 },
      { "agentType": "general-purpose", "input": 44000, "output": 19000, "cache": 1100000 }
    ],
    "cache": { "input": 298000, "read": 6600000, "creation": 700000 }
  }
}
```

- [ ] **Step 4: Escrever a fixture de lista defasada**

`site/src/demo/scripts/lista-defasada.json` — o main parado há mais de 5 minutos enquanto um sub-agent segue rodando (a condição que a 0.14.0 sinaliza). Os `startedAt` são anteriores ao `updatedAt` do main em mais de 5 minutos de propósito:

```json
{
  "id": "lista-defasada",
  "recordedAt": 1785000000000,
  "durationMs": 3000,
  "markers": [
    { "feature": "agent-tree", "atMs": 0 },
    { "feature": "task-timing", "atMs": 1000 },
    { "feature": "dashboard", "atMs": 2000 },
    { "feature": "i18n", "atMs": 2500 }
  ],
  "frames": [
    {
      "atMs": 0,
      "snapshot": {
        "sessionId": "demo-stale",
        "cwd": "/home/dev/claude-todos-vscode",
        "title": "Orquestrando a migração do i18n",
        "pinned": false,
        "agents": [
          {
            "sessionId": "demo-stale",
            "agentId": "demo-stale",
            "name": "Main agent",
            "isMain": true,
            "status": "running",
            "updatedAt": 1785000000000,
            "todosUpdatedAt": 1784998800000,
            "todos": [
              { "content": "Extrair as strings da webview", "status": "completed", "activeForm": "Extraindo as strings da webview", "startedAt": 1784997000000, "completedAt": 1784998200000 },
              { "content": "Traduzir os catálogos", "status": "in_progress", "activeForm": "Traduzindo os catálogos", "startedAt": 1784998800000 },
              { "content": "Revisar a terminologia", "status": "pending", "activeForm": "Revisando a terminologia" }
            ]
          },
          {
            "sessionId": "demo-stale",
            "agentId": "agent-explore-1",
            "name": "explorador-a",
            "isMain": false,
            "status": "running",
            "agentType": "Explore",
            "depth": 1,
            "updatedAt": 1785000000000,
            "todos": [
              { "content": "Listar os arquivos em src/webview/", "status": "completed", "activeForm": "Listando os arquivos em src/webview/", "startedAt": 1784999700000, "completedAt": 1784999820000 },
              { "content": "Contar os componentes .svelte", "status": "in_progress", "activeForm": "Contando os componentes .svelte", "startedAt": 1784999820000 }
            ]
          }
        ],
        "usage": {
          "byModel": [
            { "model": "claude-opus-4-8", "input": 28000, "output": 9100, "cache": 410000 },
            { "model": "claude-sonnet-4-5", "input": 9000, "output": 3200, "cache": 96000 }
          ],
          "byAgent": [
            { "agentId": "demo-stale", "name": "Main agent", "isMain": true, "models": [{ "model": "claude-opus-4-8", "input": 28000, "output": 9100, "cache": 410000 }], "currentModel": "claude-opus-4-8" },
            { "agentId": "agent-explore-1", "name": "explorador-a", "isMain": false, "models": [{ "model": "claude-sonnet-4-5", "input": 9000, "output": 3200, "cache": 96000 }], "currentModel": "claude-sonnet-4-5" }
          ],
          "context": { "tokens": 74000, "limit": 200000 },
          "cache": { "input": 37000, "read": 460000, "creation": 46000 }
        }
      }
    },
    {
      "atMs": 2000,
      "snapshot": {
        "sessionId": "demo-stale",
        "cwd": "/home/dev/claude-todos-vscode",
        "title": "Orquestrando a migração do i18n",
        "pinned": false,
        "agents": [
          {
            "sessionId": "demo-stale",
            "agentId": "demo-stale",
            "name": "Main agent",
            "isMain": true,
            "status": "running",
            "updatedAt": 1785000002000,
            "todosUpdatedAt": 1784998800000,
            "todos": [
              { "content": "Extrair as strings da webview", "status": "completed", "activeForm": "Extraindo as strings da webview", "startedAt": 1784997000000, "completedAt": 1784998200000 },
              { "content": "Traduzir os catálogos", "status": "in_progress", "activeForm": "Traduzindo os catálogos", "startedAt": 1784998800000 },
              { "content": "Revisar a terminologia", "status": "pending", "activeForm": "Revisando a terminologia" }
            ]
          },
          {
            "sessionId": "demo-stale",
            "agentId": "agent-explore-1",
            "name": "explorador-a",
            "isMain": false,
            "status": "completed",
            "agentType": "Explore",
            "depth": 1,
            "updatedAt": 1785000002000,
            "todos": [
              { "content": "Listar os arquivos em src/webview/", "status": "completed", "activeForm": "Listando os arquivos em src/webview/", "startedAt": 1784999700000, "completedAt": 1784999820000 },
              { "content": "Contar os componentes .svelte", "status": "completed", "activeForm": "Contando os componentes .svelte", "startedAt": 1784999820000, "completedAt": 1785000001000 }
            ]
          }
        ],
        "usage": {
          "byModel": [
            { "model": "claude-opus-4-8", "input": 29000, "output": 9400, "cache": 418000 },
            { "model": "claude-sonnet-4-5", "input": 11000, "output": 4100, "cache": 108000 }
          ],
          "byAgent": [
            { "agentId": "demo-stale", "name": "Main agent", "isMain": true, "models": [{ "model": "claude-opus-4-8", "input": 29000, "output": 9400, "cache": 418000 }], "currentModel": "claude-opus-4-8" },
            { "agentId": "agent-explore-1", "name": "explorador-a", "isMain": false, "models": [{ "model": "claude-sonnet-4-5", "input": 11000, "output": 4100, "cache": 108000 }], "currentModel": "claude-sonnet-4-5" }
          ],
          "context": { "tokens": 79000, "limit": 200000 },
          "cache": { "input": 40000, "read": 480000, "creation": 46000 }
        }
      }
    }
  ],
  "projectUsage": {
    "sessions": 9,
    "byModel": [
      { "model": "claude-opus-4-8", "input": 210000, "output": 68000, "cache": 5400000 },
      { "model": "claude-sonnet-4-5", "input": 88000, "output": 31000, "cache": 1900000 }
    ],
    "byAgentType": [
      { "agentType": "main", "input": 180000, "output": 54000, "cache": 4100000 },
      { "agentType": "Explore", "input": 74000, "output": 26000, "cache": 2100000 },
      { "agentType": "general-purpose", "input": 44000, "output": 19000, "cache": 1100000 }
    ],
    "cache": { "input": 298000, "read": 6600000, "creation": 700000 }
  }
}
```

- [ ] **Step 5: Garantir a cobertura de features**

O último teste exige que as 7 features apareçam em algum roteiro. As encenadas acima cobrem `tokens-cache`, `notifications`, `agent-tree`, `task-timing`, `dashboard` e `i18n`; `live-tasks` deve estar nos marcadores do `smoke-test.json` (Task 8, Step 4).

Run: `npx vitest run tests/site/scripts.test.ts`
Expected: PASS. Se a cobertura falhar, ajustar os marcadores do `smoke-test.json` — não inventar marcador em instante onde o estado não existe.

- [ ] **Step 6: Commit**

```bash
git add site/src/demo/scripts/ tests/site/scripts.test.ts
git commit -m "feat(site): fixtures encenadas e validacao de schema dos roteiros"
```

---

### Task 10: Montar o painel real na página

**Files:**
- Create: `site/src/components/Demo.svelte`
- Modify: `site/src/pages/index.astro`

**Interfaces:**
- Consumes: `createDemoBridge` (Task 7), `createPlayer` (Task 6), `theme.css` (Task 4), `DemoWindow` (Task 3), `App.svelte` do produto.
- Produces: o painel renderizando e avançando sozinho na página inicial.

- [ ] **Step 1: Escrever o componente**

`site/src/components/Demo.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Locale } from '../../../src/i18n/locale';
  import type { DemoWindow } from '../../../src/webview/bridge';
  import type { DemoScript, FeatureId } from '../demo/types';
  import { createPlayer, type Player } from '../demo/player';
  import { createDemoBridge, type DemoBridge } from '../demo/demoBridge';

  let { script, locale = 'en' as Locale }: { script: DemoScript; locale?: Locale } = $props();

  let host: HTMLDivElement;
  let player: Player | null = null;
  let bridge: DemoBridge | null = null;
  let note = $state<string | null>(null);
  let playing = $state(false);

  onMount(async () => {
    player = createPlayer(script, { onSnapshot: (s) => bridge?.pushSnapshot(s) });
    bridge = createDemoBridge({
      script,
      player,
      locale,
      // No editor isto abriria o transcript na linha; no site vira uma nota.
      onOpenSource: (_s, _a, line) => { note = `line ${line}`; },
      onPickSession: () => { note = 'scenario'; },
    });

    // O App resolve o bridge no load do modulo, entao a injecao vem antes do
    // import dinamico — nao inverter a ordem.
    (window as unknown as DemoWindow).__claudeTodosDemo = bridge;

    const [{ mount }, App] = await Promise.all([
      import('svelte'),
      import('../../../src/webview/App.svelte').then((m) => m.default),
    ]);
    mount(App, { target: host });
    playing = true;
  });

  onDestroy(() => player?.destroy());

  export function seekToFeature(feature: FeatureId): void {
    player?.seekToFeature(feature);
  }

  function toggle(): void {
    if (!player) return;
    if (player.playing) { player.pause(); playing = false; }
    else { player.play(); playing = true; }
  }
</script>

<div class="panel">
  <div class="chrome">
    <button onclick={toggle}>{playing ? '⏸' : '▶'}</button>
    {#if note}<span class="note">{note}</span>{/if}
  </div>
  <div class="webview" bind:this={host}></div>
</div>

<style>
  .panel {
    width: 340px;
    background: var(--demo-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    overflow: hidden;
  }
  .chrome {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .note { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .webview { padding: 8px; min-height: 380px; }
</style>
```

- [ ] **Step 2: Usar o componente na página**

Substituir `site/src/pages/index.astro`:

```astro
---
import Demo from '../components/Demo.svelte';
import script from '../demo/scripts/smoke-test.json';
import '../demo/theme.css';
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Todos — observability for your Claude Code agents</title>
  </head>
  <body>
    <main>
      <h1>Claude Todos</h1>
      <p>Observability for your Claude Code agents.</p>
      <Demo client:only="svelte" script={script} locale="en" />
    </main>
  </body>
</html>
```

`client:only="svelte"` é obrigatório: o painel depende de `window` e de `setInterval`, e não pode ser renderizado no servidor.

- [ ] **Step 3: Verificar visualmente**

Run: `cd site && npm run dev`

Abrir `http://localhost:4321/claude-todos-vscode/` e confirmar:
- o painel aparece com cores (se estiver monocromático, falta variável na Task 4);
- as tasks transicionam sozinhas de `pending` → `in_progress` → `completed`;
- os sub-agents aparecem indentados sob o main;
- o botão de pausa congela os cronômetros em vez de deixá-los correndo;
- o console não tem erro de `acquireVsCodeApi` nem de `__jcefPost`.

- [ ] **Step 4: Verificar o build de produção**

Run: `cd site && npm run build`
Expected: build conclui e `site/dist/` contém o bundle do painel.

- [ ] **Step 5: Commit**

```bash
git add site/src/components/Demo.svelte site/src/pages/index.astro
git commit -m "feat(site): painel real rodando na pagina com o player"
```

---

### Task 11: Navegação por feature nos dois sentidos

**Files:**
- Create: `site/src/components/FeatureList.svelte`
- Create: `site/src/i18n/site.ts`
- Modify: `site/src/components/Demo.svelte`
- Modify: `site/src/pages/index.astro`

**Interfaces:**
- Consumes: `FeatureId` (Task 6), `Demo.seekToFeature` (Task 10).
- Produces: `FeatureList.svelte` com prop `onSelect(feature: FeatureId)` e prop `active: FeatureId | null`; catálogo `SITE_STRINGS` em `site/src/i18n/site.ts`.

- [ ] **Step 1: Criar o catálogo de strings do site**

`site/src/i18n/site.ts` — separado de `src/i18n/`: strings de marketing não pertencem ao catálogo do produto.

```ts
import type { Locale } from '../../../src/i18n/locale';
import type { FeatureId } from '../demo/types';

export interface SiteStrings {
  featuresTitle: string;
  features: Record<FeatureId, string>;
}

const en: SiteStrings = {
  featuresTitle: 'Explore',
  features: {
    'agent-tree': 'Live agent tree',
    'live-tasks': 'Tasks in real time',
    'task-timing': 'Per-task timing',
    'tokens-cache': 'Tokens, context and cache',
    dashboard: 'Last 7 days',
    notifications: 'Notifications',
    i18n: 'UI in 5 languages',
  },
};

// Os demais locales caem para `en` ate a Task 14 preencher as traducoes.
export const SITE_STRINGS: Record<Locale, SiteStrings> = {
  en,
  'pt-br': en,
  es: en,
  'zh-cn': en,
  'zh-tw': en,
};
```

- [ ] **Step 2: Criar a lista de features**

`site/src/components/FeatureList.svelte`:

```svelte
<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';
  import type { FeatureId } from '../demo/types';
  import { SITE_STRINGS } from '../i18n/site';

  let {
    available,
    active = null,
    locale = 'en' as Locale,
    onSelect,
  }: {
    available: FeatureId[];
    active?: FeatureId | null;
    locale?: Locale;
    onSelect: (feature: FeatureId) => void;
  } = $props();

  const strings = $derived(SITE_STRINGS[locale]);
</script>

<nav>
  <h2>{strings.featuresTitle}</h2>
  <ul>
    {#each available as feature (feature)}
      <li>
        <button class:active={active === feature} onclick={() => onSelect(feature)}>
          {strings.features[feature]}
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  h2 { font-size: 13px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
  ul { list-style: none; margin: 0; padding: 0; }
  button {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font: inherit;
    padding: 6px 8px;
    text-align: left;
    width: 100%;
  }
  button:hover { background: var(--vscode-list-hoverBackground); }
  button.active { border-left: 2px solid var(--vscode-focusBorder); font-weight: 600; }
</style>
```

- [ ] **Step 3: Expor a feature ativa no `Demo.svelte`**

Adicionar ao `<script>` de `site/src/components/Demo.svelte`, logo após a declaração de `playing`:

```ts
  let activeFeature = $state<FeatureId | null>(null);

  // Sentido inverso da navegacao: enquanto o roteiro toca, destaca a feature
  // cujo marcador foi o ultimo atingido.
  function markerAt(tMs: number): FeatureId | null {
    let found: FeatureId | null = null;
    for (const marker of script.markers) {
      if (marker.atMs > tMs) break;
      found = marker.feature;
    }
    return found;
  }
```

E dentro do callback `onSnapshot` do player, substituir a linha atual por:

```ts
      onSnapshot: (s) => {
        bridge?.pushSnapshot(s);
        activeFeature = markerAt(player?.tMs ?? 0);
      },
```

E trocar a assinatura do `seekToFeature` já exportado para também fixar o destaque:

```ts
  export function seekToFeature(feature: FeatureId): void {
    player?.seekToFeature(feature);
    activeFeature = feature;
  }
```

- [ ] **Step 4: Ligar os dois na página**

Substituir o `<body>` de `site/src/pages/index.astro`:

```astro
  <body>
    <main>
      <h1>Claude Todos</h1>
      <p>Observability for your Claude Code agents.</p>
      <div class="stage">
        <Explorer client:only="svelte" script={script} locale="en" />
      </div>
    </main>
  </body>
```

E criar `site/src/components/Explorer.svelte`, que combina os dois — necessário porque a comunicação entre `FeatureList` e `Demo` é client-side e uma página Astro não pode intermediar estado reativo entre duas islands:

```svelte
<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';
  import type { DemoScript, FeatureId } from '../demo/types';
  import Demo from './Demo.svelte';
  import FeatureList from './FeatureList.svelte';

  let { script, locale = 'en' as Locale }: { script: DemoScript; locale?: Locale } = $props();

  // `bind:this` num componente Svelte 5 devolve suas funcoes exportadas. Tipar
  // com a interface minima que consumimos evita depender de ReturnType do
  // componente, que nao e estavel.
  interface DemoHandle { seekToFeature(feature: FeatureId): void }

  let demo = $state<DemoHandle | null>(null);
  let active = $state<FeatureId | null>(null);

  const available = $derived([...new Set(script.markers.map((m) => m.feature))]);
</script>

<div class="stage">
  <FeatureList
    {available}
    {locale}
    {active}
    onSelect={(f) => { active = f; demo?.seekToFeature(f); }}
  />
  <Demo bind:this={demo} {script} {locale} />
</div>

<style>
  .stage { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
</style>
```

Ajustar o import na página: `import Explorer from '../components/Explorer.svelte';` no lugar de `Demo`.

- [ ] **Step 5: Verificar**

Run: `cd site && npm run dev`

Confirmar que clicar em "Last 7 days" salta o roteiro para o marcador correspondente, e que a feature destacada muda sozinha enquanto o roteiro toca.

Run: `cd site && npm run build`
Expected: build limpo.

- [ ] **Step 6: Commit**

```bash
git add site/src/components/ site/src/i18n/ site/src/pages/index.astro
git commit -m "feat(site): navegacao por feature ligada ao player"
```

---

## Fatia 3 — Landing em 5 idiomas

### Task 12: Teste de paridade estrutural dos READMEs

Precede a extração: sem essa garantia, extrair por índice de seção quebra silenciosamente.

**Files:**
- Test: `tests/site/readmeParity.test.ts`

**Interfaces:**
- Consumes: os cinco `README*.md` da raiz.
- Produces: garantia de que os cinco têm o mesmo número de seções `##`, na mesma ordem.

- [ ] **Step 1: Escrever o teste**

`tests/site/readmeParity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const READMES = ['README.md', 'README.en.md', 'README.es.md', 'README.zh-cn.md', 'README.zh-tw.md'];

function sectionCount(file: string): number {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('## ')).length;
}

describe('README parity', () => {
  // A extracao da landing casa as secoes por INDICE (os titulos mudam de
  // idioma). Se um README ganhar ou perder uma secao, a landing daquele idioma
  // passa a mostrar o bloco errado — sem erro visivel. Este teste quebra antes.
  it('all READMEs have the same number of sections', () => {
    const counts = READMES.map((f) => [f, sectionCount(f)] as const);
    const expected = counts[0][1];
    for (const [file, count] of counts) {
      expect(`${file}:${count}`).toBe(`${file}:${expected}`);
    }
  });

  it('has the 11 sections the landing extraction assumes', () => {
    expect(sectionCount('README.md')).toBe(11);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/site/readmeParity.test.ts`
Expected: PASS — os cinco têm 11 seções hoje.

- [ ] **Step 3: Verificar que o teste detecta dessincronização**

Adicionar temporariamente `## Teste` ao final de `README.es.md`, rodar de novo e confirmar FAIL. Desfazer com `git checkout README.es.md`.

- [ ] **Step 4: Commit**

```bash
git add tests/site/readmeParity.test.ts
git commit -m "test(site): paridade estrutural entre os cinco READMEs"
```

---

### Task 13: `extractLanding.mjs` — texto da landing vindo dos READMEs

**Files:**
- Create: `site/scripts/extractLanding.mjs`
- Test: `tests/site/extractLanding.test.ts`
- Modify: `site/package.json` (rodar antes do build)

**Interfaces:**
- Consumes: os cinco READMEs; a paridade garantida pela Task 12.
- Produces: `extractLanding(markdown: string): { tagline: string; features: string[]; install: string; privacy: string }`, e o arquivo gerado `site/src/generated/landing.json` no formato `Record<Locale, LandingContent>`.

Mapa de índices, conforme a decisão 9 do spec: features = seção **0**, instalação = seção **2**, privacidade = seção **5**.

- [ ] **Step 1: Escrever o teste que falha**

`tests/site/extractLanding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { extractLanding } from '../../site/scripts/extractLanding.mjs';

describe('extractLanding', () => {
  it('extracts the bold tagline that precedes the first image', () => {
    const out = extractLanding(fs.readFileSync('README.en.md', 'utf8'));
    expect(out.tagline).toContain('Claude Code');
    expect(out.tagline).not.toContain('**');
  });

  it('extracts the feature bullets from section 0', () => {
    const out = extractLanding(fs.readFileSync('README.en.md', 'utf8'));
    expect(out.features.length).toBeGreaterThanOrEqual(6);
    expect(out.features.every((f) => f.length > 0)).toBe(true);
    expect(out.features.some((f) => f.includes('##'))).toBe(false);
  });

  it('extracts install and privacy sections', () => {
    const out = extractLanding(fs.readFileSync('README.en.md', 'utf8'));
    expect(out.install).toContain('Marketplace');
    expect(out.privacy.toLowerCase()).toContain('local');
  });

  it('works on the Chinese README, where headings differ', () => {
    const out = extractLanding(fs.readFileSync('README.zh-cn.md', 'utf8'));
    expect(out.features.length).toBeGreaterThanOrEqual(6);
    expect(out.install).toContain('Marketplace');
  });

  it('rewrites relative links to absolute GitHub URLs', () => {
    const out = extractLanding('## A\n\n- see [contributing](CONTRIBUTING.md)\n');
    expect(out.features[0]).toContain('https://github.com/carlosdealmeida/claude-todos-vscode/blob/master/CONTRIBUTING.md');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/site/extractLanding.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`site/scripts/extractLanding.mjs`:

```js
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO = 'https://github.com/carlosdealmeida/claude-todos-vscode/blob/master';

// Os cinco READMEs sao estruturalmente identicos (11 secoes, mesma ordem), so os
// titulos mudam de idioma. Por isso casamos por INDICE, nunca por titulo.
const SECTION = { FEATURES: 0, INSTALL: 2, PRIVACY: 5 };

const LOCALE_FILES = {
  en: 'README.en.md',
  'pt-br': 'README.md',
  es: 'README.es.md',
  'zh-cn': 'README.zh-cn.md',
  'zh-tw': 'README.zh-tw.md',
};

function splitSections(markdown) {
  const sections = [];
  let current = null;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
}

// Links relativos so fazem sentido dentro do repo; no site apontam para o GitHub.
// `screenshots/` e a excecao: os arquivos sao copiados para public/.
function rewriteLinks(text) {
  return text.replace(/\]\((?!https?:|#)([^)]+)\)/g, (_match, target) =>
    target.startsWith('screenshots/') ? `](/claude-todos-vscode/${target})` : `](${REPO}/${target})`);
}

export function extractLanding(markdown) {
  const sections = splitSections(markdown);

  // A tagline e o primeiro paragrafo inteiramente em negrito, antes da 1a secao.
  const head = markdown.split('\n## ')[0];
  const taglineLine = head.split('\n').find((l) => l.startsWith('**')) ?? '';
  const tagline = taglineLine.replace(/\*\*/g, '').trim();

  const featureBody = sections[SECTION.FEATURES]?.body ?? '';
  const features = featureBody
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => rewriteLinks(l.slice(2).trim()));

  return {
    tagline,
    features,
    install: rewriteLinks(sections[SECTION.INSTALL]?.body ?? ''),
    privacy: rewriteLinks(sections[SECTION.PRIVACY]?.body ?? ''),
  };
}

// Executado como script (npm run prebuild), gera o JSON consumido pelas paginas.
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve('..');
  const out = {};
  for (const [locale, file] of Object.entries(LOCALE_FILES)) {
    out[locale] = extractLanding(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  const outPath = path.join('src', 'generated', 'landing.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`landing extraida para ${outPath}`);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/site/extractLanding.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Ligar ao build e copiar as imagens**

Em `site/package.json`, ajustar os scripts:

```json
  "scripts": {
    "prebuild": "node scripts/extractLanding.mjs && node -e \"fs.cpSync('../screenshots','public/screenshots',{recursive:true})\"",
    "dev": "npm run prebuild && astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
```

Adicionar `src/generated/` e `public/screenshots/` ao `site/.gitignore` — são artefatos.

- [ ] **Step 6: Verificar**

Run: `cd site && npm run prebuild && cat src/generated/landing.json | head -20`
Expected: JSON com as cinco chaves de locale, cada uma com `tagline`, `features`, `install`, `privacy`.

- [ ] **Step 7: Commit**

```bash
git add site/scripts/extractLanding.mjs site/package.json site/.gitignore tests/site/extractLanding.test.ts
git commit -m "feat(site): extrai o texto da landing dos READMEs por indice de secao"
```

---

### Task 14: Rotas por idioma e seletor ligado ao demo

**Files:**
- Create: `site/src/pages/[lang]/index.astro`
- Create: `site/src/components/LangSwitcher.svelte`
- Modify: `site/src/pages/index.astro`
- Modify: `site/src/components/Explorer.svelte`
- Modify: `site/src/i18n/site.ts` (traduções reais)

**Interfaces:**
- Consumes: `landing.json` (Task 13), `Explorer.svelte` (Task 11), `DemoBridge.pushLocale` (Task 7).
- Produces: rotas `/`, `/pt/`, `/es/`, `/zh-cn/`, `/zh-tw/`, com o seletor trocando o idioma da página **e** do painel.

- [ ] **Step 1: Traduzir as strings do site**

Substituir o mapa final de `site/src/i18n/site.ts` (as chaves são poucas — este é todo o conteúdo próprio do site):

```ts
const ptBr: SiteStrings = {
  featuresTitle: 'Explore',
  features: {
    'agent-tree': 'Árvore de agentes ao vivo',
    'live-tasks': 'Tasks em tempo real',
    'task-timing': 'Tempos por task',
    'tokens-cache': 'Tokens, contexto e cache',
    dashboard: 'Últimos 7 dias',
    notifications: 'Notificações',
    i18n: 'UI em 5 idiomas',
  },
};

const es: SiteStrings = {
  featuresTitle: 'Explora',
  features: {
    'agent-tree': 'Árbol de agentes en vivo',
    'live-tasks': 'Tareas en tiempo real',
    'task-timing': 'Tiempos por tarea',
    'tokens-cache': 'Tokens, contexto y caché',
    dashboard: 'Últimos 7 días',
    notifications: 'Notificaciones',
    i18n: 'IU en 5 idiomas',
  },
};

const zhCn: SiteStrings = {
  featuresTitle: '探索',
  features: {
    'agent-tree': '实时代理树',
    'live-tasks': '实时任务',
    'task-timing': '每个任务的用时',
    'tokens-cache': '令牌、上下文与缓存',
    dashboard: '最近 7 天',
    notifications: '通知',
    i18n: '5 种语言界面',
  },
};

const zhTw: SiteStrings = {
  featuresTitle: '探索',
  features: {
    'agent-tree': '即時代理樹',
    'live-tasks': '即時任務',
    'task-timing': '每個任務的用時',
    'tokens-cache': '權杖、上下文與快取',
    dashboard: '最近 7 天',
    notifications: '通知',
    i18n: '5 種語言介面',
  },
};

export const SITE_STRINGS: Record<Locale, SiteStrings> = {
  en,
  'pt-br': ptBr,
  es,
  'zh-cn': zhCn,
  'zh-tw': zhTw,
};
```

> As traduções zh seguem a terminologia de [docs/i18n/glossary-zh.md](../i18n/glossary-zh.md) e, como as do produto, aguardam revisão de falante nativo.

- [ ] **Step 2: Criar o seletor de idioma**

`site/src/components/LangSwitcher.svelte`:

```svelte
<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';

  let { current }: { current: Locale } = $props();

  // `pt-br` vira `/pt/` na URL; os demais usam o proprio codigo.
  const ROUTES: Record<Locale, string> = {
    en: '',
    'pt-br': 'pt',
    es: 'es',
    'zh-cn': 'zh-cn',
    'zh-tw': 'zh-tw',
  };

  const LABELS: Record<Locale, string> = {
    en: 'English',
    'pt-br': 'Português',
    es: 'Español',
    'zh-cn': '简体中文',
    'zh-tw': '繁體中文',
  };

  const base = '/claude-todos-vscode';
</script>

<nav class="langs">
  {#each Object.entries(ROUTES) as [locale, segment] (locale)}
    <a href={segment ? `${base}/${segment}/` : `${base}/`} aria-current={locale === current ? 'page' : undefined}>
      {LABELS[locale as Locale]}
    </a>
  {/each}
</nav>

<style>
  .langs { display: flex; gap: 12px; }
  a { color: var(--vscode-descriptionForeground); text-decoration: none; }
  a[aria-current='page'] { color: var(--vscode-foreground); font-weight: 600; }
</style>
```

Navegação por link (não por estado) mantém cada idioma com URL própria e indexável. O painel recebe o locale correto porque cada página passa o seu ao `Explorer`, que o repassa ao `createDemoBridge` — o `pushLocale` fica disponível para uma troca sem reload, se algum dia o seletor virar client-side.

- [ ] **Step 3: Criar a rota dinâmica por idioma**

`site/src/pages/[lang]/index.astro`:

```astro
---
import Explorer from '../../components/Explorer.svelte';
import LangSwitcher from '../../components/LangSwitcher.svelte';
import script from '../../demo/scripts/smoke-test.json';
import landing from '../../generated/landing.json';
import '../../demo/theme.css';

export function getStaticPaths() {
  return [
    { params: { lang: 'pt' }, props: { locale: 'pt-br' } },
    { params: { lang: 'es' }, props: { locale: 'es' } },
    { params: { lang: 'zh-cn' }, props: { locale: 'zh-cn' } },
    { params: { lang: 'zh-tw' }, props: { locale: 'zh-tw' } },
  ];
}

const { locale } = Astro.props;
const content = landing[locale];
---
<!doctype html>
<html lang={locale}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Todos</title>
    <meta name="description" content={content.tagline} />
  </head>
  <body>
    <LangSwitcher client:load current={locale} />
    <main>
      <h1>Claude Todos</h1>
      <p class="tagline">{content.tagline}</p>
      <Explorer client:only="svelte" script={script} locale={locale} />
      <ul class="features">
        {content.features.map((f) => <li set:html={f} />)}
      </ul>
    </main>
  </body>
</html>
```

- [ ] **Step 4: Alinhar a página em inglês**

Atualizar `site/src/pages/index.astro` com a mesma estrutura, fixando `locale = 'en'` e sem `getStaticPaths`.

- [ ] **Step 5: Passar o locale adiante no `Explorer`**

Confirmar que `Explorer.svelte` repassa a prop `locale` tanto ao `FeatureList` quanto ao `Demo` (já faz, pela Task 11) e que `Demo` a entrega ao `createDemoBridge` (já faz, pela Task 10).

- [ ] **Step 6: Verificar as cinco rotas**

Run: `cd site && npm run prebuild && npm run build`

Run: `ls site/dist site/dist/pt site/dist/es site/dist/zh-cn site/dist/zh-tw`
Expected: `index.html` em cada uma.

Run: `cd site && npm run preview`

Abrir `/claude-todos-vscode/zh-tw/` e confirmar que **a UI do painel também está em chinês tradicional** — é a prova de que o locale chega ao demo.

- [ ] **Step 7: Rodar a suíte inteira**

Run (na raiz): `npm test && npm run typecheck && npm run check:svelte`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add site/src/
git commit -m "feat(site): landing em cinco idiomas com o demo acompanhando o locale"
```

---

### Task 15: Toggle claro/escuro

A Task 4 já definiu as duas variantes em `theme.css`; falta o controle que alterna
`data-theme` no elemento raiz. É o que prova, na prática, que o painel é theme-aware.

**Files:**
- Create: `site/src/components/ThemeToggle.svelte`
- Modify: `site/src/pages/index.astro`, `site/src/pages/[lang]/index.astro`

**Interfaces:**
- Consumes: `theme.css` (Task 4), que já define `:root[data-theme="light"]`.
- Produces: `ThemeToggle.svelte`, sem props, que escreve `data-theme` em `document.documentElement` e persiste a escolha em `localStorage` sob a chave `claude-todos-theme`.

- [ ] **Step 1: Criar o componente**

`site/src/components/ThemeToggle.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  const KEY = 'claude-todos-theme';
  let theme = $state<'dark' | 'light'>('dark');

  onMount(() => {
    // Preferencia salva vence a do sistema; sem nenhuma das duas, dark — que e
    // o tema em que a maioria roda o editor.
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') theme = saved;
    else if (window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
    apply();
  });

  function apply(): void {
    document.documentElement.dataset.theme = theme;
  }

  function toggle(): void {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, theme);
    apply();
  }
</script>

<button onclick={toggle} aria-label="Toggle color theme">
  {theme === 'dark' ? '☀' : '☾'}
</button>

<style>
  button {
    background: none;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    color: var(--vscode-foreground);
    cursor: pointer;
    font: inherit;
    padding: 4px 10px;
  }
</style>
```

- [ ] **Step 2: Usar nas páginas**

Nas duas páginas (`index.astro` e `[lang]/index.astro`), importar e posicionar ao lado do `LangSwitcher`:

```astro
import ThemeToggle from '../components/ThemeToggle.svelte';
```

```astro
    <ThemeToggle client:load />
```

Ajustar o caminho do import para `../../components/ThemeToggle.svelte` na rota `[lang]`.

- [ ] **Step 3: Definir o fundo da página conforme o tema**

Acrescentar ao final de `site/src/demo/theme.css`:

```css
body {
  background: var(--demo-editor-background);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
  margin: 0;
  padding: 24px;
}
```

- [ ] **Step 4: Verificar**

Run: `cd site && npm run dev`

Alternar o tema e confirmar que **o painel inteiro** acompanha — barras de contexto, badges, ícones de status e a tabela de tokens. Qualquer elemento que fique ilegível no claro indica variável faltando ou com valor ruim na Task 4. Recarregar a página e confirmar que a escolha persiste.

- [ ] **Step 5: Commit**

```bash
git add site/src/components/ThemeToggle.svelte site/src/demo/theme.css site/src/pages/
git commit -m "feat(site): toggle claro/escuro alternando o tema do painel"
```

---

## Verificação final

- [ ] `npm test` na raiz: todos os testes passam, incluindo `tests/site/`.
- [ ] `npm run build` na raiz: extensão compila (nada em `site/` interfere).
- [ ] `npx vsce package --no-dependencies --allow-missing-repository`: o `.vsix` **não** contém `site/` (`.vscodeignore`).
- [ ] `cd site && npm run prebuild && npm run build`: site compila.
- [ ] As cinco rotas servem o painel com cores, tasks avançando e o idioma correto.
- [ ] O toggle de tema alterna o painel inteiro, sem elemento ilegível no claro.
- [ ] Push em `master` dispara `pages.yml` e o site publicado reflete a mudança.
