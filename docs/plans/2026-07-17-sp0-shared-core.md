# SP0 — Core compartilhado (SessionCore + sidecar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desacoplar a lógica de orquestração da API do VS Code, fazendo nascer um `SessionCore` puro compartilhado e um sidecar Node (`dist/core/main.js`) que fala um protocolo JSON-lines — sem nenhuma mudança de comportamento na extensão VS Code.

**Architecture:** Extrai a fiação dos services + o loop watch→snapshot→observe do `activate()` para um `SessionCore` sem `vscode`. O `todosWatcher` troca `vscode.EventEmitter` por `events.EventEmitter`. A ponte da webview vira um módulo plugável. Um novo entry `src/core/main.ts` (casca stdin/stdout) sobre um `createDispatcher` puro traduz comandos↔eventos usando o `SessionCore`.

**Tech Stack:** TypeScript, esbuild, vitest (environment `node`). Sem dependências novas.

**Spec:** [docs/specs/2026-07-17-sp0-shared-core-design.md](../specs/2026-07-17-sp0-shared-core-design.md) · Overview: [docs/specs/2026-07-17-jetbrains-port-overview.md](../specs/2026-07-17-jetbrains-port-overview.md)

## Global Constraints

- **Regressão zero na extensão VS Code** — comportamento observável idêntico; a suíte inteira (266) permanece verde e `npm run build` compila limpo.
- Módulos em `src/services/` e `src/core/` **não importam `vscode`** (nem por type-only).
- Superfícies públicas preservadas quando o plano diz "preservada" — mesmos nomes de método e assinaturas, para não quebrar call sites fora do escopo.
- Testes: `npm test` (vitest, env node — sem `window`/DOM; mocks explícitos onde precisar). Build: `npm run build`.
- Commits pequenos, mensagem pt-BR no padrão `feat(escopo): ...` / `refactor(escopo): ...` / `test(escopo): ...`, rodapé `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `todosWatcher` sem `vscode`

**Files:**
- Modify: `src/services/todosWatcher.ts`
- Test: `tests/services/todosWatcher.test.ts` (criar)

**Interfaces:**
- Consumes: nada novo.
- Produces: `TodosWatcher` mantém `onChange(listener: () => void): { dispose(): void }` e `dispose(): void`, agora sobre `events.EventEmitter` do Node em vez de `vscode.EventEmitter`. Sem import de `vscode`.

- [ ] **Step 1: Write the failing test**

Criar `tests/services/todosWatcher.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TodosWatcher } from '../../src/services/todosWatcher';

describe('TodosWatcher', () => {
  let w: TodosWatcher | null = null;
  afterEach(() => { w?.dispose(); w = null; });

  it('fires onChange when a file changes under projects/, and dispose() unsubscribes', async () => {
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-'));
    const projects = path.join(claudeDir, 'projects');
    fs.mkdirSync(projects, { recursive: true });
    w = new TodosWatcher(claudeDir);

    let hits = 0;
    const sub = w.onChange(() => { hits++; });

    await new Promise(r => setTimeout(r, 50));
    fs.writeFileSync(path.join(projects, 'a.jsonl'), 'x');
    await new Promise(r => setTimeout(r, 400)); // > debounce (150ms)
    expect(hits).toBeGreaterThanOrEqual(1);

    const afterDispose = hits;
    sub.dispose();
    fs.writeFileSync(path.join(projects, 'b.jsonl'), 'y');
    await new Promise(r => setTimeout(r, 400));
    expect(hits).toBe(afterDispose);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/todosWatcher.test.ts`
Expected: FAIL — hoje `onChange` é `vscode.EventEmitter.event`; sob env node de teste, importar `todosWatcher` puxa `vscode` (não resolve) → erro de import.

- [ ] **Step 3: Implement**

Substituir o topo e os membros de `src/services/todosWatcher.ts`:

```ts
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

const DEBOUNCE_MS = 150;

export class TodosWatcher {
  private readonly emitter = new EventEmitter();
  private readonly watchers: fs.FSWatcher[] = [];
  private debounceHandle: NodeJS.Timeout | null = null;

  constructor(claudeDir: string) {
    const projectsDir = path.join(claudeDir, 'projects');
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    this.tryWatch(projectsDir, { recursive: true });
    this.tryWatch(bridgeDir, { recursive: false });
  }

  onChange(listener: () => void): { dispose(): void } {
    this.emitter.on('change', listener);
    return { dispose: () => { this.emitter.off('change', listener); } };
  }
```

O restante do corpo (`tryWatch`, `scheduleEmit`, `dispose`) permanece, trocando
`this.emitter.fire()` por `this.emitter.emit('change')` e, no `dispose`, `this.emitter.dispose()`
por `this.emitter.removeAllListeners()`. Remover `implements vscode.Disposable` da classe (a
forma estrutural `{ dispose(): void }` já basta para `context.subscriptions.push`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/todosWatcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/todosWatcher.ts tests/services/todosWatcher.test.ts
git commit -m "refactor(watcher): EventEmitter do Node em vez de vscode — todosWatcher sem vscode (SP0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ponte da webview plugável (`bridge.ts`)

**Files:**
- Create: `src/webview/bridge.ts`
- Modify: `src/webview/stores.svelte.ts:5-11,22-28,51-53`
- Test: `tests/webview/bridge.test.ts` (criar)

**Interfaces:**
- Consumes: nada novo.
- Produces: `WebviewBridge { post(msg: WebviewMessage): void; onMessage(handler: (msg: ExtensionMessage) => void): void }`; `createVscodeBridge(win?, acquire?): WebviewBridge`; `createJcefBridge(): WebviewBridge` (lança "SP1"); `createBridge(): WebviewBridge` (detecção por `typeof acquireVsCodeApi`).

- [ ] **Step 1: Write the failing test**

Criar `tests/webview/bridge.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createVscodeBridge, createJcefBridge, createBridge } from '../../src/webview/bridge';

describe('createVscodeBridge', () => {
  it('post delegates to acquireVsCodeApi().postMessage', () => {
    const postMessage = vi.fn();
    const bridge = createVscodeBridge({ addEventListener: vi.fn() } as any, () => ({ postMessage }));
    bridge.post({ type: 'ready' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('onMessage receives event.data from window message events', () => {
    let captured: ((e: any) => void) | null = null;
    const win = { addEventListener: (_: string, cb: (e: any) => void) => { captured = cb; } };
    const bridge = createVscodeBridge(win as any, () => ({ postMessage: vi.fn() }));
    const seen: unknown[] = [];
    bridge.onMessage((msg) => seen.push(msg));
    captured!({ data: { type: 'snapshot', snapshot: null } });
    expect(seen).toEqual([{ type: 'snapshot', snapshot: null }]);
  });
});

describe('createJcefBridge', () => {
  it('throws until SP1 implements it', () => {
    expect(() => createJcefBridge()).toThrow(/SP1/);
  });
});

describe('createBridge', () => {
  it('falls into the jcef branch when acquireVsCodeApi is absent (node env)', () => {
    // Em env node, `acquireVsCodeApi` não existe em runtime → ramo JCEF → throw.
    expect(() => createBridge()).toThrow(/SP1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/webview/bridge.test.ts`
Expected: FAIL — módulo `bridge.ts` não existe.

- [ ] **Step 3: Implement**

Criar `src/webview/bridge.ts`:

```ts
import type { ExtensionMessage, WebviewMessage } from '../types';

export interface WebviewBridge {
  post(msg: WebviewMessage): void;
  onMessage(handler: (msg: ExtensionMessage) => void): void;
}

interface VsCodeApi { postMessage(msg: WebviewMessage): void; }
declare function acquireVsCodeApi(): VsCodeApi;

export function createVscodeBridge(
  win: Pick<Window, 'addEventListener'> = window,
  acquire: () => VsCodeApi = acquireVsCodeApi,
): WebviewBridge {
  const api = acquire();
  return {
    post: (msg) => api.postMessage(msg),
    onMessage: (handler) => {
      win.addEventListener('message', (event) => {
        handler((event as MessageEvent).data as ExtensionMessage);
      });
    },
  };
}

export function createJcefBridge(): WebviewBridge {
  throw new Error('jcef bridge não implementada — chega no SP1');
}

export function createBridge(): WebviewBridge {
  return typeof acquireVsCodeApi !== 'undefined' ? createVscodeBridge() : createJcefBridge();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/webview/bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `stores.svelte.ts` to use the bridge**

Em `src/webview/stores.svelte.ts`: remover a declaração `acquireVsCodeApi` e `const vscode = acquireVsCodeApi()` (linhas 5-11); importar `createBridge`:

```ts
import { createBridge } from './bridge';
```

Criar a bridge no módulo e usá-la:

```ts
const bridge = createBridge();

class TodosStore {
  // ...campos $state inalterados...
  constructor() {
    bridge.onMessage((msg) => this.handle(msg));
    this.post({ type: 'ready' });
  }
  // ...handle inalterado...
  post(msg: WebviewMessage): void {
    bridge.post(msg);
  }
  // ...resto inalterado...
}
```

- [ ] **Step 6: Build to verify the webview still compiles**

Run: `npm run build`
Expected: sem erros (o comportamento da store é idêntico; a ponte apenas foi extraída).

- [ ] **Step 7: Commit**

```bash
git add src/webview/bridge.ts src/webview/stores.svelte.ts tests/webview/bridge.test.ts
git commit -m "refactor(webview): ponte plugável (createBridge) extraída da store (SP0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `SessionCore` — orquestrador puro

**Files:**
- Create: `src/core/sessionCore.ts`
- Test: `tests/core/sessionCore.test.ts` (criar)

**Interfaces:**
- Consumes: `TodosWatcher` (Task 1) e todos os services existentes.
- Produces: `SessionCore` com a superfície da spec: `constructor(deps: SessionCoreDeps)`, `pruneBridge(maxAgeMs)`, `setPinnedSession(id)`, `buildSnapshot()`, `listSessions()`, `activeCwd()`, `getProjectUsage()`, `resolveTodoSource(sessionId, agentId, line)`, `onChange(listener)`, `observeForNotifications()`, `shouldPollNotifications()`, `dispose()`.

- [ ] **Step 1: Write the failing test**

Criar `tests/core/sessionCore.test.ts` (padrão dos testes de service — claudeDir temp + `encodeCwdToProjectDir`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionCore } from '../../src/core/sessionCore';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

const CWD = '/home/user/proj';
const SID = 'core-sess-a';

function assistant(model: string): object {
  return { type: 'assistant', message: { model, role: 'assistant', usage: { input_tokens: 5, output_tokens: 1 } } };
}

describe('SessionCore', () => {
  let claudeDir: string;
  beforeEach(() => { claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-')); });
  afterEach(() => { fs.rmSync(claudeDir, { recursive: true, force: true }); });

  function writeSession(): void {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), JSON.stringify(assistant('claude-opus-4-8')));
    // registro do bridge para o resolver enxergar a sessão
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
  }

  function make(): SessionCore {
    return new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => 1_000_000 });
  }

  it('builds a snapshot for the active session', () => {
    writeSession();
    const snap = make().buildSnapshot();
    expect(snap?.sessionId).toBe(SID);
  });

  it('lists sessions and resolves the main transcript source', () => {
    writeSession();
    const core = make();
    expect(core.listSessions().map(s => s.sessionId)).toContain(SID);
    const src = core.resolveTodoSource(SID, SID, 3);
    expect(src?.filePath.endsWith(`${SID}.jsonl`)).toBe(true);
    expect(src?.line).toBe(3);
  });

  it('rejects an unsafe agentId in resolveTodoSource', () => {
    writeSession();
    expect(make().resolveTodoSource(SID, '../evil', 0)).toBeNull();
  });

  it('returns null snapshot title when there is no session', () => {
    expect(make().observeForNotifications()).toEqual({ kinds: [], awaitingInput: null, title: null });
  });

  it('getProjectUsage aggregates the active project', () => {
    writeSession();
    const usage = make().getProjectUsage();
    expect(usage?.byModel.some(m => m.model === 'claude-opus-4-8')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/sessionCore.test.ts`
Expected: FAIL — `src/core/sessionCore.ts` não existe.

- [ ] **Step 3: Implement**

Criar `src/core/sessionCore.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { BridgeFile } from '../services/bridgeFile';
import { TodosParser } from '../services/todosParser';
import { SessionResolver } from '../services/sessionResolver';
import { SnapshotService } from '../services/snapshotService';
import { UsageParser } from '../services/usageParser';
import { ProjectUsageService } from '../services/projectUsageService';
import { TodosWatcher } from '../services/todosWatcher';
import { SessionNotifier, type NotificationKind } from '../services/sessionNotifier';
import { transcriptPath, subAgentsDir, SAFE_SESSION_ID } from '../services/transcriptPaths';
import type { SessionSnapshot, SessionSummary, ProjectUsage, AwaitingInput } from '../types';

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export interface SessionCoreDeps {
  claudeDir: string;
  workspaceCwds: () => string[];
  now?: () => number;
}

export class SessionCore {
  private readonly claudeDir: string;
  private readonly workspaceCwds: () => string[];
  private readonly now: () => number;
  private readonly bridge: BridgeFile;
  private readonly parser: TodosParser;
  private readonly usageParser: UsageParser;
  private readonly projectUsageService: ProjectUsageService;
  private readonly snapshotService: SnapshotService;
  private readonly notifier = new SessionNotifier();
  private readonly watcher: TodosWatcher;

  constructor(deps: SessionCoreDeps) {
    this.claudeDir = deps.claudeDir;
    this.workspaceCwds = deps.workspaceCwds;
    this.now = deps.now ?? (() => Date.now());
    this.bridge = new BridgeFile(path.join(this.claudeDir, '.vscode-todos-bridge', 'sessions.json'));
    this.parser = new TodosParser(this.claudeDir);
    this.usageParser = new UsageParser(this.claudeDir);
    this.projectUsageService = new ProjectUsageService(this.claudeDir);
    const resolver = new SessionResolver(this.bridge, this.workspaceCwds);
    this.snapshotService = new SnapshotService(resolver, this.parser, this.usageParser);
    this.watcher = new TodosWatcher(this.claudeDir);
  }

  pruneBridge(maxAgeMs: number): void { this.bridge.prune(maxAgeMs); }
  setPinnedSession(id: string | null): void { this.snapshotService.setPinnedSession(id); }
  buildSnapshot(): SessionSnapshot | null { return this.snapshotService.build(); }
  listSessions(): SessionSummary[] { return this.snapshotService.listSessions(); }
  activeCwd(): string | null { return this.snapshotService.activeCwd(); }

  getProjectUsage(): ProjectUsage | null {
    const cwd = this.snapshotService.activeCwd() ?? this.workspaceCwds()[0] ?? null;
    return cwd ? this.projectUsageService.usageForProject(cwd, this.now() - SEVEN_DAYS_MS) : null;
  }

  resolveTodoSource(sessionId: string, agentId: string, line: number): { filePath: string; line: number } | null {
    if (!SAFE_SESSION_ID.test(agentId)) return null;
    const cwd = this.snapshotService.listSessions().find(s => s.sessionId === sessionId)?.cwd ?? null;
    if (!cwd) return null;
    let filePath: string | null = null;
    if (agentId === sessionId) {
      filePath = transcriptPath(this.claudeDir, sessionId, cwd);
    } else {
      const dir = subAgentsDir(this.claudeDir, sessionId, cwd);
      if (dir) {
        const candidate = path.join(dir, `agent-${agentId}.jsonl`);
        if (fs.existsSync(candidate)) filePath = candidate;
      }
    }
    if (!filePath) return null;
    return { filePath, line: Math.max(0, Math.floor(line)) };
  }

  onChange(listener: () => void): { dispose(): void } { return this.watcher.onChange(listener); }

  observeForNotifications(): { kinds: NotificationKind[]; awaitingInput: AwaitingInput | null; title: string | null } {
    const snapshot = this.snapshotService.build();
    if (!snapshot) return { kinds: [], awaitingInput: null, title: null };
    const mtime = this.parser.transcriptMtime(snapshot.sessionId, snapshot.cwd) ?? 0;
    const main = snapshot.agents.find(a => a.isMain);
    const allComplete = main !== undefined && main.todos.length > 0
      && main.todos.every(td => td.status === 'completed');
    const awaitingInput = snapshot.awaitingInput ?? null;
    const kinds = this.notifier.observe({
      sessionId: snapshot.sessionId, mtime, allComplete, awaitingInput, now: this.now(),
    });
    return { kinds, awaitingInput, title: snapshot.title };
  }

  shouldPollNotifications(): boolean { return this.notifier.shouldPoll(this.now()); }
  dispose(): void { this.watcher.dispose(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/sessionCore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/sessionCore.ts tests/core/sessionCore.test.ts
git commit -m "feat(core): SessionCore — orquestrador puro compartilhado (SP0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: providers + `extension.ts` consomem o `SessionCore` (regressão zero)

**Files:**
- Modify: `src/providers/todosViewProvider.ts:11-15,34-39`
- Modify: `src/providers/todosPanelProvider.ts` (construtor + `pushSnapshot`)
- Modify: `src/extension.ts:47-238` (fiação, `observeSession`, `handleMessage`, `openTodoSource`, `showSessionPicker`)
- Test: nenhum novo (regressão coberta pela suíte + build + verify). Ajustar mocks só se algum teste existente referenciar as assinaturas alteradas.

**Interfaces:**
- Consumes: `SessionCore` (Task 3).
- Produces: `TodosViewProvider`/`TodosPanelProvider` recebem `buildSnapshot: () => SessionSnapshot | null` no lugar do `SnapshotService`. `extension.ts` instancia um único `SessionCore`.

- [ ] **Step 1: Refactor the providers to take a `buildSnapshot` function**

Em `src/providers/todosViewProvider.ts`: trocar o import/campo do `SnapshotService` por uma função. Construtor:

```ts
import type { SessionSnapshot, ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
// (remover o import de SnapshotService)

constructor(
  private readonly extensionUri: vscode.Uri,
  private readonly buildSnapshot: () => SessionSnapshot | null,
  private readonly onWebviewMessage: (msg: WebviewMessage) => void,
) {}
```

e em `pushSnapshot`: `const snapshot = this.buildSnapshot();`. Aplicar a mesma mudança em
`src/providers/todosPanelProvider.ts` (construtor + `pushSnapshot`).

- [ ] **Step 2: Rewire `extension.ts` onto `SessionCore`**

No `activate()`:

- Importar o core: `import { SessionCore } from './core/sessionCore';` e remover os imports agora não usados diretamente (`BridgeFile`, `TodosParser`, `SessionResolver`, `SnapshotService`, `UsageParser`, `ProjectUsageService`, `TodosWatcher`, `SessionNotifier`, `transcriptPath`/`subAgentsDir` se saírem — manter `SAFE_SESSION_ID` só se ainda usado; ver abaixo).
- Substituir a fiação (linhas 63-78: bridge/prune/parser/usageParser/projectUsageService/workspaceCwds/resolver/snapshotService/setPinned/watcher/notifier) por:

```ts
const workspaceCwds = (): string[] => pickWorkspaceCwds(
  (vscode.workspace.workspaceFolders ?? []).map(f => ({ name: f.name, fsPath: f.uri.fsPath })),
  vscode.workspace.getConfiguration('claudeTodos').get<string>('activeFolder', ''),
);
const core = new SessionCore({ claudeDir, workspaceCwds });
core.pruneBridge(BRIDGE_MAX_AGE_MS);
core.setPinnedSession(context.workspaceState.get<string | null>('pinnedSessionId', null));
let notifyTimer: NodeJS.Timeout | null = null;
```

- `observeSession` passa a usar o core:

```ts
const observeSession = (): void => {
  const { kinds, awaitingInput, title } = core.observeForNotifications();
  if (title === null) { stopNotifyTimer(); return; }
  maybeToast(kinds, title, awaitingInput);
  if (core.shouldPollNotifications()) startNotifyTimer(); else stopNotifyTimer();
};
```

- `handleMessage`: `projectUsage` → `const usage = core.getProjectUsage();`; `openTodoSource` →

```ts
} else if (msg.type === 'openTodoSource') {
  const target = core.resolveTodoSource(msg.sessionId, msg.agentId, msg.line);
  void openTodoSource(target);
}
```

- Substituir a função standalone `openTodoSource(claudeDir, cwd, msg)` por uma que recebe o alvo já resolvido (a resolução/validação agora vive no core):

```ts
async function openTodoSource(target: { filePath: string; line: number } | null): Promise<void> {
  if (!target) {
    const t = createT(resolveLocale());
    void vscode.window.showWarningMessage(t('todo.sourceMissing'));
    return;
  }
  const pos = new vscode.Position(target.line, 0);
  await vscode.window.showTextDocument(vscode.Uri.file(target.filePath), {
    selection: new vscode.Range(pos, pos),
    preview: true,
  });
}
```

  (Com isso `SAFE_SESSION_ID`, `transcriptPath`, `subAgentsDir` e o `import fs` deixam de ser usados no `extension.ts` — remover os imports órfãos. `path`/`os` seguem usados.)

- `showSessionPicker`: trocar `snapshotService.listSessions()` → `core.listSessions()`,
  `snapshotService.setPinnedSession(...)` → `core.setPinnedSession(...)`; os `viewProvider.pushSnapshot()`/`panelProvider.pushSnapshot()`/`observeSession()` seguem.
- Providers: `new TodosViewProvider(context.extensionUri, () => core.buildSnapshot(), handleMessage)` e idem para o panel.
- Watcher/dispose: substituir `context.subscriptions.push(watcher)` e o `watcher.onChange(...)` por:

```ts
context.subscriptions.push({ dispose: () => core.dispose() });
context.subscriptions.push(core.onChange(() => {
  viewProvider.pushSnapshot();
  panelProvider.pushSnapshot();
  observeSession();
}));
```

- `context.subscriptions.push({ dispose: stopNotifyTimer });` permanece.

- [ ] **Step 3: Typecheck + full build**

Run: `npm run build`
Expected: compila limpo. Se `tsc` apontar imports órfãos (`fs`, `SAFE_SESSION_ID`, etc.), removê-los.

- [ ] **Step 4: Full test suite (regression gate)**

Run: `npm test`
Expected: 266+ passing (os testes de `snapshotService`/`todosParser`/etc. não tocam `extension.ts`; se algum teste construía um provider com `SnapshotService`, atualizar para passar a função `() => svc.build()`).

- [ ] **Step 5: Behavioral verification (regressão zero)**

Invocar o skill `verify` (ou, no mínimo, `preview-webview` + abrir o Extension Development Host, F5): confirmar que o painel abre, mostra a sessão ativa, atualiza ao vivo, o clique num todo abre o transcript na linha, o picker troca a sessão e o dashboard 7 dias carrega — comportamento idêntico ao de antes.

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts src/providers/todosViewProvider.ts src/providers/todosPanelProvider.ts
git commit -m "refactor(extension): consumir SessionCore; providers recebem buildSnapshot (SP0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: sidecar — `createDispatcher` + `main.ts` + `build:core`

**Files:**
- Create: `src/core/dispatcher.ts`
- Create: `src/core/main.ts`
- Modify: `package.json` (script `build:core`, incluir no `build`)
- Test: `tests/core/dispatcher.test.ts` (criar)

**Interfaces:**
- Consumes: `SessionCore` (Task 3).
- Produces: `CoreCommand`/`CoreEvent` (union types); `createDispatcher(emit, makeCore?)` retornando `(cmd: CoreCommand) => void`; `dist/core/main.js` (bundle Node standalone).

- [ ] **Step 1: Write the failing test**

Criar `tests/core/dispatcher.test.ts` — com um `SessionCore` fake injetado (sem fs):

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDispatcher, type CoreEvent } from '../../src/core/dispatcher';

function fakeCore(over: Partial<Record<string, any>> = {}) {
  return {
    pruneBridge: vi.fn(), setPinnedSession: vi.fn(), dispose: vi.fn(),
    buildSnapshot: () => ({ sessionId: 's', cwd: '/p', title: 'T', pinned: false, agents: [] }),
    listSessions: () => [{ sessionId: 's', cwd: '/p', title: 'T', updatedAt: 1 }],
    activeCwd: () => '/p',
    getProjectUsage: () => ({ sessions: 1, byModel: [], byAgentType: [] }),
    resolveTodoSource: (_s: string, a: string) => a === 's' ? { filePath: '/p/s.jsonl', line: 2 } : null,
    onChange: (_l: () => void) => ({ dispose: vi.fn() }),
    observeForNotifications: () => ({ kinds: [], awaitingInput: null, title: 'T' }),
    shouldPollNotifications: () => false,
    ...over,
  } as any;
}

function run(cmds: any[], core = fakeCore()) {
  const events: CoreEvent[] = [];
  const dispatch = createDispatcher((e) => events.push(e), () => core);
  for (const c of cmds) dispatch(c);
  return events;
}

describe('createDispatcher', () => {
  it('errors when a command arrives before init', () => {
    expect(run([{ cmd: 'getSnapshot' }])).toEqual([{ ev: 'error', message: 'not initialized' }]);
  });

  it('getSnapshot emits the snapshot after init', () => {
    const events = run([{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }, { cmd: 'getSnapshot' }]);
    expect(events).toEqual([{ ev: 'snapshot', snapshot: { sessionId: 's', cwd: '/p', title: 'T', pinned: false, agents: [] } }]);
  });

  it('resolveTodoSource emits todoSource (or null filePath when unresolved)', () => {
    const base = [{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }];
    expect(run([...base, { cmd: 'resolveTodoSource', sessionId: 's', agentId: 's', line: 2 }]).at(-1))
      .toEqual({ ev: 'todoSource', filePath: '/p/s.jsonl', line: 2 });
    expect(run([...base, { cmd: 'resolveTodoSource', sessionId: 's', agentId: 'x', line: 0 }]).at(-1))
      .toEqual({ ev: 'todoSource', filePath: null });
  });

  it('listSessions and getProjectUsage emit their events', () => {
    const base = [{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }];
    expect(run([...base, { cmd: 'listSessions' }]).at(-1)).toEqual({ ev: 'sessions', sessions: [{ sessionId: 's', cwd: '/p', title: 'T', updatedAt: 1 }] });
    expect(run([...base, { cmd: 'getProjectUsage' }]).at(-1)).toEqual({ ev: 'projectUsage', usage: { sessions: 1, byModel: [], byAgentType: [] } });
  });

  it('watch:true wires onChange to emit snapshots', () => {
    let fire: (() => void) | null = null;
    const core = fakeCore({ onChange: (l: () => void) => { fire = l; return { dispose: vi.fn() }; } });
    const events: CoreEvent[] = [];
    const dispatch = createDispatcher((e) => events.push(e), () => core);
    dispatch({ cmd: 'init', claudeDir: '/c', cwds: ['/p'] });
    dispatch({ cmd: 'watch', on: true });
    fire!();
    expect(events.at(-1)).toEqual({ ev: 'snapshot', snapshot: { sessionId: 's', cwd: '/p', title: 'T', pinned: false, agents: [] } });
  });

  it('unknown command emits an error', () => {
    const events = run([{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }, { cmd: 'nope' } as any]);
    expect(events.at(-1)).toEqual({ ev: 'error', message: 'unknown command: nope' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/dispatcher.test.ts`
Expected: FAIL — `dispatcher.ts` não existe.

- [ ] **Step 3: Implement the dispatcher**

Criar `src/core/dispatcher.ts`:

```ts
import { SessionCore, type SessionCoreDeps } from './sessionCore';
import type { SessionSnapshot, SessionSummary, ProjectUsage, AwaitingInput } from '../types';
import type { NotificationKind } from '../services/sessionNotifier';

export type CoreCommand =
  | { cmd: 'init'; claudeDir: string; cwds: string[] }
  | { cmd: 'getSnapshot' }
  | { cmd: 'watch'; on: boolean }
  | { cmd: 'getProjectUsage' }
  | { cmd: 'resolveTodoSource'; sessionId: string; agentId: string; line: number }
  | { cmd: 'setPinned'; sessionId: string | null }
  | { cmd: 'listSessions' };

export type CoreEvent =
  | { ev: 'snapshot'; snapshot: SessionSnapshot | null }
  | { ev: 'projectUsage'; usage: ProjectUsage | null }
  | { ev: 'todoSource'; filePath: string; line: number }
  | { ev: 'todoSource'; filePath: null }
  | { ev: 'sessions'; sessions: SessionSummary[] }
  | { ev: 'error'; message: string };

type MakeCore = (deps: SessionCoreDeps) => SessionCore;

export function createDispatcher(
  emit: (ev: CoreEvent) => void,
  makeCore: MakeCore = (deps) => new SessionCore(deps),
): (cmd: CoreCommand) => void {
  let core: SessionCore | null = null;
  let cwds: string[] = [];

  return (cmd: CoreCommand): void => {
    if (cmd.cmd === 'init') {
      cwds = cmd.cwds;
      core = makeCore({ claudeDir: cmd.claudeDir, workspaceCwds: () => cwds });
      return;
    }
    if (!core) { emit({ ev: 'error', message: 'not initialized' }); return; }
    switch (cmd.cmd) {
      case 'getSnapshot':
        emit({ ev: 'snapshot', snapshot: core.buildSnapshot() });
        break;
      case 'watch':
        if (cmd.on) core.onChange(() => emit({ ev: 'snapshot', snapshot: core!.buildSnapshot() }));
        break;
      case 'getProjectUsage':
        emit({ ev: 'projectUsage', usage: core.getProjectUsage() });
        break;
      case 'resolveTodoSource': {
        const t = core.resolveTodoSource(cmd.sessionId, cmd.agentId, cmd.line);
        emit(t ? { ev: 'todoSource', filePath: t.filePath, line: t.line } : { ev: 'todoSource', filePath: null });
        break;
      }
      case 'setPinned':
        core.setPinnedSession(cmd.sessionId);
        break;
      case 'listSessions':
        emit({ ev: 'sessions', sessions: core.listSessions() });
        break;
      default:
        emit({ ev: 'error', message: `unknown command: ${(cmd as { cmd: string }).cmd}` });
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/dispatcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `main.ts` (stdin/stdout shell)**

Criar `src/core/main.ts` — casca fina, sem lógica testável nova:

```ts
import * as readline from 'readline';
import { createDispatcher, type CoreCommand, type CoreEvent } from './dispatcher';

function emit(ev: CoreEvent): void {
  process.stdout.write(JSON.stringify(ev) + '\n');
}

const dispatch = createDispatcher(emit);
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let cmd: CoreCommand;
  try {
    cmd = JSON.parse(trimmed) as CoreCommand;
  } catch {
    emit({ ev: 'error', message: 'invalid json' });
    return;
  }
  try {
    dispatch(cmd);
  } catch (err) {
    emit({ ev: 'error', message: String(err) });
  }
});
```

- [ ] **Step 6: Add the `build:core` script**

Em `package.json`, na seção `scripts`, adicionar:

```json
"build:core": "esbuild src/core/main.ts --bundle --outfile=dist/core/main.js --format=cjs --platform=node",
```

e incluir no `build`:

```json
"build": "npm run build:ext && npm run build:hook && npm run build:core && npm run build:webview",
```

- [ ] **Step 7: Build and smoke-test the sidecar**

Run: `npm run build`
Expected: gera `dist/core/main.js` sem erros.

Smoke manual (opcional mas recomendado) — apontar para uma sessão real do próprio repo:

```bash
printf '%s\n%s\n' \
  '{"cmd":"init","claudeDir":"'"$HOME"'/.claude","cwds":["'"$PWD"'"]}' \
  '{"cmd":"listSessions"}' | node dist/core/main.js
```

Expected: uma linha `{"ev":"sessions","sessions":[...]}` com as sessões do projeto.

- [ ] **Step 8: Commit**

```bash
git add src/core/dispatcher.ts src/core/main.ts package.json tests/core/dispatcher.test.ts
git commit -m "feat(core): sidecar Node — dispatcher JSON-lines + main.ts + build:core (SP0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: verificação final + fechamento do SP0

**Files:**
- Modify: `docs/specs/2026-07-17-jetbrains-port-overview.md` (marcar SP0 como concluído)

- [ ] **Step 1: Full suite + build**

Run: `npm test` → Expected: todos verdes (266 + os novos de Task 1/2/3/5).
Run: `npm run build` → Expected: `dist/extension.js`, `dist/hooks/sessionStart.js`, `dist/core/main.js`, `dist/webview/*` — sem erros.

- [ ] **Step 2: Confirm zero `vscode` import in the shared layers**

Run: `grep -rl "from 'vscode'\|require('vscode')" src/services src/core` (ou o Grep tool)
Expected: **nenhum resultado**. Se algo aparecer, é um vazamento a corrigir antes de fechar.

- [ ] **Step 3: Mark SP0 done in the overview**

Em `docs/specs/2026-07-17-jetbrains-port-overview.md`, na tabela de decomposição, anotar SP0 como ✅ concluído (data + commits), no padrão do ROADMAP.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/2026-07-17-jetbrains-port-overview.md
git commit -m "docs(specs): SP0 concluído — core desacoplado + sidecar (porta JetBrains)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
