# Porta para JetBrains — visão geral e decomposição

**Origem:** decisão de produto 2026-07-17. Objetivo: **alcançar o público JetBrains**
(IntelliJ/PyCharm/Rider/WebStorm/… que roda Claude Code) publicando um plugin no JetBrains
Marketplace, com **paridade completa** de features com a extensão VS Code.

## Por que é viável

O acoplamento da extensão com a API do VS Code é pequeno e de borda. Só 6 dos ~25 arquivos
importam `vscode`, todos na camada de host (`extension.ts`, os dois providers, `todosWatcher`,
`localeResolver`, `webview/html.ts`). Toda a lógica de valor — `src/services/` (~1.500 linhas:
parsers de transcript, snapshot, notifier, usage) e `src/i18n/` — é TypeScript puro sem
dependência de IDE. A webview Svelte comunica só por `postMessage`, e sua ponte com o host
vive num único arquivo ([stores.svelte.ts](../../src/webview/stores.svelte.ts), linhas 11/23/52).

## Arquitetura escolhida: JCEF + sidecar Node (reuso máximo)

Três camadas, duas delas 100% reaproveitadas:

1. **Core compartilhado (TS — existe).** `src/services/` + `src/i18n/` empacotados num bundle
   Node autônomo `dist/core/main.js` (via esbuild, já usado). Fala um protocolo **JSON-lines
   por stdin/stdout**. Um parser só, servindo os dois IDEs.
2. **Webview compartilhada (Svelte — existe).** A mesma build roda nos dois. Ponte plugável:
   `vscodeBridge` (`acquireVsCodeApi`) e `jcefBridge` (`window.cefQuery` ↔ `JBCefJSQuery`),
   escolhida em runtime.
3. **Plugin Kotlin (novo).** `ToolWindowFactory` + `JBCefBrowser` renderiza a webview; spawna
   `node core.js`, encaminha `stdout → executeJavaScript(postMessage)`; pontes nativas para o
   que o JCEF não faz (notificações, abrir arquivo, quick pick).

**Premissa que sustenta a escolha:** quem roda Claude Code já tem Node instalado (o CLI é
distribuído via npm), então a dependência de runtime Node do sidecar é ~grátis para o
público-alvo.

## Decomposição em sub-projetos

Cada SP tem spec + plano + ciclo próprio e entrega software testável por si.

| SP | Escopo | Entregável | Toca código que já funciona? |
|----|--------|-----------|------------------------------|
| **SP0** | Desacoplar o core: `SessionCore` compartilhado, `todosWatcher` sem `vscode`, ponte da webview plugável, `src/core/main.ts` (protocolo JSON-lines) | ✅ **concluído 2026-07-18** (commits c766291..dd81781) — Extensão VS Code **idêntica** (regressão zero) + `core.js` sidecar rodável. Publicável como 0.16.0 sem mudança visível. | **Sim** — refactor interno, coberto por testes |
| **SP1** | Esqueleto Kotlin + JCEF renderizando o painel read-only (árvore + tokens + dashboard), servindo a build Svelte via custom scheme, spawn do sidecar, `jcefBridge`, watch ao vivo | 🚧 **implementado 2026-07-21 — smoke humano pendente (primeira execução real do caminho JCEF)** (commits f5c8984..ed05605) — Painel read-only funcional dentro do IntelliJ, instalável localmente | Não (código novo) |
| **SP2** | Pontes nativas: `Notifications.Bus` (toasts), `openTodoSource` → `FileEditorManager`, quick pick de sessão, instalação do hook, tela de boas-vindas | 🚧 **implementado 2026-07-21 — smoke humano pendente (junto com o gate do SP1)** — Paridade de features | Não |
| **SP3** | Empacotamento (bundle do `core.js` nos resources, detecção do `node`), CI Gradle, publicação no JetBrains Marketplace | Plugin publicado | Não |

**Ordem obrigatória:** SP0 → SP1 → SP2 → SP3 (cada um depende do anterior). SP0 é o único que
mexe no que já funciona, então recebe o maior cuidado (regressão zero é requisito).

## Riscos e mitigações

1. **`node` fora do PATH** — detecção graciosa no plugin + mensagem clara com instrução; sem
   fallback de bundlar node (peso). Público-alvo tem node. (SP1/SP3)
2. **JCEF indisponível** (`JBCefApp.isSupported()` — IDEs/distros antigas) — gate na abertura do
   tool window + mensagem. (SP1)
3. **Servir ES modules no JCEF** — a build Vite gera ES modules; `loadHTML` tropeça neles. Via
   robusta: custom scheme handler servindo os assets de `dist/webview`. (SP1)
4. **Dois toolchains no repo** (npm + Gradle/Kotlin) — CI com dois jobs; o plugin vive num
   subdiretório `jetbrains/`. (SP3)
5. **Walkthrough sem equivalente nativo** — JetBrains não tem `contributes.walkthroughs`.
   Divergência aceita: tela de boas-vindas dentro da própria webview, mesmo conteúdo. (SP2)
6. **Divergência de parser** — eliminada por construção: o core TS é a única fonte de verdade,
   compartilhada pelos dois IDEs.

## Divergências de feature aceitas (paridade "completa" com asteriscos)

- **Onboarding:** walkthrough nativo do VS Code → tela de boas-vindas na webview no JetBrains.
- **Títulos de comando localizados:** o VS Code resolve `package.nls.*` na inicialização; o
  JetBrains tem seu próprio mecanismo de bundle de mensagens (`resources bundle`). Equivalente,
  não idêntico.

## Fora de escopo (toda a porta)

- Reescrever a lógica em Kotlin (a arquitetura de sidecar evita isso deliberadamente).
- UI nativa Swing/Compose (a webview compartilhada é o ponto).
- Suporte a IDEs sem JCEF.
