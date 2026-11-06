# Posicionamento e ativação da lista de tarefas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer quem instala o Claude Todos ligar `CLAUDE_CODE_ENABLE_TODO_TOOLS` nos primeiros minutos — notificação na ativação (VS Code e JetBrains), faixa no painel enquanto a flag estiver desligada, e vitrine que abre pela lista de tarefas.

**Architecture:** O snapshot passa a saber se algum agente chamou a ferramenta de lista (`listToolUsed`) e marca `taskToolsOff` mesmo com sub-agents; o webview desenha uma faixa quando há agentes e o estado vazio grande quando não há. No VS Code, um orquestrador puro (`runActivationPrompts`) encadeia o convite do hook e a notificação da flag. No JetBrains, uma `ProjectActivity` lê a flag em Kotlin e mostra a notificação ao abrir o projeto, numa fila por projeto que também serializa o convite do hook.

**Tech Stack:** TypeScript, Svelte 5 (webview), vitest, Playwright (shots), Kotlin + kotlinx-serialization + JUnit (plugin JetBrains).

**Spec:** [docs/specs/2026-11-05-posicionamento-e-ativacao-design.md](../specs/2026-11-05-posicionamento-e-ativacao-design.md)

## Global Constraints

- Idiomas: toda chave nova em **en, pt-br, es, zh-cn, zh-tw**, em `src/i18n/messages.ts` e, quando o host Kotlin usa, em `NotifyMessages.kt` (texto copiado verbatim do `messages.ts`, chave listada em `NotifyMessages.KEYS`).
- Toda gravação no `settings.json` passa por confirmação modal antes. `settings.json` presente e inválido (JSON quebrado, topo que não é objeto, `env` que não é objeto) **nunca** é sobrescrito: lança e o arquivo fica intacto.
- A leitura da flag é tolerante: arquivo ausente ou ilegível = `absent`. A ativação da extensão nunca falha por causa dela.
- Regras da flag, iguais nos dois leitores: valor `"1"`/`"true"` (string, número ou booleano, sem diferenciar caixa e com trim) = `on`; `"0"`/`"false"` = `off`; resto = `absent`. Qualquer fonte `on` vence; senão qualquer `off`; senão `absent`.
- A notificação só sai com a flag `absent` e sem a dispensa gravada. Flag `off` explícita conta como decisão do usuário.
- Chave da dispensa: `taskToolsPromptDismissed` (VS Code `globalState`) e `claudeTodos.taskToolsPromptDismissed` (JetBrains `PropertiesComponent` de aplicação).
- Nunca duas notificações-convite da extensão ao mesmo tempo.
- O tema Clássico não muda nenhum pixel nos casos de shot existentes.
- Os 5 READMEs mantêm **11 seções `## `** na mesma ordem; a seção 0 continua com ≥ 6 bullets.
- Gradle neste ambiente: `cd jetbrains && cmd //c "C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat" test --console=plain` (path absoluto; `npm run build` na raiz antes; `--offline` se a rede bloquear).

## Review Focus

1. `settings.json` inválido no momento da ativação: a notificação aparece (leitura tolerante = `absent`), e clicar em Ativar mostra o erro sem tocar no arquivo — Task 4 (Kotlin) cobre com teste; o TS já tem teste no `sessionCore.test.ts`.
2. Multi-root em que só uma pasta tem a flag `on` no `.claude/settings.local.json`: nenhuma notificação — Task 3.
3. Sub-agent que chamou `TodoWrite` com lista vazia (`todos: []`): sem faixa — Task 1.
4. Variável `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` no ambiente do processo do IDE (JetBrains aberto de um shell com export): nenhuma notificação — Task 4.
5. Convite do hook ignorado (toast foi para a central sem clique): a notificação da flag não sai nesta ativação e nada é gravado — Task 3.

---

## Mapa de arquivos

| Arquivo | Papel | Task |
|---|---|---|
| `src/services/todosParser.ts` | `listSessionDetail` devolve `listToolUsed` | 1 |
| `src/services/snapshotService.ts` | condição do `taskToolsOff` sem `agents.length === 0` | 1 |
| `src/types.ts` | comentário do `taskToolsOff` | 1 |
| `src/webview/lib/TaskToolsBanner.svelte` (novo) | faixa discreta | 2 |
| `src/webview/App.svelte` | faixa abaixo das perguntas pendentes | 2 |
| `scripts/themeShots/cases.ts` | caso `taskToolsBanner` | 2 |
| `src/services/taskToolsGate.ts` | `shouldOfferTaskTools` | 3 |
| `src/core/sessionCore.ts` | `taskToolsFlagState()` | 3 |
| `src/activationPrompts.ts` (novo) | orquestrador hook → flag | 3 |
| `src/extension.ts` | liga o orquestrador; `maybePromptInstallHook` devolve o resultado | 3 |
| `src/i18n/messages.ts` | chaves novas | 2, 3 |
| `jetbrains/.../TaskToolsFlag.kt` (novo) | leitura e gravação da flag em Kotlin | 4 |
| `jetbrains/.../PromptQueue.kt` (novo) | fila de convites + serviço de projeto | 5 |
| `jetbrains/.../TaskToolsStartupActivity.kt` (novo) | notificação ao abrir o projeto | 5 |
| `jetbrains/.../NotificationBridge.kt` | `promptHookInstall`/`promptTaskTools` com `onDone` | 5 |
| `jetbrains/.../ClaudeTodosToolWindowFactory.kt` | convite do hook pela fila | 5 |
| `jetbrains/.../NotifyMessages.kt` | `taskTools.promptMessage` | 5 |
| `jetbrains/src/main/resources/META-INF/plugin.xml` | `postStartupActivity` (5), descrição (6) | 5, 6 |
| `package.nls*.json`, `README*.md`, `CHANGELOG.md`, `docs/ROADMAP.md` | vitrine e registro | 6 |

---

### Task 1: Sinal `listToolUsed` e faixa com sub-agents no snapshot

**Files:**
- Modify: `src/services/todosParser.ts` (`listSessionDetail`, `listSubAgents`)
- Modify: `src/services/snapshotService.ts:123-131`
- Modify: `src/types.ts:116-118` (só o comentário)
- Test: `tests/services/todosParser.test.ts`, `tests/services/snapshotService.test.ts`, `tests/core/sessionCore.test.ts`

**Interfaces:**
- Produces: `TodosParser.listSessionDetail(...)` devolve `{ agents; awaitingInput; pendingQuestions; listToolUsed: boolean }`. `listToolUsed` = o transcript do main (sem sidechain) **ou** qualquer `agent-*.jsonl` da sessão (casado ou não) tem um `tool_use` de `TodoWrite`, `TaskCreate` ou `TaskUpdate` — o mesmo critério do `detectSchema` (`!== null`). Calcular a partir da varredura que `readLastTodosFromLines` já faz, sem reler o arquivo.
- Produces: `SessionSnapshot.taskToolsOff` passa a valer `!detail.listToolUsed && evaluateTaskTools(...)` — independente de `agents.length`.

- [ ] **Step 1: Testes que falham no parser**

Em `tests/services/todosParser.test.ts`, usando os helpers existentes (`writeTranscript`, `todoWriteEntry`, `writeSubAgent`/`writeSubAgentWithDispatch`):

```ts
it('listToolUsed is false when no agent ever called a list tool', () => {
  writeTranscript('s1', CWD, [{ type: 'user', message: { content: 'oi' } }]);
  expect(parser.listSessionDetail('s1', CWD).listToolUsed).toBe(false);
});
it('listToolUsed is true when only a sub-agent called TodoWrite, even with an empty list', () => {
  // main sem ferramenta de lista; sub-agent com todoWriteEntry([])
  expect(parser.listSessionDetail('s1', CWD).listToolUsed).toBe(true);
});
it('listToolUsed is true when the main used the Task schema', () => {
  // main com taskCreateToolUse(...)
  expect(parser.listSessionDetail('s1', CWD).listToolUsed).toBe(true);
});
it('listToolUsed ignores TodoWrite on main sidechain lines', () => {
  writeTranscript('s1', CWD, [todoWriteEntry([], { isSidechain: true })]);
  expect(parser.listSessionDetail('s1', CWD).listToolUsed).toBe(false);
});
```

E `returns empty when no transcript file exists` passa a esperar `listToolUsed: false` no retorno vazio.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/todosParser.test.ts`
Expected: FAIL — `listToolUsed` é `undefined`.

- [ ] **Step 3: Implementar `listToolUsed` em `todosParser.ts`**

- [ ] **Step 4: Testes do snapshot**

Em `tests/services/snapshotService.test.ts`: `makeParser` passa a devolver `listToolUsed: true` e `makeParserNoAgents`, `listToolUsed: false`; os dois stubs inline (linhas ~172 e ~201) recebem `listToolUsed: false`. Troque o teste `does not mark taskToolsOff once the session has task agents` por estes:

```ts
it('marks taskToolsOff with sub-agents that never called a list tool', () => {
  const sub = { sessionId: 'a', agentId: 'x', name: 'x', isMain: false, todos: [], updatedAt: 0 };
  const parser = { ...makeParserNoAgents({ a: 100 }),
    listSessionDetail: () => ({ agents: [sub], awaitingInput: null, pendingQuestions: [], listToolUsed: false }) };
  const svc = new SnapshotService(resolverA as any, parser as any, newModelUsage as any,
    () => new Map(), undefined, () => 0, { read: () => 'absent' as const });
  expect(svc.build()?.taskToolsOff).toBe(true);
});
it('does not mark taskToolsOff once any agent called a list tool', () => {
  const svc = new SnapshotService(resolverA as any, makeParser({ mtimes: { a: 100 } }) as any, newModelUsage as any,
    () => new Map(), undefined, () => 0, { read: () => 'absent' as const });
  expect(svc.build()?.taskToolsOff).toBeUndefined();
});
```

Em `tests/core/sessionCore.test.ts`, ponta a ponta com arquivos reais: sessão `2.1.261`/`claude-fable-5-1` (o `writeSessionOn` existente) **mais** um sub-agent casado sem ferramenta de lista → `buildSnapshot()?.taskToolsOff === true` e `agents.length > 0`.

- [ ] **Step 5: Implementar a condição em `snapshotService.ts`**

Trocar `agents.length === 0 &&` por `!detail.listToolUsed &&`. Atualizar o comentário do `taskToolsOff` em `types.ts`: "nenhum agente da sessão chamou TodoWrite/TaskCreate/TaskUpdate", sem falar em lista vazia.

- [ ] **Step 6: Rodar tudo**

Run: `npm test && npm run typecheck`
Expected: PASS. Se o `tests/scripts/casosPainel.test.ts` comparar o retorno de `listSessionDetail` por igualdade, atualizar a expectativa com o campo novo (o caso `principal-sem-lista-com-subagente` deve sair com `listToolUsed: false`).

- [ ] **Step 7: Commit**

```bash
git add src/services/todosParser.ts src/services/snapshotService.ts src/types.ts tests/
git commit -m "fix: dica das task tools aparece tambem em sessao com sub-agents"
```

---

### Task 2: Faixa no painel

**Files:**
- Create: `src/webview/lib/TaskToolsBanner.svelte`
- Modify: `src/webview/App.svelte:42-44` e `:52-73`
- Modify: `src/i18n/messages.ts` (5 idiomas)
- Modify: `scripts/themeShots/cases.ts`

**Interfaces:**
- Consumes: `snapshot.taskToolsOff` (Task 1); `todosStore.enableTaskTools()` existente.
- Produces: componente `TaskToolsBanner` sem props.

- [ ] **Step 1: Chaves novas**

| chave | en | pt-br |
|---|---|---|
| `app.taskToolsBanner.text` | `Task list is off in this Claude Code` | `Lista de tarefas desligada neste Claude Code` |
| `app.taskToolsBanner.button` | `Enable` | `Ativar` |

es, zh-cn e zh-tw traduzidos no tom das chaves `app.taskToolsOff.*` vizinhas. O `tests/i18n/messages.test.ts` trava a paridade.

- [ ] **Step 2: Componente e posição**

`TaskToolsBanner.svelte`: uma linha com o texto e um botão que chama `todosStore.enableTaskTools()`; `title` do botão = `app.taskToolsOff.hint` (diz o que vai ser gravado). Só tokens `--ct-*` (nada de `--vscode-*`), no mesmo molde visual da faixa de `PendingQuestions.svelte`. Em `App.svelte`, logo depois do bloco `{#if snapshot.pendingQuestions}`: `{#if snapshot.taskToolsOff && snapshot.agents.length > 0}<TaskToolsBanner />{/if}`. O ramo `{:else if snapshot.taskToolsOff}` do estado vazio grande fica como está.

- [ ] **Step 3: Caso de shot**

Em `cases.ts`, acrescentar `'taskToolsBanner'` ao `SHOT_CASES` e o caso `{ ...base, agents: base.agents.map(a => ({ ...a, todos: [] })), taskToolsOff: true }`.

- [ ] **Step 4: Verificar**

Run: `npm test && npm run check:svelte`
Expected: PASS, 0 erros do svelte-check.

Run: `npm run shots` (grava só as imagens que faltam — as do caso novo, em todos os temas) e depois `npm run shots -- --compare`.
Expected: `--compare` passa em todos os temas e casos; os casos antigos não mudam. Se não houver baseline local, gere antes a partir do commit anterior a esta task. Abra as imagens novas de `shots/baseline/*taskToolsBanner*` e confira, nos cinco temas, claro e escuro, que a faixa fica abaixo do cabeçalho, legível e sem cor do editor vazando.

- [ ] **Step 5: Commit**

```bash
git add src/webview/lib/TaskToolsBanner.svelte src/webview/App.svelte src/i18n/messages.ts scripts/themeShots/cases.ts
git commit -m "feat: faixa no painel enquanto as task tools estao desligadas"
```

---

### Task 3: Notificação na ativação do VS Code

**Files:**
- Modify: `src/services/taskToolsGate.ts`
- Modify: `src/core/sessionCore.ts`
- Create: `src/activationPrompts.ts`
- Modify: `src/extension.ts` (`activate` linha ~282, `maybePromptInstallHook`)
- Modify: `src/i18n/messages.ts`
- Test: `tests/services/taskToolsGate.test.ts`, `tests/core/sessionCore.test.ts`, `tests/activationPrompts.test.ts` (novo)

**Interfaces:**
- Produces: `shouldOfferTaskTools(flag: FlagState, dismissed: boolean): boolean` em `taskToolsGate.ts` — `flag === 'absent' && !dismissed`.
- Produces: `SessionCore.taskToolsFlagState(): FlagState` — `combineFlagStates` de `taskToolsFlags.read(null)` e de `taskToolsFlags.read(cwd)` para cada `workspaceCwds()`.
- Produces, em `src/activationPrompts.ts`:

```ts
export type HookPromptOutcome = 'not-needed' | 'installed' | 'install-failed' | 'not-now' | 'dismissed';
export interface ActivationPromptDeps {
  promptHook(): Promise<HookPromptOutcome>;        // só resolve quando há resposta; ignorado = nunca resolve
  confirmHookInstalled(): void;                    // o toast hook.installedAuto de hoje
  shouldOfferTaskTools(): boolean;                 // avaliado DEPOIS do convite do hook
  promptTaskTools(afterHook: boolean): Promise<void>;
}
export function runActivationPrompts(d: ActivationPromptDeps): Promise<void>;
```

Regra: `installed` + oferecer → `promptTaskTools(true)` **sem** `confirmHookInstalled`; `installed` sem oferecer → `confirmHookInstalled()`; os outros resultados + oferecer → `promptTaskTools(false)`.

- [ ] **Step 1: Testes que falham**

`tests/services/taskToolsGate.test.ts`:

```ts
it('offers the task tools only when the flag is absent and the prompt was not dismissed', () => {
  expect(shouldOfferTaskTools('absent', false)).toBe(true);
  expect(shouldOfferTaskTools('absent', true)).toBe(false);
  expect(shouldOfferTaskTools('on', false)).toBe(false);
  expect(shouldOfferTaskTools('off', false)).toBe(false);
});
```

`tests/core/sessionCore.test.ts` — core com `workspaceCwds: () => [CWD_A, CWD_B]` (pastas reais em tmp):
- nada gravado → `'absent'`;
- `{ env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } }` só em `CWD_B/.claude/settings.local.json` → `'on'`;
- `'0'` no `settings.json` do usuário → `'off'`;
- `settings.json` do usuário = `'{ broken'` → `'absent'` sem lançar;
- depois de `enableTaskTools()` → `'on'`.

`tests/activationPrompts.test.ts` (deps com `vi.fn`):

```ts
it('hook not needed → offers the task tools', ...)            // promptTaskTools chamado com false
it('hook installed → task tools prompt replaces the confirmation', ...)  // promptTaskTools(true), confirmHookInstalled não chamado
it('hook installed and nothing to offer → shows the confirmation', ...)  // confirmHookInstalled 1×, promptTaskTools 0×
it('hook not-now, dismissed or install-failed → offers afterwards', ...) // promptTaskTools(false) nos três
it('hook prompt ignored → task tools prompt never shows', async () => {
  const d = deps({ promptHook: () => new Promise(() => {}) });
  void runActivationPrompts(d);
  await new Promise(r => setTimeout(r, 0));
  expect(d.promptTaskTools).not.toHaveBeenCalled();
});
it('nothing to offer → no task tools prompt', ...)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/taskToolsGate.test.ts tests/core/sessionCore.test.ts tests/activationPrompts.test.ts`
Expected: FAIL — funções inexistentes.

- [ ] **Step 3: Implementar** `shouldOfferTaskTools`, `taskToolsFlagState` e `runActivationPrompts`.

- [ ] **Step 4: Chaves novas** (5 idiomas; es/zh-cn/zh-tw no tom das `taskTools.*` vizinhas)

| chave | en | pt-br |
|---|---|---|
| `taskTools.promptMessage` | `Claude Code 2.1.233+ turns the task list off by default on the newer models, so this panel's task list stays empty. Turn it back on?` | `O Claude Code 2.1.233+ desliga a lista de tarefas por padrão nos modelos novos, e a lista deste painel fica vazia. Ativar de volta?` |
| `taskTools.promptAfterHook` | `Hooks installed. One more step: Claude Code 2.1.233+ turns the task list off by default on the newer models, so this panel's task list stays empty. Turn it back on?` | `Hooks instalados. Falta um passo: o Claude Code 2.1.233+ desliga a lista de tarefas por padrão nos modelos novos, e a lista deste painel fica vazia. Ativar de volta?` |

Botões reaproveitam `taskTools.enable`, `hook.notNow` e `hook.dontAskAgain`.

- [ ] **Step 5: Ligar em `extension.ts`**

- `maybePromptInstallHook` passa a devolver `Promise<HookPromptOutcome>`: `'not-needed'` quando `autoInstallHook` está desligado, o hook já está instalado, o `settings.json` é ilegível ou o convite foi dispensado; `'installed'`/`'install-failed'` (o erro continua saindo dentro dela); `'dismissed'` em "Não perguntar mais"; `'not-now'` em "Agora não" **e** quando a notificação é fechada no X (`choice === undefined`). Ela deixa de mostrar o `hook.installedAuto` — isso vira o `confirmHookInstalled` do orquestrador.
- `activate` troca `void maybePromptInstallHook(...)` por `void runActivationPrompts({...})`, com `shouldOfferTaskTools: () => shouldOfferTaskTools(core.taskToolsFlagState(), context.globalState.get<boolean>('taskToolsPromptDismissed') === true)` e `promptTaskTools`: `showInformationMessage(t(afterHook ? 'taskTools.promptAfterHook' : 'taskTools.promptMessage'), t('taskTools.enable'), t('hook.notNow'), t('hook.dontAskAgain'))` → Ativar chama o `enableTaskTools()` existente (que já tem o modal); "Não perguntar mais" grava `taskToolsPromptDismissed = true`; o resto não grava nada.

- [ ] **Step 6: Verificar**

Run: `npm test && npm run typecheck`
Expected: PASS.

Manual (Extension Development Host, com um `CLAUDE_CONFIG_DIR`/`claudeTodos.claudeDir` de rascunho para não tocar no `~/.claude` real): sem hook e sem flag → convite do hook; Instalar → notificação "Hooks instalados. Falta um passo…" e nenhum toast "hooks instalados" separado; Ativar → modal → flag gravada. Reabrir com hook instalado e sem flag → notificação direta. "Não perguntar mais" → não volta.

- [ ] **Step 7: Commit**

```bash
git add src/services/taskToolsGate.ts src/core/sessionCore.ts src/activationPrompts.ts src/extension.ts src/i18n/messages.ts tests/
git commit -m "feat: VS Code oferece ligar as task tools na ativacao"
```

---

### Task 4: Leitura e gravação da flag em Kotlin

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/TaskToolsFlag.kt`
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/TaskToolsFlagTest.kt`

**Interfaces:**
- Produces:

```kotlin
enum class FlagState { ON, OFF, ABSENT }
object TaskToolsFlag {
    const val ENV = "CLAUDE_CODE_ENABLE_TODO_TOOLS"
    fun stateOf(value: JsonElement?): FlagState
    fun combine(states: List<FlagState>): FlagState
    fun readFile(file: File): FlagState                 // tolerante: ausente/ilegível = ABSENT
    fun read(env: Map<String, String>, userSettings: File, projectBase: String?): FlagState
        // env + userSettings + <base>/.claude/settings.json + <base>/.claude/settings.local.json
    fun enable(settings: File): Boolean                 // true = arquivo mudou; lança IllegalStateException se inválido
}
```

`enable`: arquivo ausente → cria `{"env":{"CLAUDE_CODE_ENABLE_TODO_TOOLS":"1"}}` (com as pastas); presente → preserva todas as outras chaves e a ordem delas (`JsonObject` mantém a inserção), acrescenta/troca só `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"`; já `"1"` → `false` sem gravar. Saída com indentação de 2 espaços, como o `JSON.stringify(_, null, 2)` do TS. Gravação atômica: arquivo temporário na mesma pasta + `Files.move(..., ATOMIC_MOVE, REPLACE_EXISTING)`.

- [ ] **Step 1: Testes que falham** (pastas em `createTempDirectory`)

```kotlin
@Test fun `stateOf segue as regras do TS`() {
    assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive("1")))
    assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive(" TRUE ")))
    assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive(1)))
    assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive(true)))
    assertEquals(FlagState.OFF, TaskToolsFlag.stateOf(JsonPrimitive("0")))
    assertEquals(FlagState.OFF, TaskToolsFlag.stateOf(JsonPrimitive(false)))
    assertEquals(FlagState.ABSENT, TaskToolsFlag.stateOf(null))
    assertEquals(FlagState.ABSENT, TaskToolsFlag.stateOf(JsonPrimitive("yes")))
}
@Test fun `on vence off e off vence ausente`()
@Test fun `variavel de ambiente ligada basta`()               // env = mapOf(ENV to "1"), sem arquivos → ON
@Test fun `settings local do projeto conta`()                 // só <base>/.claude/settings.local.json com "1" → ON
@Test fun `arquivo ilegivel conta como ausente`()             // userSettings = "{ broken" → ABSENT, sem lançar
@Test fun `enable cria o arquivo quando ausente`()
@Test fun `enable preserva as outras chaves e e idempotente`() // {"hooks":{},"model":"opus","env":{"X":"y"}} → mesmas chaves + flag; 2ª chamada false
@Test fun `enable lanca com json invalido e nao toca no arquivo`() // "{ broken" → assertFailsWith<IllegalStateException>; conteúdo idêntico
@Test fun `enable lanca quando env nao e objeto`()              // {"env":[1]} → lança; conteúdo idêntico
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd jetbrains && cmd //c "C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat" test --tests "*TaskToolsFlagTest" --console=plain`
Expected: FAIL de compilação — `TaskToolsFlag` inexistente.

- [ ] **Step 3: Implementar `TaskToolsFlag.kt`**

- [ ] **Step 4: Rodar e ver passar**

Mesmo comando. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/TaskToolsFlag.kt jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/TaskToolsFlagTest.kt
git commit -m "feat(jetbrains): leitura e gravacao da flag das task tools em Kotlin"
```

---

### Task 5: Notificação ao abrir o projeto no JetBrains

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/PromptQueue.kt`
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/TaskToolsStartupActivity.kt`
- Modify: `NotificationBridge.kt`, `ClaudeTodosToolWindowFactory.kt:175-190`, `NotifyMessages.kt`, `plugin.xml`
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/PromptQueueTest.kt`

**Interfaces:**
- Consumes: `TaskToolsFlag.read/enable` (Task 4); `HookSetup.settingsPath()`; `LocaleResolver.resolve(Locale.getDefault())`.
- Produces:

```kotlin
class PromptQueue {
    // Roda `show` na hora se nada estiver na tela; senão enfileira. `show` recebe `done`,
    // que libera o próximo; chamar `done` mais de uma vez não tem efeito. Thread-safe.
    fun enqueue(show: (done: () -> Unit) -> Unit)
}
@Service(Service.Level.PROJECT) class ClaudeTodosPrompts { val queue = PromptQueue() }

// NotificationBridge
fun promptHookInstall(onInstall: () -> Unit, onDone: () -> Unit)   // dispensado → onDone() na hora
fun promptTaskTools(onEnable: () -> Unit, onDone: () -> Unit)      // dispensado → onDone() na hora
```

`onDone` é ligado com `notification.whenExpired { onDone() }`; as ações `createSimpleExpiring` expiram a notificação ao clicar. Fechar no X não expira: o próximo convite espera, como a regra do "ignorado" no VS Code.

- [ ] **Step 1: Testes da fila que falham**

```kotlin
@Test fun `fila vazia mostra na hora`()
@Test fun `segundo espera o done do primeiro`()        // dois enqueue; só o 1º rodou; done() → 2º roda
@Test fun `done repetido nao pula ninguem`()            // três enqueue; done do 1º chamado 2× → só o 2º rodou
@Test fun `show que chama done na hora libera o proximo`()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd jetbrains && cmd //c "C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat" test --tests "*PromptQueueTest" --console=plain`
Expected: FAIL de compilação.

- [ ] **Step 3: Implementar `PromptQueue` e `ClaudeTodosPrompts`**

- [ ] **Step 4: Notificação e atividade**

- `NotifyMessages`: chave `taskTools.promptMessage` (texto verbatim do `messages.ts`, Task 3) em `KEYS` e nos 5 idiomas. Botões: `taskTools.enable`, `hook.notNow`, `hook.dontAskAgain`.
- `NotificationBridge.promptTaskTools`: grupo `claude-todos-sticky`; Ativar → `onEnable()`; Agora não → nada; Não perguntar mais → `props.setValue("claudeTodos.taskToolsPromptDismissed", true)`. `promptHookInstall` ganha o `onDone` no mesmo molde.
- `TaskToolsStartupActivity : ProjectActivity` (`suspend fun execute(project)`): se `TaskToolsFlag.read(System.getenv(), File(HookSetup.settingsPath()), project.basePath) != ABSENT`, sai. Senão, na EDT, `project.service<ClaudeTodosPrompts>().queue.enqueue { done -> bridge.promptTaskTools(onEnable = ::confirmAndEnable, onDone = done) }`. `confirmAndEnable`: `Messages.showYesNoDialog` com `taskTools.confirm` (path = `HookSetup.settingsPath()`), `taskTools.enable` e `taskTools.cancel`; no Sim, `TaskToolsFlag.enable(...)` → `bridge.notify("taskTools.enabled" | "taskTools.alreadyEnabled", ...)`; exceção → `bridge.notify("taskTools.failed", mapOf("path" to ..., "error" to e.message), ERROR)`. O `NotificationBridge` é criado com `activatePanel` que ativa a tool window `"Claude Todos"` via `ToolWindowManager`.
- `plugin.xml`: `<postStartupActivity implementation="com.carlosdealmeida.claudetodos.TaskToolsStartupActivity"/>`.
- `ClaudeTodosToolWindowFactory`: o convite do hook entra pela mesma fila — `queue.enqueue { done -> bridge.promptHookInstall(onInstall = {...como hoje...}, onDone = done) }`. A confirmação `confirmHookInstalled` fica como está (balão comum, não é convite).

- [ ] **Step 5: Verificar**

Run: `npm run build` na raiz e depois `cd jetbrains && cmd //c "C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat" test verifyPlugin --console=plain`
Expected: BUILD SUCCESSFUL; `NotifyMessagesTest` verde com a chave nova; verifyPlugin sem erros de compatibilidade.

O plugin sai sem teste num IDE real, pela decisão de 2026-11-03 (item 26 do ROADMAP). Registre isso no commit.

- [ ] **Step 6: Commit**

```bash
git add jetbrains/
git commit -m "feat(jetbrains): oferece ligar as task tools ao abrir o projeto"
```

---

### Task 6: Vitrine, CHANGELOG e ROADMAP

**Files:**
- Modify: `package.nls.json`, `package.nls.pt-br.json`, `package.nls.es.json`, `package.nls.zh-cn.json`, `package.nls.zh-tw.json` (`extension.description`)
- Modify: `jetbrains/src/main/resources/META-INF/plugin.xml` (`<description>`, en e zh-cn)
- Modify: `README.md`, `README.en.md`, `README.es.md`, `README.zh-cn.md`, `README.zh-tw.md`
- Modify: `CHANGELOG.md` (`## [Unreleased]`), `docs/ROADMAP.md`

- [ ] **Step 1: Descrição das lojas**

en (verbatim): `Live task list for your Claude Code agents, with agent tree, tokens and cache — scoped to your workspace. Claude Code 2.1.233+: task tools are off by default; the extension turns them on in one click.`
pt-br: `Lista de tarefas ao vivo dos seus agentes Claude Code, com árvore de agentes, tokens e cache — restrita ao workspace. Claude Code 2.1.233+: as ferramentas de tasks vêm desligadas por padrão; a extensão liga com um clique.`
es, zh-cn, zh-tw: tradução dessas duas. No `plugin.xml`, o primeiro parágrafo em en e em zh-cn passa a abrir pela lista ao vivo, e o parágrafo da 2.1.233 cita que o plugin oferece ligar ao abrir o projeto (mantendo o caminho manual e o link do README).

- [ ] **Step 2: READMEs**

- Tagline (a linha em negrito antes da 1ª seção; a landing extrai o trecho em negrito como título). pt-br: `**A lista de tarefas dos seus agentes Claude Code, ao vivo** — com árvore de agentes, tempos, tokens e cache, restrito ao workspace aberto na janela atual do VSCode. Tudo 100% local: duas janelas em projetos diferentes nunca veem os dados uma da outra.` Os outros quatro na mesma forma.
- Aviso ⚠️: mantém o texto atual e acrescenta que a extensão oferece ligar com um clique ao ser instalada e mostra uma faixa no painel enquanto estiverem desligadas; o link para Instalação continua.
- "O que você vê": o bullet **Tasks em tempo real** sobe para o primeiro; **Árvore de agentes ao vivo** vira o segundo. Nenhuma seção nova.

- [ ] **Step 3: CHANGELOG** em `## [Unreleased]`, no formato das entradas anteriores (negrito + frase do ponto de vista do usuário):
- Added: notificação na instalação (VS Code ao abrir a janela, JetBrains ao abrir o projeto) para ligar a lista; faixa no painel enquanto ela estiver desligada.
- Fixed: a dica das task tools não aparecia em sessões com sub-agents.
- Changed: descrição das lojas e README abrem pela lista de tarefas.

- [ ] **Step 4: ROADMAP**

- R2 passo 3: ✅ decidido em 2026-11-05, link para a spec, com o resumo (a lista é o coração; o "observability" do item 18 desfeito em parte).
- R2 passo 1: lacuna (a) corrigida; lacuna (b) fica.
- R2 passo 2: checkbox da descrição curta marcado.
- Itens 8 e 23: status sem "bloqueado por posicionamento" — backlog comum. Item 25(b): continua parado, com o motivo da spec. `update_plan`: backlog, prioridade baixa.
- Nota na "Fila de brainstorming" (seção Apostas de produto) com a data e a decisão.

- [ ] **Step 5: Verificar**

Run: `npm test`
Expected: PASS, incluindo `tests/site/readmeParity.test.ts` (11 seções, ≥ 6 bullets na seção 0), `tests/site/extractLanding.test.ts` e `tests/i18n/packageNls.test.ts`.

Run: `cd site && npm run build`
Expected: build ok (o `prebuild` regenera `src/generated/landing.json`, que fica fora do git); abrir `site/dist/index.html` e conferir que o título da landing é o novo.

- [ ] **Step 6: Commit**

```bash
git add package.nls*.json jetbrains/src/main/resources/META-INF/plugin.xml README*.md CHANGELOG.md docs/ROADMAP.md
git commit -m "docs: vitrine abre pela lista de tarefas e roadmap com a decisao de posicionamento"
```
