# SP0 — Core compartilhado (SessionCore + sidecar) — design

**Porta JetBrains, sub-projeto 0.** Ver [overview](2026-07-17-jetbrains-port-overview.md).
**Requisito não-negociável: regressão zero na extensão VS Code.** O comportamento observável
não muda; isto é um refactor de extração que faz nascer um `core.js` sidecar rodável.

## Problema

A fiação dos services e o loop `watch → snapshot → observe → notificação` vivem inline no
`activate()` de [extension.ts](../../src/extension.ts), amarrados à API do VS Code. O sidecar
Node do plugin JetBrains precisa da **mesma** orquestração. Duplicá-la faria a lógica divergir
a cada feature nova — exatamente o que a arquitetura de core único quer evitar.

## Decisões

### 1. `SessionCore` — orquestrador puro compartilhado

Nova classe em `src/core/sessionCore.ts`, **sem importar `vscode`**, que encapsula a fiação e
o loop. Consumida por `extension.ts` (host VS Code) e por `src/core/main.ts` (sidecar).

**Construtor (dependências injetadas):**
```ts
interface SessionCoreDeps {
  claudeDir: string;
  workspaceCwds: () => string[];   // VS Code: workspaceFolders; sidecar: cwds do 'init'
  now?: () => number;              // default Date.now; injetável para testes
}
```

**Superfície pública:**
```ts
class SessionCore {
  constructor(deps: SessionCoreDeps);
  setPinnedSession(sessionId: string | null): void;
  buildSnapshot(): SessionSnapshot | null;
  listSessions(): SessionSummary[];
  getProjectUsage(): ProjectUsage | null;
  // Resolve e VALIDA (SAFE_SESSION_ID, path traversal) — devolve o alvo, NÃO abre:
  resolveTodoSource(sessionId: string, agentId: string, line: number): { filePath: string; line: number } | null;
  // Watcher: registra listener; começa/para o fs.watch internamente.
  onChange(listener: () => void): void;
  dispose(): void;
  // Notificações: encapsula o SessionNotifier. Decide O QUE disparar (não COMO):
  observeForNotifications(): { kinds: NotificationKind[]; awaitingInput: AwaitingInput | null };
  shouldPollNotifications(): boolean;
}
```

- **O que fica FORA do core (é do host):** os gates de exibição (`setting notifications` +
  `window.focused`), o texto do toast, o timer de polling (cada host arma o seu), a ação de
  **abrir** o arquivo, e **toda a instalação de hook** (depende de `context`/paths do host —
  no VS Code o `hookScriptPath` vem de `ensureStableHookScript(context,…)`; o hook do JetBrains é
  problema do SP2). O core só decide/resolve; o host exibe/age. Isso preserva o `SessionNotifier`
  já testado como está.
- **Migração do `extension.ts`:** a fiação inline (bridge, parser, usageParser,
  projectUsageService, resolver, snapshotService, notifier, watcher) e as funções
  `observeSession`/`resolveTodoSource`/`workspaceCwds` movem para dentro do `SessionCore`. O
  `extension.ts` passa a: instanciar o core, ligar `onChange` aos pushes da webview + ao loop de
  toast (mantendo `maybeToast` com os gates), e mapear os comandos para os métodos do core. O
  `HookInstaller`, a limpeza de hooks legados e o `ensureStableHookScript` **permanecem intactos
  no `extension.ts`** — o SP0 não os toca.

### 2. `todosWatcher` sem `vscode`

Trocar `vscode.EventEmitter`/`vscode.Disposable` ([todosWatcher.ts](../../src/services/todosWatcher.ts)
linhas 1, 7-9) por `events.EventEmitter` do Node. Superfície pública preservada: mantém
`onChange(listener)` e `dispose()`. Como `vscode.Disposable` é estruturalmente `{ dispose(): void }`,
`context.subscriptions.push(watcher)` continua válido sem mudança. O `fs.watch`, o debounce e o
fallback recursivo→não-recursivo ficam idênticos.

### 3. Ponte da webview plugável

Extrair de [stores.svelte.ts](../../src/webview/stores.svelte.ts) um módulo
`src/webview/bridge.ts`:
```ts
export interface WebviewBridge {
  post(msg: WebviewMessage): void;
  onMessage(handler: (msg: ExtensionMessage) => void): void;
}
export function createBridge(): WebviewBridge; // detecta o host em runtime
```
- `createVscodeBridge()` — `acquireVsCodeApi()` + `window.addEventListener('message')` (a lógica
  atual, movida sem alteração de comportamento).
- Detecção: `typeof acquireVsCodeApi !== 'undefined'` → vscode; senão, JCEF. **No SP0 só a impl
  vscode existe**; o ramo JCEF lança um erro explícito ("jcef bridge chega no SP1"). Isso mantém
  o SP0 completo e honesto: a extensão funciona idêntica, e a costura para o JCEF está pronta
  sem código especulativo não-testável.
- `TodosStore` recebe a bridge de `createBridge()` em vez de falar com `acquireVsCodeApi`
  diretamente; nenhuma mudança de comportamento.

### 4. `src/core/main.ts` — sidecar (protocolo JSON-lines)

Entry do processo Node. Uma casca fina de stdin/stdout sobre um **dispatcher puro testável**.

- **Separação para teste:** `createDispatcher(core, emit)` (puro — recebe um comando decodificado
  e uma função `emit`) fica isolado da leitura de stdin/escrita de stdout. Testável sem spawnar
  processo.
- **Comandos (stdin, um JSON por linha):**
  `{cmd:'init', claudeDir, cwds}` · `{cmd:'getSnapshot'}` · `{cmd:'watch', on:boolean}` ·
  `{cmd:'getProjectUsage'}` · `{cmd:'resolveTodoSource', sessionId, agentId, line}` ·
  `{cmd:'setPinned', sessionId}` · `{cmd:'listSessions'}`.
  (Instalação de hook não entra no protocolo do SP0 — é do SP2.)
- **Eventos (stdout, um JSON por linha):**
  `{ev:'snapshot', snapshot}` · `{ev:'projectUsage', usage}` ·
  `{ev:'notification', kinds, awaitingInput}` · `{ev:'todoSource', filePath, line}` ·
  `{ev:'sessions', sessions}` · `{ev:'error', message}`.
- **Watch + notificações:** com `watch:true` o sidecar liga `core.onChange` → emite `snapshot`;
  roda seu próprio `setInterval` de 10s espelhando `observeSession` do host, emitindo
  `notification` quando `observeForNotifications` retorna algo. Os gates (foco/setting) são do
  plugin, não do sidecar.
- **cwds no sidecar:** o `workspaceCwds()` do core devolve os `cwds` recebidos no `init` (o plugin
  Kotlin passa o base path do projeto). No VS Code segue vindo de `workspaceFolders`.

### 5. Build

Novo script em `package.json`:
`"build:core": "esbuild src/core/main.ts --bundle --outfile=dist/core/main.js --format=cjs --platform=node"`,
adicionado ao `build`. O `core.js` é standalone (só depende do runtime Node).

## Testes

- **`SessionCore`** — claudeDir temp (padrão dos testes de service atuais): `buildSnapshot`,
  `listSessions`, `getProjectUsage`, `resolveTodoSource` (inclui rejeição por `SAFE_SESSION_ID`),
  `observeForNotifications`/`shouldPollNotifications` (com `now` injetado). `onChange` dispara em
  mudança de arquivo (fs real em temp, como hoje).
- **`todosWatcher`** — os testes existentes seguem passando (superfície preservada); adicionar um
  que confirma `onChange` + `dispose` sem `vscode`.
- **`createDispatcher`** — cada comando produz o evento certo; `error` em comando inválido; ordem
  `init` antes dos demais.
- **`bridge`** — `createVscodeBridge` (com `acquireVsCodeApi` mockado) faz round-trip post/onMessage;
  `createBridge` sem `acquireVsCodeApi` cai no ramo JCEF que lança o erro esperado.
- **Regressão VS Code** — a suíte inteira (266) permanece verde; `verify`/`preview-webview` do
  painel confirma comportamento idêntico após a migração do `extension.ts`.

## Fora de escopo (SP0)

- Qualquer código Kotlin/Gradle/JCEF (SP1+).
- A impl `jcefBridge` (SP1, quando há JCEF para testar).
- Mudança visível na extensão VS Code.
- Publicar 0.16.0 é opcional — o entregável é o core desacoplado, não um release.
