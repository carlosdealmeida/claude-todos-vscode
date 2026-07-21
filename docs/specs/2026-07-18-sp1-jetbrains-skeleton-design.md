# SP1 — Esqueleto Kotlin + JCEF (painel read-only) — design

**Porta JetBrains, sub-projeto 1.** Ver [overview](2026-07-17-jetbrains-port-overview.md) ·
depende do SP0 (✅ concluído — `SessionCore` + sidecar `dist/core/main.js`).
**Entregável:** painel read-only funcional dentro de um IDE JetBrains (árvore de agentes +
tokens/contexto/cache + dashboard 7 dias, ao vivo), instalável localmente via `runIde`.

## Decisões (fechadas no brainstorm 2026-07-18)

1. **Assets: HTML inline via `loadHTML`** — a build da webview é um único `main.js` (78KB) +
   `index.css` (15KB), sem assets externos (verificado). O plugin gera UM html com
   `<style>` (index.css + shim de tema) e `<script type="module">` (main.js) inlinados.
   Sem custom scheme no SP1 (o overview assumia scheme antes desse dado; migrar só se a
   webview ganhar assets externos).
2. **IDE mínimo: 2024.2 (`sinceBuild=242`)** — JCEF/`JBCefJSQuery` maduros, JDK 17 atende.
3. **Plugin id estável: `com.carlosdealmeida.claude-todos`** (aprovado; não muda após publicar).
4. **Correlation-id no protocolo AGORA** (pendência da review final do SP0): comandos ganham
   `id?: string` opcional, ecoado no evento-resposta direto; pushes de watch não têm id.
   Feito antes do Kotlin ossificar em torno do shape atual.

## Estrutura

```
jetbrains/                          # toolchain isolado (risco 4 do overview)
  build.gradle.kts                  # IntelliJ Platform Gradle Plugin 2.x, Kotlin DSL
  settings.gradle.kts
  gradle/wrapper/…
  src/main/kotlin/com/carlosdealmeida/claudetodos/
    ClaudeTodosToolWindowFactory.kt
    SidecarProcess.kt
    WebviewPanel.kt
    MessageRouter.kt
    ThemeShim.kt
    NodeLocator.kt
  src/main/resources/
    META-INF/plugin.xml
    claudetodos/                    # preenchido pelo syncWebAssets (gitignored)
  src/test/kotlin/…                 # unit: MessageRouter, ThemeShim, HTML builder
```

## Componentes

### `ClaudeTodosToolWindowFactory`
Tool window "Claude Todos" (anchor right, ícone do projeto). Gates na abertura, nesta ordem:
1. `JBCefApp.isSupported()` — senão, painel Swing simples com mensagem (IDE sem JCEF).
2. `NodeLocator.find()` — procura `node` no PATH (e `node.exe` no Windows); senão, painel com
   instrução de instalação. Sem bundling de Node (premissa do overview: público já tem).
Passando os gates: cria `SidecarProcess` + `WebviewPanel` e conecta os dois via `MessageRouter`.

### `SidecarProcess` (project service, `Disposable`)
- Extrai `core/main.js` dos resources para um temp dir estável (idempotente por versão) e
  spawna `node <main.js>` com `GeneralCommandLine`.
- Envia `{cmd:'init', claudeDir: ~/.claude, cwds:[project.basePath]}` e `{cmd:'watch', on:true}`.
  (`~/.claude` respeita `CLAUDE_CONFIG_DIR` se setado — paridade com `resolveClaudeDir`.)
- Lê stdout linha a linha (JSON-lines) → callback de eventos; stderr → log (`Logger.getInstance`).
- Crash: **1 auto-restart**; segundo crash → estado de erro no painel (sem loop de restart).
- `dispose()`: fecha stdin (o sidecar morre sozinho — `persistent:false` + stdin EOF) e destrói
  o processo se não sair em ~2s.

### `WebviewPanel`
- `JBCefBrowser` + `loadHTML(buildHtml(css, themeVars, js))`.
- **JS → Kotlin:** `JBCefJSQuery` injetado ANTES do load (função `window.__jcefPost(json)`
  adicionada num `<script>` inicial gerado pelo `buildHtml`, ligando ao handler da query).
- **Kotlin → JS:** `cefBrowser.executeJavaScript("window.postMessage(<json>,'*')", url, 0)` —
  entrega como `message` event, simétrico ao VS Code (o `onMessage` da bridge não distingue).
- `buildHtml(css, themeVars, js)` é função pura (testável sem JCEF).

### `MessageRouter` (Kotlin puro, testável)
Traduz entre os três vocabulários (webview ↔ plugin ↔ sidecar):

| WebviewMessage (in) | Ação |
|---|---|
| `ready` | push `{type:'locale', locale}` + comando `getSnapshot` |
| `refresh` | comando `getSnapshot` |
| `projectUsage` | comando `getProjectUsage` |
| `openTodoSource` / `pickSession` / `openPanel` | no-op logado (SP2) |

| CoreEvent (in) | ExtensionMessage (out) |
|---|---|
| `{ev:'snapshot', snapshot}` | `{type:'snapshot', snapshot}` |
| `{ev:'projectUsage', usage}` | `{type:'projectUsage', usage}` |
| `{ev:'error', message}` | `{type:'error', message}` |
| `{ev:'sessions'/'todoSource'}` | ignorado no SP1 (sem consumidor) |

Serialização com kotlinx-serialization (`JsonObject` passthrough para o snapshot — o plugin
NÃO modela o schema do snapshot; repassa opaco. Só os envelopes são tipados).

### `ThemeShim`
- Mapa das **20 vars** `--vscode-*` usadas pela webview (lista fechada, verificada no
  `dist/webview/index.css`) → cores do LaF via `UIManager`/`JBColor`:
  `foreground`→`Label.foreground` · `font-family`/`size`→`Label.font` ·
  `descriptionForeground`→`Label.disabledForeground` · `panel-border`→`JBColor.border()` ·
  `list-hoverBackground`→`List.selectionBackground` com alpha · `focusBorder`→`Component.focusColor` ·
  `errorForeground`→`Label.errorForeground` · `badge-*`→`Badge`/fallback accent ·
  `sideBarSectionHeader-background`→`ToolWindow.Header.background` ·
  `textBlockQuote-background`→`EditorPane.inactiveBackground` ·
  `progressBar-background`→`ProgressBar.foreground` · `editor-font-family`→fonte do editor ·
  `testing-iconPassed`→verde fixo theme-aware · `charts-*`→paleta fixa (dark/light por
  `JBColor(light, dark)`).
  (Valores exatos são detalhe do plano; a spec fixa a REGRA: toda var tem valor nos dois
  temas, nenhuma fica undefined.)
- `LafManagerListener` → regenera as vars e re-empurra via
  `executeJavaScript` setando `document.documentElement.style` (sem reload da página).
- Locale: `Locale.getDefault()` → `pt`→`pt-br`, `es`→`es`, resto→`en` → `{type:'locale'}`.

### Correlation-id (mexe no TS do SP0 — única mudança fora de `jetbrains/`)
- `CoreCommand` ganha `id?: string`; `CoreEvent` de RESPOSTA direta ecoa o `id` quando o
  comando o trouxe (`getSnapshot`→`snapshot`, `getProjectUsage`→`projectUsage`,
  `listSessions`→`sessions`, `resolveTodoSource`→`todoSource`, e `error` de comando inválido).
  Eventos de push (watch) nunca têm `id`.
- Dispatcher: threading do id + testes (com e sem id; push sem id).
- A webview NÃO usa ids no SP1 (o padrão dela é estado idempotente); o Kotlin também não
  precisa deles no SP1 — a mudança existe para o protocolo não ossificar sem isso (SP2 usa
  em `resolveTodoSource`, que é request/reply de verdade).

### `jcefBridge` (TS, substitui o throw do SP0)
```ts
export function createJcefBridge(): WebviewBridge {
  return {
    post: (msg) => (window as any).__jcefPost(JSON.stringify(msg)),
    onMessage: (handler) => {
      window.addEventListener('message', (event) => handler((event as MessageEvent).data));
    },
  };
}
```
Detecção do `createBridge()` inalterada. Caveat: no VS Code o `event.data` chega como objeto;
no JCEF o Kotlin posta um objeto via `postMessage` também (o `executeJavaScript` monta
`window.postMessage(JSON.parse('…'), '*')`) — `onMessage` fica idêntico nos dois hosts.

## Pipeline dev

- Task Gradle `syncWebAssets`: copia `../dist/webview/{main.js,index.css}` e
  `../dist/core/main.js` para `src/main/resources/claudetodos/`; `processResources` depende
  dela; falha com mensagem clara se `../dist` não existe ("rode `npm run build` na raiz").
- `runIde` para o smoke manual. CI/packaging ficam no SP3.

## Testes

- **Kotlin (Gradle test, sem JCEF/IDE):** `MessageRouter` (todas as rotas das duas tabelas,
  inclusive ignorados/no-ops), `buildHtml` (inline correto, escapes, ordem script de bridge →
  css → app), `ThemeShim` (20/20 vars presentes nos dois temas, formato `#rrggbb`),
  `NodeLocator` (PATH hit/miss com dir temp).
- **TS:** dispatcher com `id` (eco em resposta, ausência em push, retrocompat sem id);
  `createJcefBridge` (post → `__jcefPost` mockado; onMessage round-trip).
- **Smoke manual (gate de aceite do SP1):** `./gradlew runIde`, abrir este repo, painel mostra
  as sessões reais ao vivo (mesmo critério do smoke do SP0, agora dentro do IDE).

## Fora de escopo (SP1)

- Notificações nativas, abrir transcript, picker de sessão, instalação de hook, tela de
  boas-vindas (SP2).
- CI Gradle, bundling final, marketplace (SP3).
- Settings do plugin (path do node custom, claudeDir custom) — SP2/SP3 conforme demanda.
- Suporte a multi-projeto aberto (cada projeto tem seu tool window + sidecar próprio — é o
  comportamento natural de project service; otimizações ficam pra depois).
