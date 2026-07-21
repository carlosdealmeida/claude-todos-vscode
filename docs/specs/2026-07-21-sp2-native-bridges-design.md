# SP2 — Pontes nativas JetBrains (paridade) — design

**Porta JetBrains, sub-projeto 2.** Ver [overview](2026-07-17-jetbrains-port-overview.md) ·
depende do SP1 (🚧 implementado — smoke humano pendente).
**Entregável:** paridade de features com a extensão VS Code — toasts nativos, clique no todo
abre o transcript, picker de sessão, instalação do hook com prompt de primeiro uso.

## Decisões (fechadas no brainstorm 2026-07-21)

1. **Tela de boas-vindas ADIADA para pós-SP3** — o prompt de hook no primeiro uso + os estados
   vazios existentes cobrem o onboarding; tela dedicada só se o feedback pós-publicação pedir.
2. **Sem timer no sidecar** — o loop de notificação é dirigido pelo host (paridade com o VS
   Code, onde `observeSession` roda no host): o Kotlin manda `{cmd:'observe'}` a cada evento
   `snapshot` recebido + um timer de 10s enquanto o tool window existir. O notifier
   (`SessionNotifier`, já no core) deduplica transições; gates de exibição são do host.
3. **Hook idempotente entre IDEs** — o plugin extrai o MESMO script para o MESMO path estável
   do VS Code (`~/.claude/.vscode-todos-bridge/hook.js`) e registra o MESMO comando
   (`node "<path>"`); `HookInstaller.install` já é idempotente por comando exato
   ([hookInstaller.ts:30](../../src/services/hookInstaller.ts#L30)) → instalar de um IDE é
   no-op no outro, zero duplicação no `settings.json`. **Escopo do claim:** a idempotência
   entre IDEs vale no setup default (`~/.claude`); com `CLAUDE_CONFIG_DIR` setado os dois IDEs
   do plugin respeitam a env, mas o host VS Code hoje NÃO a consulta (`resolveClaudeDir` usa
   setting/homedir) — paths podem divergir. Follow-up registrado: fazer `resolveClaudeDir` do
   VS Code consultar `CLAUDE_CONFIG_DIR` antes do homedir.

## Protocolo (TS) — 3 comandos novos, todos request/reply com id

| Comando | Resposta | Implementação no core |
|---|---|---|
| `{cmd:'observe', id?}` | `{ev:'notification', kinds, awaitingInput, title, id?}` (sempre responde; `kinds` pode ser vazio) | `SessionCore.observeForNotifications()` existente |
| `{cmd:'hookStatus', hookScriptPath, id?}` | `{ev:'hookStatus', installed: boolean, id?}` | novo `SessionCore.hookStatus(scriptPath)` → `HookInstaller.areAllInstalled(HOOK_EVENTS, 'node "<path>"')` |
| `{cmd:'installHook', hookScriptPath, id?}` | `{ev:'hookInstalled', id?}` (ou `error` com id) | novo `SessionCore.installHook(scriptPath)` → `installAll` |

- `HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit']` move de `extension.ts` para um export
  compartilhado (o `extension.ts` passa a importar — sem duplicar a constante).
- O comando do hook é montado no core com o MESMO formato do VS Code: `node "<scriptPath>"`
  (aspas para paths com espaço).
- `SessionCore.hookStatus/installHook` recebem o path por parâmetro — a objeção do SP0 ("path
  é do host") não se aplica; o `settings.json` continua derivado do `claudeDir` do core.
- VS Code NÃO muda de comportamento: `extension.ts` segue usando o `HookInstaller` direto
  (host-side, com `ensureStableHookScript`/prompt próprios); os métodos novos do core são
  consumidos apenas pelo sidecar. (Unificar o host VS Code nesses métodos é refactor futuro
  opcional, fora do SP2.)

## Kotlin

### `HookSetup`
- `syncWebAssets` (build.gradle.kts) passa a copiar também `../dist/hooks/sessionStart.js` →
  resources `claudetodos/hook.js` (e o `require` do guard passa a checá-lo).
- Runtime: copia o resource para `~/.claude/.vscode-todos-bridge/hook.js` (mesmo destino do
  VS Code; `mkdirs` + overwrite sempre, como o `ensureStableHookScript` faz) e devolve o path.
  Respeita `CLAUDE_CONFIG_DIR` para a base `~/.claude` (paridade com o resto).
- Fluxo de primeiro uso (no factory, após os gates): manda `hookStatus`; se `installed:false`
  e o flag `claudeTodos.hookPromptDismissed` (PropertiesComponent, application-level) não
  está setado → notificação **sticky** com três ações: Instalar (manda `installHook`; toast de
  confirmação/erro), Agora não (fecha), Não perguntar de novo (seta o flag). Paridade com
  `maybePromptInstallHook`.

### `NotificationBridge`
- `NotificationGroup` id `claude-todos` (balloon), registrado no `plugin.xml`
  (`<notificationGroup id="claude-todos" displayType="BALLOON"/>`).
- Recebe `{ev:'notification'}` já traduzido pelo router; gates NA EXIBIÇÃO (paridade com
  `maybeToast`): setting `claudeTodos.notifications` (PropertiesComponent, default true) ligado
  E nenhuma janela do IDE com foco (`WindowManager`/frame ativo). Detecção roda sempre (o
  observe não é gateado), só a exibição é.
- Prioridade de UM toast por ciclo: `allComplete` > `awaitingInput` (mensagem por
  `question`/`plan`) > `idle`. Ações: "Abrir painel" (ativa o tool window) e "Não notificar"
  (seta o setting para false).
- Strings ×3 (en/pt-br/es) num objeto Kotlin (`NotifyMessages`): os 6 textos do catálogo TS
  (`notify.idle`, `notify.allComplete`, `notify.awaitingQuestion`, `notify.awaitingPlan`,
  `notify.openPanel`, `notify.disable`) + os do prompt de hook (`hook.promptMessage`,
  `hook.install`, `hook.notNow`, `hook.dontAskAgain`, `hook.installedAuto`,
  `hook.installFailed`) + `todo.sourceMissing` (usada pelo `host.warn`). Mesmos textos das
  mensagens TS correspondentes — fonte: [messages.ts](../../src/i18n/messages.ts).

### `MessageRouter` estendido
- Construtor ganha `host: RouterHost` injetado:
  ```kotlin
  interface RouterHost {
      fun openFile(path: String, line: Int)
      fun pickSession(sessions: List<SessionItem>, onPick: (String?) -> Unit) // null = Auto
      fun onNotification(kinds: List<String>, awaitingInput: String?, title: String?)
      fun activatePanel()
      fun warn(messageKey: String)
  }
  data class SessionItem(val sessionId: String, val title: String, val updatedAt: Long)
  ```
- Rotas novas (webview → sidecar, com id gerado pelo router — contador interno):
  - `openTodoSource` → `{cmd:'resolveTodoSource', sessionId, agentId, line, id}`; resposta
    `todoSource` com aquele id: `filePath` presente → `host.openFile(filePath, line)`;
    `filePath:null` → `host.warn("todo.sourceMissing")`.
  - `pickSession` → `{cmd:'listSessions', id}`; resposta `sessions` com aquele id →
    `host.pickSession(itens, onPick)`; `onPick(sessionId|null)` → `{cmd:'setPinned', sessionId}` +
    `{cmd:'getSnapshot'}`.
  - `openPanel` → `host.activatePanel()` (deixa de ser no-op).
- Rota nova (sidecar → host): `{ev:'notification'}` → `host.onNotification(...)` (não vai
  para a webview).
- Eventos com id de requests que o router não originou (defensivo): ignorados.
- O router continua puro: `RouterHost` é interface; nos testes, lambdas capturadas.

### Loop de observe (factory)
- A cada `{ev:'snapshot'}` recebido, o router também manda `{cmd:'observe'}` (detecção
  event-driven, paridade com o `watcher.onChange → observeSession` do VS Code).
- Timer Swing de 10s (parado no dispose do tool window) manda `{cmd:'observe'}` — cobre o
  caso "silêncio venceu sem novo evento" (paridade com o `notifyTimer`). Sem otimização de
  `shouldPoll` no host JetBrains (o custo de um observe/10s é um build de snapshot; aceito
  no SP2, otimizar se incomodar).

### Picker
- `JBPopupFactory.createPopupChooserBuilder` com: item "Auto (sessão mais recente)" +
  sessões (`title · shortId(8) · tempo relativo`). Tempo relativo: helper Kotlin puro
  (`agora/Xmin/Xh/Xd`, mesmas faixas do `relativeTime` de extension.ts), testado.

## Fora de escopo (SP2)

- Tela de boas-vindas (adiada — decisão 1).
- Settings UI (Configurable) — PropertiesComponent basta.
- Refactor do host VS Code para usar `SessionCore.hookStatus/installHook`.
- Multi-root/multi-cwd no picker JetBrains (um `basePath` por projeto).
- CI Gradle, empacotamento, marketplace (SP3).
- Persistência do pin de sessão no JetBrains (hoje só na memória do sidecar; VS Code usa
  workspaceState) — follow-up: PropertiesComponent por projeto + setPinned pós-init.
- Detalhe do erro real no toast de falha de instalação do hook (assinatura Boolean descarta a
  mensagem) — junto com a UI de settings no backlog pós-SP3.

## Testes

- **TS (dispatcher):** `observe` responde `notification` com eco de id (kinds vazio e
  não-vazio); `hookStatus` true/false contra settings.json real em temp; `installHook`
  instala (verifica settings.json) e ecoa id; erro com id em `installHook` com path inválido
  não derruba o dispatcher.
- **TS (core):** `hookStatus`/`installHook` idempotentes; comando com o formato
  `node "<path>"` exato.
- **Kotlin (router):** cada rota nova com host fake (openFile com o line certo;
  warn no filePath null; pickSession → onPick → setPinned+getSnapshot; openPanel → activate;
  notification → host, não à webview; id de request desconhecido ignorado).
- **Kotlin (puro):** `NotifyMessages` — 3 locales × todas as chaves não-vazias; seleção de
  mensagem por prioridade de kinds; tempo relativo (faixas).
- **Smoke humano (junto com o gate do SP1):** clique num todo abre o `.jsonl` na linha;
  picker troca/pina sessão; toast aparece com a janela sem foco e ações funcionam; prompt de
  hook no primeiro uso instala e o painel passa a ver sessões novas.
