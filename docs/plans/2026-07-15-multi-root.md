# Multi-root: seguir a pasta ativa — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** em workspace multi-root, o painel segue a sessão mais ativa entre todas as pastas (com override opcional via setting `claudeTodos.activeFolder`), em vez de enxergar só a primeira pasta.

**Architecture:** generalizar o callback do `SessionResolver` de uma cwd para uma lista de cwds (união dos registros do bridge); a ordenação por mtime já existente no `SnapshotService` faz a detecção automática. Uma função pura `pickWorkspaceCwds` aplica o setting. `openTodoSource` e o dashboard 7 dias passam a resolver a cwd pela sessão, não pela pasta [0].

**Tech Stack:** TypeScript, vitest, VS Code API. Spec: [docs/specs/2026-07-15-multi-root-design.md](../specs/2026-07-15-multi-root-design.md)

## Global Constraints

- Strings novas de manifesto precisam entrar nos 3 nls: `package.nls.json`, `package.nls.pt-br.json`, `package.nls.es.json`.
- Comparações de path: case-insensitive no win32 (mesma regra de `BridgeFile.allForCwd`).
- Testes: `npm test` (vitest). Nenhum teste existente pode quebrar sem ajuste intencional.

---

### Task 1: `pickWorkspaceCwds` (função pura do setting)

**Files:**
- Create: `src/services/workspaceFolders.ts`
- Test: `tests/services/workspaceFolders.test.ts`

**Interfaces:**
- Produces: `pickWorkspaceCwds(folders: readonly WorkspaceFolderLike[], activeFolder: string): string[]` e `interface WorkspaceFolderLike { name: string; fsPath: string }` — consumidos pela Task 3 em `extension.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/workspaceFolders.test.ts
import { describe, it, expect } from 'vitest';
import { pickWorkspaceCwds } from '../../src/services/workspaceFolders';

const folders = [
  { name: 'api', fsPath: '/work/api' },
  { name: 'web', fsPath: '/work/web' },
];

describe('pickWorkspaceCwds', () => {
  it('returns all folder paths when activeFolder is empty', () => {
    expect(pickWorkspaceCwds(folders, '')).toEqual(['/work/api', '/work/web']);
  });

  it('returns all folder paths when activeFolder is whitespace', () => {
    expect(pickWorkspaceCwds(folders, '   ')).toEqual(['/work/api', '/work/web']);
  });

  it('narrows to a single folder matched by name', () => {
    expect(pickWorkspaceCwds(folders, 'web')).toEqual(['/work/web']);
  });

  it('narrows to a single folder matched by absolute path', () => {
    expect(pickWorkspaceCwds(folders, '/work/api')).toEqual(['/work/api']);
  });

  it('falls back to all folders when activeFolder matches nothing', () => {
    expect(pickWorkspaceCwds(folders, 'ghost')).toEqual(['/work/api', '/work/web']);
  });

  it('returns empty for an empty workspace', () => {
    expect(pickWorkspaceCwds([], 'web')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/workspaceFolders.test.ts`
Expected: FAIL — module `src/services/workspaceFolders` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/workspaceFolders.ts
export interface WorkspaceFolderLike {
  name: string;
  fsPath: string;
}

// Aplica o setting `claudeTodos.activeFolder` à lista de pastas do workspace:
// vazio = todas (detecção automática); valor casando com nome ou caminho de uma
// pasta = só ela; valor sem correspondência = todas (o painel nunca quebra por
// setting inválido). Path case-insensitive no win32, como BridgeFile.allForCwd.
export function pickWorkspaceCwds(
  folders: readonly WorkspaceFolderLike[],
  activeFolder: string,
): string[] {
  const all = folders.map(f => f.fsPath);
  const wanted = activeFolder.trim();
  if (!wanted) return all;
  const eqPath = (a: string, b: string) => process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
  const match = folders.find(f => f.name === wanted || eqPath(f.fsPath, wanted));
  return match ? [match.fsPath] : all;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/workspaceFolders.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/workspaceFolders.ts tests/services/workspaceFolders.test.ts
git commit -m "feat(multi-root): pickWorkspaceCwds — aplica o setting activeFolder às pastas"
```

---

### Task 2: `SessionResolver` multi-cwd (união do bridge)

**Files:**
- Modify: `src/services/sessionResolver.ts` (arquivo inteiro, 21 linhas)
- Test: `tests/services/sessionResolver.test.ts` (reescrever)

**Interfaces:**
- Consumes: `BridgeFile.allForCwd(cwd)` (existente).
- Produces: `new SessionResolver(bridge, getWorkspaceCwds: () => string[])` com `resolveCandidates(): BridgeRecord[]` (união, sem ordenação global — o `SnapshotService` re-ordena por mtime). O método `resolve()` é REMOVIDO (sem consumidor em produção).

- [ ] **Step 1: Rewrite the test file (failing)**

```ts
// tests/services/sessionResolver.test.ts — substituir o conteúdo inteiro
import { describe, it, expect, vi } from 'vitest';
import { SessionResolver } from '../../src/services/sessionResolver';
import type { BridgeFile } from '../../src/services/bridgeFile';

function fakeBridge(records: any[]): BridgeFile {
  return {
    readAll: () => records,
    allForCwd: (cwd: string) =>
      records.filter(r => r.cwd === cwd).sort((a, b) => b.startedAt - a.startedAt),
    append: vi.fn(),
    prune: vi.fn(),
  } as unknown as BridgeFile;
}

describe('SessionResolver', () => {
  it('returns empty when there is no workspace folder', () => {
    const resolver = new SessionResolver(fakeBridge([]), () => []);
    expect(resolver.resolveCandidates()).toEqual([]);
  });

  it('returns all records for a single cwd, most recent first', () => {
    const bridge = fakeBridge([
      { cwd: '/proj', sessionId: 'a', terminalPid: 1, startedAt: 1000 },
      { cwd: '/proj', sessionId: 'b', terminalPid: 2, startedAt: 3000 },
      { cwd: '/other', sessionId: 'd', terminalPid: 4, startedAt: 9000 },
    ]);
    const resolver = new SessionResolver(bridge, () => ['/proj']);
    expect(resolver.resolveCandidates().map(r => r.sessionId)).toEqual(['b', 'a']);
  });

  it('unions records across multiple cwds', () => {
    const bridge = fakeBridge([
      { cwd: '/work/api', sessionId: 'api-1', terminalPid: 1, startedAt: 1000 },
      { cwd: '/work/web', sessionId: 'web-1', terminalPid: 2, startedAt: 2000 },
      { cwd: '/elsewhere', sessionId: 'x', terminalPid: 3, startedAt: 9000 },
    ]);
    const resolver = new SessionResolver(bridge, () => ['/work/api', '/work/web']);
    const ids = resolver.resolveCandidates().map(r => r.sessionId);
    expect(ids).toContain('api-1');
    expect(ids).toContain('web-1');
    expect(ids).not.toContain('x');
    expect(ids).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/sessionResolver.test.ts`
Expected: FAIL — constructor callback agora retorna `string[]`; implementação atual espera `string | null`.

- [ ] **Step 3: Rewrite the implementation**

```ts
// src/services/sessionResolver.ts — substituir o conteúdo inteiro
import type { BridgeFile } from './bridgeFile';
import type { BridgeRecord } from '../types';

export class SessionResolver {
  constructor(
    private readonly bridge: BridgeFile,
    private readonly getWorkspaceCwds: () => string[],
  ) {}

  // União dos registros do bridge de todas as pastas do workspace. Sem
  // ordenação global aqui: quem escolhe a sessão exibida é o SnapshotService,
  // por mtime do transcript.
  resolveCandidates(): BridgeRecord[] {
    const out: BridgeRecord[] = [];
    for (const cwd of this.getWorkspaceCwds()) {
      out.push(...this.bridge.allForCwd(cwd));
    }
    return out;
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS em tudo, EXCETO possível erro de compilação em `src/extension.ts` (callback ainda single-cwd) — vitest não compila `extension.ts` (sem teste), então a suíte deve passar. A correção do call-site vem na Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/services/sessionResolver.ts tests/services/sessionResolver.test.ts
git commit -m "feat(multi-root): SessionResolver aceita várias cwds e une os registros do bridge"
```

---

### Task 3: `SnapshotService.activeCwd()` + call-sites em `extension.ts`

**Files:**
- Modify: `src/services/snapshotService.ts:35-42` (extrair escolha) e nova `activeCwd()`
- Modify: `src/extension.ts:63-66` (resolver), `:130-150` (picker), `:158-163` (projectUsage), `:164-165` + `:223-252` (openTodoSource), `:193-200` (config listener)
- Test: `tests/services/snapshotService.test.ts` (adicionar bloco `activeCwd`)

**Interfaces:**
- Consumes: `pickWorkspaceCwds` (Task 1), `SessionResolver` multi-cwd (Task 2).
- Produces: `SnapshotService.activeCwd(): string | null` — cwd da sessão exibida (pin respeitado).

- [ ] **Step 1: Write the failing tests (append ao describe existente)**

```ts
// tests/services/snapshotService.test.ts — adicionar dentro do describe('SnapshotService')
  it('activeCwd returns the cwd of the session that would be displayed', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/work/api', sessionId: 'api-1', terminalPid: null, startedAt: 1 },
        { cwd: '/work/web', sessionId: 'web-1', terminalPid: null, startedAt: 2 },
      ],
    };
    const parser = makeParser({ mtimes: { 'api-1': 1000, 'web-1': 5000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.activeCwd()).toBe('/work/web');
  });

  it('activeCwd honors the pinned session', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/work/api', sessionId: 'api-1', terminalPid: null, startedAt: 1 },
        { cwd: '/work/web', sessionId: 'web-1', terminalPid: null, startedAt: 2 },
      ],
    };
    const parser = makeParser({ mtimes: { 'api-1': 1000, 'web-1': 5000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    svc.setPinnedSession('api-1');
    expect(svc.activeCwd()).toBe('/work/api');
  });

  it('activeCwd returns null when there is no session', () => {
    const resolver = { resolveCandidates: () => [] };
    const parser = makeParser({ mtimes: {} });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.activeCwd()).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/snapshotService.test.ts`
Expected: FAIL — `svc.activeCwd is not a function` (3 novos).

- [ ] **Step 3: Implement `activeCwd` + extract `choose`**

Em `src/services/snapshotService.ts`, substituir o corpo de `build()` (linhas 35-42) e adicionar métodos:

```ts
  build(): SessionSnapshot | null {
    const sessions = this.listSessions();
    const chosen = this.choose(sessions);
    if (!chosen) return null;
    const pinned = chosen.sessionId === this.pinnedSessionId;
    // ... restante igual, trocando `pinned !== undefined` por `pinned`
```

Corpo completo resultante de `build()` + novos métodos:

```ts
  build(): SessionSnapshot | null {
    const sessions = this.listSessions();
    const chosen = this.choose(sessions);
    if (!chosen) return null;

    const agents = this.parser.listForSession(chosen.sessionId, chosen.cwd);
    // Desacopla "tem sessão" de "tem todo": antes de qualquer TodoWrite, ainda
    // resolvemos o agente main para que tokens/contexto/cache apareçam assim que
    // a sessão tem atividade. A lista visível (`agents`) continua vazia — a UI
    // mostra um estado leve de "aguardando tasks" no lugar da lista.
    const usageAgents: AgentTodos[] = agents.length > 0 ? agents : [{
      sessionId: chosen.sessionId,
      agentId: chosen.sessionId,
      name: 'Main agent',
      isMain: true,
      todos: [],
      updatedAt: 0,
    }];
    return {
      sessionId: chosen.sessionId,
      cwd: chosen.cwd,
      title: chosen.title,
      pinned: chosen.sessionId === this.pinnedSessionId,
      agents,
      usage: this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents),
    };
  }

  // cwd da sessão que o painel exibe (pin respeitado) — usada pelo dashboard
  // de projeto para manter painel e agregado apontando para a mesma pasta.
  activeCwd(): string | null {
    return this.choose(this.listSessions())?.cwd ?? null;
  }

  private choose(sessions: SessionSummary[]): SessionSummary | undefined {
    const pinned = this.pinnedSessionId
      ? sessions.find(s => s.sessionId === this.pinnedSessionId)
      : undefined;
    return pinned ?? sessions[0];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/snapshotService.test.ts`
Expected: PASS (todos, incluindo os 8 pré-existentes — `pinned` continua correto).

- [ ] **Step 5: Wire `extension.ts`**

Substituições em `src/extension.ts`:

(1) Import no topo (junto aos outros imports de services):

```ts
import { pickWorkspaceCwds } from './services/workspaceFolders';
```

(2) Linhas 63-66 (resolver) viram:

```ts
  const workspaceCwds = (): string[] => pickWorkspaceCwds(
    (vscode.workspace.workspaceFolders ?? []).map(f => ({ name: f.name, fsPath: f.uri.fsPath })),
    vscode.workspace.getConfiguration('claudeTodos').get<string>('activeFolder', ''),
  );
  const resolver = new SessionResolver(bridge, workspaceCwds);
```

(3) No `showSessionPicker` (linhas 133-140), desambiguar a pasta quando houver mais de uma:

```ts
    const multiRoot = workspaceCwds().length > 1;
    const items: SessionPickItem[] = [
      { label: t('picker.auto'), description: t('picker.autoDesc'), sessionId: null },
      ...sessions.map(s => ({
        label: s.title,
        description: multiRoot
          ? `${s.sessionId.slice(0, 8)} · ${path.basename(s.cwd)} · ${relativeTime(s.updatedAt, t)}`
          : `${s.sessionId.slice(0, 8)} · ${relativeTime(s.updatedAt, t)}`,
        sessionId: s.sessionId,
      })),
    ];
```

(4) Handler `projectUsage` (linhas 158-163) vira:

```ts
    } else if (msg.type === 'projectUsage') {
      const cwd = snapshotService.activeCwd() ?? workspaceCwds()[0] ?? null;
      const usage = cwd ? projectUsageService.usageForProject(cwd, Date.now() - SEVEN_DAYS_MS) : null;
      viewProvider.pushProjectUsage(usage);
      panelProvider.pushProjectUsage(usage);
```

(5) Handler `openTodoSource` (linhas 164-165) vira:

```ts
    } else if (msg.type === 'openTodoSource') {
      const cwd = snapshotService.listSessions()
        .find(s => s.sessionId === msg.sessionId)?.cwd ?? null;
      void openTodoSource(claudeDir, cwd, msg);
```

(6) Assinatura e início de `openTodoSource` (linhas 223-229): recebe a cwd resolvida pela
sessão (não mais `workspaceFolders[0]`); comentário atualizado:

```ts
// Abre o transcript do agente no editor, com a linha da mensagem selecionada.
// agentId igual ao sessionId = main agent (transcript principal); qualquer
// outro = sub-agent (agent-<id>.jsonl). A cwd vem da sessão (bridge), não da
// pasta [0] — em multi-root abre o transcript da pasta certa. Ids fora do
// padrão seguro são ignorados (defesa contra path traversal). Linha além do
// fim do arquivo: o VS Code posiciona no fim — aceitável (append-only).
async function openTodoSource(
  claudeDir: string,
  cwd: string | null,
  msg: { sessionId: string; agentId: string; line: number },
): Promise<void> {
  if (!SAFE_SESSION_ID.test(msg.agentId)) return;
  if (!cwd) return;
```

(7) Config listener (linhas 193-200): reagir também ao `activeFolder`:

```ts
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeTodos.language')) {
        viewProvider.pushLocale();
        panelProvider.pushLocale();
      }
      if (e.affectsConfiguration('claudeTodos.activeFolder')) {
        viewProvider.pushSnapshot();
        panelProvider.pushSnapshot();
        observeSession();
      }
    }),
```

- [ ] **Step 6: Full suite + build**

Run: `npx vitest run && npm run build:ext`
Expected: suíte PASS; build do extension.ts sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add src/services/snapshotService.ts src/extension.ts tests/services/snapshotService.test.ts
git commit -m "feat(multi-root): painel segue a sessão mais ativa entre as pastas do workspace"
```

---

### Task 4: Setting `claudeTodos.activeFolder` (manifesto + nls) e READMEs

**Files:**
- Modify: `package.json` (bloco `configuration.properties`, após `claudeTodos.notifications`)
- Modify: `package.nls.json`, `package.nls.pt-br.json`, `package.nls.es.json`
- Modify: `README.md:79`, `README.en.md:79`, `README.es.md:79`

**Interfaces:**
- Consumes: leitura do setting feita na Task 3 (`get<string>('activeFolder', '')`).

- [ ] **Step 1: Manifesto**

Em `package.json`, dentro de `contributes.configuration.properties`, adicionar após `claudeTodos.notifications`:

```json
        "claudeTodos.activeFolder": {
          "type": "string",
          "default": "",
          "description": "%config.activeFolder.description%"
        }
```

- [ ] **Step 2: nls (3 arquivos)**

`package.nls.json`:
```json
"config.activeFolder.description": "Multi-root only: name (or absolute path) of the workspace folder to track. Empty = follow the most recently active session across all folders."
```

`package.nls.pt-br.json`:
```json
"config.activeFolder.description": "Somente multi-root: nome (ou caminho absoluto) da pasta do workspace a acompanhar. Vazio = seguir a sessão mais ativa entre todas as pastas."
```

`package.nls.es.json`:
```json
"config.activeFolder.description": "Solo multi-root: nombre (o ruta absoluta) de la carpeta del workspace a seguir. Vacío = seguir la sesión más activa entre todas las carpetas."
```

- [ ] **Step 3: READMEs — limitação vira comportamento**

Substituir a linha 79 em cada README:

`README.md`: `- Workspaces multi-root usam apenas a primeira pasta.` →
`- Workspaces multi-root: o painel segue a sessão mais ativa entre todas as pastas; use o setting \`claudeTodos.activeFolder\` para fixar uma pasta.`

`README.en.md`: `- Multi-root workspaces use only the first folder.` →
`- Multi-root workspaces: the panel follows the most recently active session across all folders; use the \`claudeTodos.activeFolder\` setting to pin one folder.`

`README.es.md`: `- Los workspaces multi-raíz solo usan la primera carpeta.` →
`- Workspaces multi-raíz: el panel sigue la sesión más activa entre todas las carpetas; usa el setting \`claudeTodos.activeFolder\` para fijar una carpeta.`

- [ ] **Step 4: Build completo (valida manifesto + webview intactos)**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add package.json package.nls.json package.nls.pt-br.json package.nls.es.json README.md README.en.md README.es.md
git commit -m "feat(multi-root): setting claudeTodos.activeFolder + READMEs atualizados"
```
