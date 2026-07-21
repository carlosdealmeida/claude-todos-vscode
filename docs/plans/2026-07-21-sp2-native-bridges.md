# SP2 — Pontes nativas JetBrains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paridade de features do plugin JetBrains: toasts nativos (idle/allComplete/awaitingInput), clique no todo abre o transcript na linha, picker de sessão nativo, instalação do hook com prompt de primeiro uso — idempotente com o VS Code.

**Architecture:** 3 comandos novos no protocolo (`observe`, `hookStatus`, `installHook` — request/reply com id; sem timer no sidecar). `SessionCore` ganha os 2 métodos de hook (path por parâmetro). No Kotlin: `MessageRouter` ganha `RouterHost` injetado + mapa de requests pendentes por id; `NotifyMessages`/`relativeTime` puros; `NotificationBridge` (2 notification groups) e `HookSetup`; factory liga tudo (popup, FileEditorManager, timer de observe 10s).

**Tech Stack:** os mesmos do SP1. Sem dependências novas.

**Spec:** [docs/specs/2026-07-21-sp2-native-bridges-design.md](../specs/2026-07-21-sp2-native-bridges-design.md)

## Global Constraints

- Zero regressão: `npm test` (290) e os 18 testes Kotlin existentes permanecem verdes; VS Code não muda de comportamento (só o import de `DEFAULT_HOOK_EVENTS`).
- Protocolo: os 3 comandos novos ecoam `id` na resposta direta (padrão `withId` existente); `observe` SEMPRE responde (kinds pode ser vazio).
- Comando de hook com formato EXATO do VS Code: `node "<scriptPath>"` (aspas). Destino do script: `<claudeDir>/.vscode-todos-bridge/hook.js` (claudeDir = `CLAUDE_CONFIG_DIR` || `~/.claude`).
- **Strings i18n no Kotlin: copiar VERBATIM de [src/i18n/messages.ts](../../src/i18n/messages.ts)** para os 3 locales — chaves: `notify.idle`, `notify.allComplete`, `notify.awaitingQuestion`, `notify.awaitingPlan`, `notify.openPanel`, `notify.disable`, `hook.promptMessage`, `hook.install`, `hook.notNow`, `hook.dontAskAgain`, `hook.installedAuto`, `hook.installFailed`, `todo.sourceMissing`, `picker.auto`, `time.now`, `time.minutesAgo`, `time.hoursAgo`, `time.daysAgo` (18 chaves). Interpolação `{x}` por replace.
- Kotlin puro testável (router, NotifyMessages, relativeTime) sem imports de IDE; ações nativas só na factory/bridge.
- Gates de exibição do toast NO HOST (setting `claudeTodos.notifications` via `PropertiesComponent` default true + frame do IDE sem foco); a detecção (observe) roda sempre.
- Gradle: `cmd //c "C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat" <task> --console=plain` com cwd=`jetbrains/`. npm na raiz.
- Commits pequenos, pt-BR, rodapé `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `DEFAULT_HOOK_EVENTS` compartilhado + `SessionCore.hookStatus/installHook` (TS)

**Files:**
- Modify: `src/services/hookInstaller.ts` (export da constante)
- Modify: `src/extension.ts:22` (usar o export)
- Modify: `src/core/sessionCore.ts` (2 métodos novos)
- Test: `tests/core/sessionCore.test.ts` (append)

**Interfaces:**
- Produces: `export const DEFAULT_HOOK_EVENTS: HookEvent[]` em hookInstaller.ts; `SessionCore.hookStatus(scriptPath: string): boolean`; `SessionCore.installHook(scriptPath: string): void`.

- [ ] **Step 1: Write the failing tests**

Append em `tests/core/sessionCore.test.ts` (dentro do describe `SessionCore`, reusando `claudeDir`/`make()` do arquivo):

```ts
it('hookStatus is false before install and true after installHook (idempotent)', () => {
  const core = make();
  const script = path.join(claudeDir, 'bridge-hook.js');
  expect(core.hookStatus(script)).toBe(false);

  core.installHook(script);
  expect(core.hookStatus(script)).toBe(true);

  core.installHook(script); // idempotente: não duplica
  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
  expect(settings.hooks.SessionStart).toHaveLength(1);
  expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
  expect(settings.hooks.SessionStart[0].hooks[0].command).toBe(`node "${script}"`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/core/sessionCore.test.ts`
Expected: FAIL — métodos não existem.

- [ ] **Step 3: Implement**

`src/services/hookInstaller.ts` — após o type `HookEvent`:

```ts
// Eventos que a extensão VS Code e o plugin JetBrains registram por padrão.
// Compartilhado entre o host (extension.ts) e o SessionCore (sidecar).
export const DEFAULT_HOOK_EVENTS: HookEvent[] = ['SessionStart', 'UserPromptSubmit'];
```

`src/extension.ts` — trocar a linha `const HOOK_EVENTS: HookEvent[] = ['SessionStart', 'UserPromptSubmit'];` por `const HOOK_EVENTS = DEFAULT_HOOK_EVENTS;` e ajustar o import: `import { HookInstaller, DEFAULT_HOOK_EVENTS, type HookEvent } from './services/hookInstaller';` (manter `HookEvent` se ainda referenciado; remover se órfão).

`src/core/sessionCore.ts` — import `{ HookInstaller, DEFAULT_HOOK_EVENTS }` de `../services/hookInstaller`; métodos (após `getProjectUsage`):

```ts
// Instalação de hook para o sidecar (JetBrains): o path do script vem do host;
// o comando tem o MESMO formato do VS Code — instalar de um IDE é no-op no outro.
hookStatus(scriptPath: string): boolean {
  return new HookInstaller(path.join(this.claudeDir, 'settings.json'))
    .areAllInstalled(DEFAULT_HOOK_EVENTS, `node "${scriptPath}"`);
}

installHook(scriptPath: string): void {
  new HookInstaller(path.join(this.claudeDir, 'settings.json'))
    .installAll(DEFAULT_HOOK_EVENTS, `node "${scriptPath}"`);
}
```

- [ ] **Step 4: Run tests + full suite**

Run: `npm test -- tests/core/sessionCore.test.ts` → PASS. `npm test` → 291+ PASS. `npm run build` → limpo.

- [ ] **Step 5: Commit**

```bash
git add src/services/hookInstaller.ts src/extension.ts src/core/sessionCore.ts tests/core/sessionCore.test.ts
git commit -m "feat(core): hookStatus/installHook no SessionCore + DEFAULT_HOOK_EVENTS compartilhado (SP2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: dispatcher — `observe`, `hookStatus`, `installHook` (TS)

**Files:**
- Modify: `src/core/dispatcher.ts`
- Test: `tests/core/dispatcher.test.ts` (append; o `fakeCore` ganha os 3 métodos)

**Interfaces:**
- Produces: `CoreCommand` += `{cmd:'observe'} | {cmd:'hookStatus'; hookScriptPath: string} | {cmd:'installHook'; hookScriptPath: string}`; `CoreEvent` += `{ev:'notification'; kinds: NotificationKind[]; awaitingInput: AwaitingInput | null; title: string | null} | {ev:'hookStatus'; installed: boolean} | {ev:'hookInstalled'}`.

- [ ] **Step 1: Write the failing tests**

No `fakeCore` de `tests/core/dispatcher.test.ts`, adicionar aos defaults:

```ts
observeForNotifications: () => ({ kinds: [], awaitingInput: null, title: 'T' }),
hookStatus: (_p: string) => false,
installHook: (_p: string) => {},
```

Append novo describe:

```ts
describe('observe / hookStatus / installHook', () => {
  const init = { cmd: 'init', claudeDir: '/c', cwds: ['/p'] };

  it('observe always answers, echoing the id, with empty kinds too', () => {
    expect(run([init, { cmd: 'observe', id: 'o1' }]).at(-1))
      .toEqual({ ev: 'notification', kinds: [], awaitingInput: null, title: 'T', id: 'o1' });
  });

  it('observe passes kinds and awaitingInput through', () => {
    const core = fakeCore({ observeForNotifications: () => ({ kinds: ['awaitingInput'], awaitingInput: 'plan', title: 'S' }) });
    expect(run([init, { cmd: 'observe' }], core).at(-1))
      .toEqual({ ev: 'notification', kinds: ['awaitingInput'], awaitingInput: 'plan', title: 'S' });
  });

  it('hookStatus answers installed with id', () => {
    const core = fakeCore({ hookStatus: () => true });
    expect(run([init, { cmd: 'hookStatus', hookScriptPath: '/h.js', id: 'h1' }], core).at(-1))
      .toEqual({ ev: 'hookStatus', installed: true, id: 'h1' });
  });

  it('installHook answers hookInstalled, and errors (with id) when the core throws', () => {
    expect(run([init, { cmd: 'installHook', hookScriptPath: '/h.js', id: 'i1' }]).at(-1))
      .toEqual({ ev: 'hookInstalled', id: 'i1' });
    const bad = fakeCore({ installHook: () => { throw new Error('boom'); } });
    expect(run([init, { cmd: 'installHook', hookScriptPath: '/h.js', id: 'i2' }], bad).at(-1))
      .toEqual({ ev: 'error', message: 'Error: boom', id: 'i2' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/core/dispatcher.test.ts` → FAIL (unknown command).

- [ ] **Step 3: Implement**

Em `src/core/dispatcher.ts`: imports adicionais —
`import type { AwaitingInput } from '../types';` e
`import type { NotificationKind } from '../services/sessionNotifier';`.
Tipos: adicionar os 3 membros de comando e os 3 de evento (shapes acima). Cases novos no switch:

```ts
case 'observe': {
  const o = core.observeForNotifications();
  emit(withId({ ev: 'notification', kinds: o.kinds, awaitingInput: o.awaitingInput, title: o.title }, cmd.id));
  break;
}
case 'hookStatus':
  emit(withId({ ev: 'hookStatus', installed: core.hookStatus(cmd.hookScriptPath) }, cmd.id));
  break;
case 'installHook':
  try {
    core.installHook(cmd.hookScriptPath);
    emit(withId({ ev: 'hookInstalled' }, cmd.id));
  } catch (err) {
    emit(withId({ ev: 'error', message: String(err) }, cmd.id));
  }
  break;
```

- [ ] **Step 4: Run tests + full suite**

Run: `npm test -- tests/core/dispatcher.test.ts` → PASS. `npm test` → tudo verde. `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/core/dispatcher.ts tests/core/dispatcher.test.ts
git commit -m "feat(core): comandos observe/hookStatus/installHook no protocolo do sidecar (SP2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `NotifyMessages` + `relativeTime` (Kotlin puro)

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotifyMessages.kt`
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/RelativeTime.kt`
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/NotifyMessagesTest.kt`, `RelativeTimeTest.kt`

**Interfaces:**
- Produces: `NotifyMessages.get(locale: String, key: String, vararg args: Pair<String, String>): String` (fallback en; interpolação `{x}`); `NotifyMessages.toastMessage(locale, kinds: List<String>, awaitingInput: String?, title: String): String?` (prioridade allComplete > awaitingInput > idle; null se kinds vazio); `NotifyMessages.KEYS: List<String>`; `relativeTime(nowMs: Long, thenMs: Long, locale: String): String`.

- [ ] **Step 1: Write the failing tests**

`NotifyMessagesTest.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NotifyMessagesTest {
    @Test fun `all keys are non-empty in the 3 locales`() {
        for (locale in listOf("en", "pt-br", "es"))
            for (key in NotifyMessages.KEYS)
                assertTrue(NotifyMessages.get(locale, key).isNotBlank(), "vazio: $locale/$key")
    }

    @Test fun `interpolates named args`() {
        assertTrue(NotifyMessages.get("pt-br", "notify.idle", "title" to "X").contains("\"X\""))
        assertTrue(NotifyMessages.get("en", "hook.installFailed", "error" to "E1").contains("E1"))
    }

    @Test fun `unknown locale falls back to en`() {
        assertEquals(NotifyMessages.get("en", "notify.openPanel"), NotifyMessages.get("fr", "notify.openPanel"))
    }

    @Test fun `toastMessage priority allComplete over awaitingInput over idle`() {
        assertNull(NotifyMessages.toastMessage("en", emptyList(), null, "T"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("allComplete", "awaitingInput"), "plan", "T")!!
            .contains("completed"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("awaitingInput"), "plan", "T")!!
            .contains("plan"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("awaitingInput"), "question", "T")!!
            .contains("answer"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("idle"), null, "T")!!
            .contains("waiting for you"))
    }
}
```

`RelativeTimeTest.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals

class RelativeTimeTest {
    private val now = 1_000_000_000_000L
    @Test fun `bands match the vscode helper`() {
        assertEquals(NotifyMessages.get("en", "time.now"), relativeTime(now, now - 30_000, "en"))
        assertEquals(NotifyMessages.get("en", "time.minutesAgo", "n" to "5"), relativeTime(now, now - 5 * 60_000, "en"))
        assertEquals(NotifyMessages.get("en", "time.hoursAgo", "n" to "3"), relativeTime(now, now - 3 * 3_600_000, "en"))
        assertEquals(NotifyMessages.get("en", "time.daysAgo", "n" to "2"), relativeTime(now, now - 48 * 3_600_000, "en"))
    }
}
```

- [ ] **Step 2: Run to verify it fails** (compile RED)

- [ ] **Step 3: Implement**

`NotifyMessages.kt` — objeto com `private val catalog: Map<String, Map<String, String>>` para
`en`/`pt-br`/`es`. **Os textos são copiados VERBATIM de `src/i18n/messages.ts`** (abrir o
arquivo e transcrever) para as chaves listadas nas Global Constraints (18 chaves — inclui
`picker.auto` e `time.*`). Estrutura:

```kotlin
package com.carlosdealmeida.claudetodos

// Catálogo mínimo de strings nativas (toasts, prompt de hook, picker, tempo relativo).
// Textos copiados verbatim de src/i18n/messages.ts — manter em sincronia manual.
object NotifyMessages {
    val KEYS: List<String> = listOf(
        "notify.idle", "notify.allComplete", "notify.awaitingQuestion", "notify.awaitingPlan",
        "notify.openPanel", "notify.disable",
        "hook.promptMessage", "hook.install", "hook.notNow", "hook.dontAskAgain",
        "hook.installedAuto", "hook.installFailed",
        "todo.sourceMissing", "picker.auto",
        "time.now", "time.minutesAgo", "time.hoursAgo", "time.daysAgo",
    )

    private val catalog: Map<String, Map<String, String>> = mapOf(
        "en" to mapOf(/* 18 entradas verbatim de messages.ts */),
        "pt-br" to mapOf(/* idem */),
        "es" to mapOf(/* idem */),
    )

    fun get(locale: String, key: String, vararg args: Pair<String, String>): String {
        val base = catalog[locale]?.get(key) ?: catalog.getValue("en").getValue(key)
        return args.fold(base) { acc, (name, value) -> acc.replace("{$name}", value) }
    }

    fun toastMessage(locale: String, kinds: List<String>, awaitingInput: String?, title: String): String? = when {
        kinds.isEmpty() -> null
        "allComplete" in kinds -> get(locale, "notify.allComplete", "title" to title)
        "awaitingInput" in kinds ->
            get(locale, if (awaitingInput == "plan") "notify.awaitingPlan" else "notify.awaitingQuestion", "title" to title)
        else -> get(locale, "notify.idle", "title" to title)
    }
}
```

`RelativeTime.kt` (mesmas faixas do `relativeTime` de extension.ts):

```kotlin
package com.carlosdealmeida.claudetodos

fun relativeTime(nowMs: Long, thenMs: Long, locale: String): String {
    val min = ((nowMs - thenMs) / 60_000L).toInt()
    if (min < 1) return NotifyMessages.get(locale, "time.now")
    if (min < 60) return NotifyMessages.get(locale, "time.minutesAgo", "n" to min.toString())
    val hours = min / 60
    if (hours < 24) return NotifyMessages.get(locale, "time.hoursAgo", "n" to hours.toString())
    return NotifyMessages.get(locale, "time.daysAgo", "n" to (hours / 24).toString())
}
```

- [ ] **Step 4: Run tests** → verdes (18 existentes + 5 novos). `... build -x test` limpo.

- [ ] **Step 5: Commit**

```bash
git add jetbrains/src
git commit -m "feat(jetbrains): NotifyMessages (18 chaves x3 locales) + relativeTime, puros (SP2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `MessageRouter` estendido — `RouterHost` + rotas com id

**Files:**
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/MessageRouter.kt`
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/MessageRouterTest.kt` (append + ajustar construtor nos testes existentes)

**Interfaces:**
- Produces:
  ```kotlin
  interface RouterHost {
      fun openFile(path: String, line: Int)
      fun pickSession(sessions: List<SessionItem>, onPick: (String?) -> Unit)
      fun onNotification(kinds: List<String>, awaitingInput: String?, title: String?)
      fun activatePanel()
      fun warn(messageKey: String)
  }
  data class SessionItem(val sessionId: String, val title: String, val updatedAt: Long)
  ```
  `MessageRouter(sendToSidecar, sendToWebview, locale, host)` + métodos host-iniciados:
  `observe()`, `requestHookStatus(scriptPath, onResult: (Boolean) -> Unit)`,
  `installHook(scriptPath, onDone: (Boolean) -> Unit)`.

- [ ] **Step 1: Write the failing tests**

Nos testes existentes, o construtor ganha um `host` fake compartilhado:

```kotlin
private class FakeHost : RouterHost {
    val opened = mutableListOf<Pair<String, Int>>()
    val warns = mutableListOf<String>()
    val notifications = mutableListOf<Triple<List<String>, String?, String?>>()
    var pickSessions: List<SessionItem>? = null
    var onPick: ((String?) -> Unit)? = null
    var activated = 0
    override fun openFile(path: String, line: Int) { opened += path to line }
    override fun pickSession(sessions: List<SessionItem>, onPick: (String?) -> Unit) {
        pickSessions = sessions; this.onPick = onPick
    }
    override fun onNotification(kinds: List<String>, awaitingInput: String?, title: String?) {
        notifications += Triple(kinds, awaitingInput, title)
    }
    override fun activatePanel() { activated++ }
    override fun warn(messageKey: String) { warns += messageKey }
}
private val host = FakeHost()
private val router = MessageRouter(toSidecar::add, toWebview::add, locale = "pt-br", host = host)
```

Novos casos:

```kotlin
@Test fun `openTodoSource resolves via id and opens the file`() {
    router.onWebviewMessage("""{"type":"openTodoSource","sessionId":"s","agentId":"a","line":7}""")
    val cmd = parse(toSidecar.single())
    assertEquals("resolveTodoSource", cmd["cmd"]!!.jsonPrimitive.content)
    val id = cmd["id"]!!.jsonPrimitive.content
    router.onSidecarEvent("""{"ev":"todoSource","filePath":"/p/s.jsonl","line":7,"id":"$id"}""")
    assertEquals("/p/s.jsonl" to 7, host.opened.single())
}

@Test fun `openTodoSource with null filePath warns`() {
    router.onWebviewMessage("""{"type":"openTodoSource","sessionId":"s","agentId":"a","line":0}""")
    val id = parse(toSidecar.single())["id"]!!.jsonPrimitive.content
    router.onSidecarEvent("""{"ev":"todoSource","filePath":null,"id":"$id"}""")
    assertEquals("todo.sourceMissing", host.warns.single())
}

@Test fun `pickSession lists, picks and repins`() {
    router.onWebviewMessage("""{"type":"pickSession"}""")
    val id = parse(toSidecar.single())["id"]!!.jsonPrimitive.content
    router.onSidecarEvent("""{"ev":"sessions","sessions":[{"sessionId":"s1","cwd":"/p","title":"T1","updatedAt":5}],"id":"$id"}""")
    assertEquals("s1", host.pickSessions!!.single().sessionId)
    host.onPick!!("s1")
    assertEquals("setPinned", parse(toSidecar[1])["cmd"]!!.jsonPrimitive.content)
    assertEquals("s1", parse(toSidecar[1])["sessionId"]!!.jsonPrimitive.content)
    assertEquals("getSnapshot", parse(toSidecar[2])["cmd"]!!.jsonPrimitive.content)
}

@Test fun `pickSession Auto sends null pin`() {
    router.onWebviewMessage("""{"type":"pickSession"}""")
    val id = parse(toSidecar.single())["id"]!!.jsonPrimitive.content
    router.onSidecarEvent("""{"ev":"sessions","sessions":[],"id":"$id"}""")
    host.onPick!!(null)
    assertTrue(parse(toSidecar[1])["sessionId"] is JsonNull)
}

@Test fun `openPanel activates the panel`() {
    router.onWebviewMessage("""{"type":"openPanel"}""")
    assertEquals(1, host.activated)
}

@Test fun `notification events go to the host, not the webview`() {
    router.onSidecarEvent("""{"ev":"notification","kinds":["idle"],"awaitingInput":null,"title":"T"}""")
    assertEquals(Triple(listOf("idle"), null as String?, "T" as String?), host.notifications.single())
    assertTrue(toWebview.isEmpty())
}

@Test fun `snapshot event also triggers an observe command`() {
    router.onSidecarEvent("""{"ev":"snapshot","snapshot":null}""")
    assertEquals("observe", parse(toSidecar.single())["cmd"]!!.jsonPrimitive.content)
}

@Test fun `responses with unknown ids are ignored`() {
    router.onSidecarEvent("""{"ev":"todoSource","filePath":"/x","line":1,"id":"nope"}""")
    assertTrue(host.opened.isEmpty()); assertTrue(toWebview.isEmpty())
}

@Test fun `requestHookStatus and installHook round-trip by id`() {
    var installed: Boolean? = null
    router.requestHookStatus("/h.js") { installed = it }
    val id = parse(toSidecar.single())["id"]!!.jsonPrimitive.content
    router.onSidecarEvent("""{"ev":"hookStatus","installed":true,"id":"$id"}""")
    assertEquals(true, installed)

    var ok: Boolean? = null
    router.installHook("/h.js") { ok = it }
    val id2 = parse(toSidecar[1])["id"]!!.jsonPrimitive.content
    router.onSidecarEvent("""{"ev":"hookInstalled","id":"$id2"}""")
    assertEquals(true, ok)
}
```

(Imports extras no teste: `kotlinx.serialization.json.JsonNull`, `kotlinx.serialization.json.jsonArray` conforme necessário.)

- [ ] **Step 2: Run to verify it fails** (compile RED — RouterHost não existe)

- [ ] **Step 3: Implement**

Em `MessageRouter.kt`: adicionar `RouterHost`/`SessionItem` (mesmo arquivo), o parâmetro
`host`, contador `private var nextId = 0`, mapa
`private val pending = mutableMapOf<String, (kotlinx.serialization.json.JsonObject) -> Unit>()`.

`onWebviewMessage` — rotas novas:

```kotlin
"openTodoSource" -> {
    val sessionId = msg["sessionId"]?.jsonPrimitive?.content ?: return
    val agentId = msg["agentId"]?.jsonPrimitive?.content ?: return
    val line = msg["line"]?.jsonPrimitive?.intOrNull ?: 0
    val id = "src-${nextId++}"
    pending[id] = { ev ->
        val filePath = ev["filePath"]?.jsonPrimitive?.contentOrNull
        if (filePath != null) host.openFile(filePath, ev["line"]?.jsonPrimitive?.intOrNull ?: 0)
        else host.warn("todo.sourceMissing")
    }
    sendToSidecar(buildJsonObject {
        put("cmd", "resolveTodoSource"); put("sessionId", sessionId)
        put("agentId", agentId); put("line", line); put("id", id)
    }.toString())
}
"pickSession" -> {
    val id = "pick-${nextId++}"
    pending[id] = { ev ->
        val sessions = ev["sessions"]?.jsonArray?.mapNotNull { el ->
            runCatching {
                val o = el.jsonObject
                SessionItem(
                    o["sessionId"]!!.jsonPrimitive.content,
                    o["title"]!!.jsonPrimitive.content,
                    o["updatedAt"]!!.jsonPrimitive.long,
                )
            }.getOrNull()
        } ?: emptyList()
        host.pickSession(sessions) { chosen ->
            sendToSidecar(buildJsonObject {
                put("cmd", "setPinned")
                if (chosen != null) put("sessionId", chosen) else put("sessionId", JsonNull)
            }.toString())
            sendToSidecar("""{"cmd":"getSnapshot"}""")
        }
    }
    sendToSidecar(buildJsonObject { put("cmd", "listSessions"); put("id", id) }.toString())
}
"openPanel" -> host.activatePanel()
```

`onSidecarEvent` — no INÍCIO, o desvio por id e a rota de notification:

```kotlin
val id = ev["id"]?.jsonPrimitive?.contentOrNull
if (id != null) { pending.remove(id)?.invoke(ev); return }  // resposta a request nosso; id desconhecido: ignora

when (ev["ev"]?.jsonPrimitive?.content) {
    "notification" -> {
        host.onNotification(
            ev["kinds"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
            ev["awaitingInput"]?.jsonPrimitive?.contentOrNull,
            ev["title"]?.jsonPrimitive?.contentOrNull,
        )
        return
    }
}
// ...bloco existente (snapshot/projectUsage/error)...
```

E na rota `snapshot` existente, após `sendToWebview(out.toString())`, disparar a detecção
event-driven: `if (isSnapshot) sendToSidecar("""{"cmd":"observe"}""")` (estruturar o bloco
para saber o tipo — ex.: guardar `val type = ev["ev"]...` e após o envio:
`if (type == "snapshot") sendToSidecar(...)`).

Métodos host-iniciados:

```kotlin
fun observe() { sendToSidecar("""{"cmd":"observe"}""") }

fun requestHookStatus(scriptPath: String, onResult: (Boolean) -> Unit) {
    val id = "hs-${nextId++}"
    pending[id] = { ev -> onResult(ev["installed"]?.jsonPrimitive?.booleanOrNull ?: false) }
    sendToSidecar(buildJsonObject { put("cmd", "hookStatus"); put("hookScriptPath", scriptPath); put("id", id) }.toString())
}

fun installHook(scriptPath: String, onDone: (Boolean) -> Unit) {
    val id = "ih-${nextId++}"
    pending[id] = { ev -> onDone(ev["ev"]?.jsonPrimitive?.content == "hookInstalled") }
    sendToSidecar(buildJsonObject { put("cmd", "installHook"); put("hookScriptPath", scriptPath); put("id", id) }.toString())
}
```

Imports extras: `JsonNull`, `jsonArray`, `intOrNull`, `long`, `contentOrNull`, `booleanOrNull`.

- [ ] **Step 4: Run tests** → todos verdes (os 8 antigos ajustados + 9 novos). `build -x test` limpo.

- [ ] **Step 5: Commit**

```bash
git add jetbrains/src
git commit -m "feat(jetbrains): MessageRouter com RouterHost — openTodoSource/pickSession/notification por id (SP2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `NotificationBridge` + `HookSetup` + registros

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotificationBridge.kt`
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/HookSetup.kt`
- Modify: `jetbrains/src/main/resources/META-INF/plugin.xml` (2 notification groups)
- Modify: `jetbrains/build.gradle.kts` (syncWebAssets += hook)

**Interfaces:**
- Consumes: `NotifyMessages` (T3).
- Produces: `NotificationBridge(project, locale, activatePanel: () -> Unit)` com `toast(kinds, awaitingInput, title)`, `warn(messageKey)`, `promptHookInstall(onInstall: () -> Unit)`, `confirmHookInstalled()`, `hookInstallFailed(error: String)`; `HookSetup.ensureHookScript(): String`. Chaves `PropertiesComponent`: `claudeTodos.notifications` (bool, default true), `claudeTodos.hookPromptDismissed` (bool).

- [ ] **Step 1: Implement `HookSetup`**

```kotlin
package com.carlosdealmeida.claudetodos

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

// Extrai o hook para o MESMO path estável que a extensão VS Code usa — o comando
// registrado fica idêntico nos dois IDEs e a instalação é idempotente entre eles.
object HookSetup {
    fun ensureHookScript(): String {
        val claudeDir = System.getenv("CLAUDE_CONFIG_DIR")
            ?: File(System.getProperty("user.home"), ".claude").absolutePath
        val target = File(claudeDir, ".vscode-todos-bridge/hook.js")
        target.parentFile.mkdirs()
        javaClass.classLoader.getResourceAsStream("claudetodos/hook.js")!!.use { input ->
            Files.copy(input, target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
        return target.absolutePath
    }
}
```

- [ ] **Step 2: Implement `NotificationBridge`**

```kotlin
package com.carlosdealmeida.claudetodos

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.WindowManager

// Toasts nativos com os MESMOS gates do VS Code (maybeToast): setting ligado +
// janela do IDE sem foco. A detecção roda sempre; só a exibição é gateada.
class NotificationBridge(
    private val project: Project,
    private val locale: String,
    private val activatePanel: () -> Unit,
) {
    private val props get() = PropertiesComponent.getInstance()

    fun toast(kinds: List<String>, awaitingInput: String?, title: String?) {
        if (title == null) return
        if (!props.getBoolean("claudeTodos.notifications", true)) return
        if (WindowManager.getInstance().getFrame(project)?.isActive == true) return
        val message = NotifyMessages.toastMessage(locale, kinds, awaitingInput, title) ?: return
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(message, NotificationType.INFORMATION)
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "notify.openPanel")) { activatePanel() })
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "notify.disable")) {
                props.setValue("claudeTodos.notifications", false, true)
            })
            .notify(project)
    }

    fun warn(messageKey: String) {
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(NotifyMessages.get(locale, messageKey), NotificationType.WARNING)
            .notify(project)
    }

    fun promptHookInstall(onInstall: () -> Unit) {
        if (props.getBoolean("claudeTodos.hookPromptDismissed", false)) return
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos-sticky")
            .createNotification(NotifyMessages.get(locale, "hook.promptMessage"), NotificationType.INFORMATION)
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "hook.install")) { onInstall() })
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "hook.notNow")) {})
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "hook.dontAskAgain")) {
                props.setValue("claudeTodos.hookPromptDismissed", true)
            })
            .notify(project)
    }

    fun confirmHookInstalled() {
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(NotifyMessages.get(locale, "hook.installedAuto"), NotificationType.INFORMATION)
            .notify(project)
    }

    fun hookInstallFailed(error: String) {
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(NotifyMessages.get(locale, "hook.installFailed", "error" to error), NotificationType.ERROR)
            .notify(project)
    }
}
```

- [ ] **Step 3: Registros**

`plugin.xml`, dentro de `<extensions defaultExtensionNs="com.intellij">`:

```xml
<notificationGroup id="claude-todos" displayType="BALLOON"/>
<notificationGroup id="claude-todos-sticky" displayType="STICKY_BALLOON"/>
```

`build.gradle.kts`, no `syncWebAssets`: adicionar
`from(dist.resolve("hooks/sessionStart.js")) { rename { "hook.js" } }` e incluir
`dist.resolve("hooks/sessionStart.js").exists()` no `require` (mensagem inalterada).

- [ ] **Step 4: Build + tests**

`... build --console=plain` → SUCCESSFUL (23 testes verdes); confirmar
`src/main/resources/claudetodos/hook.js` sincronizado.

- [ ] **Step 5: Commit**

```bash
git add jetbrains/src jetbrains/build.gradle.kts
git commit -m "feat(jetbrains): NotificationBridge (gates de paridade) + HookSetup + notification groups (SP2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: fiação na factory — host real, observe loop, prompt de hook

**Files:**
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ClaudeTodosToolWindowFactory.kt`

**Interfaces:**
- Consumes: tudo das Tasks 3-5.

- [ ] **Step 1: Implement**

Mudanças no `createToolWindowContent` (a estrutura existente — gates, panel, sidecar,
pooled start, LafManagerListener — fica; o que muda é a construção do router e o pós-start):

```kotlin
val locale = ideLocale()
val bridge = NotificationBridge(project, locale, activatePanel = {
    SwingUtilities.invokeLater { toolWindow.activate(null) }
})

lateinit var router: MessageRouter
val host = object : RouterHost {
    override fun openFile(path: String, line: Int) {
        SwingUtilities.invokeLater {
            val vf = com.intellij.openapi.vfs.LocalFileSystem.getInstance().refreshAndFindFileByPath(path)
            if (vf == null) { bridge.warn("todo.sourceMissing"); return@invokeLater }
            com.intellij.openapi.fileEditor.FileEditorManager.getInstance(project)
                .openTextEditor(com.intellij.openapi.fileEditor.OpenFileDescriptor(project, vf, line, 0), true)
        }
    }
    override fun pickSession(sessions: List<SessionItem>, onPick: (String?) -> Unit) {
        SwingUtilities.invokeLater {
            val labels = mutableListOf(NotifyMessages.get(locale, "picker.auto"))
            val ids = mutableListOf<String?>(null)
            val now = System.currentTimeMillis()
            for (s in sessions) {
                labels += "${s.title} · ${s.sessionId.take(8)} · ${relativeTime(now, s.updatedAt, locale)}"
                ids += s.sessionId
            }
            com.intellij.openapi.ui.popup.JBPopupFactory.getInstance()
                .createPopupChooserBuilder(labels)
                .setTitle("Claude Todos")
                .setItemChosenCallback { chosen -> onPick(ids[labels.indexOf(chosen)]) }
                .createPopup()
                .showCenteredInCurrentWindow(project)
        }
    }
    override fun onNotification(kinds: List<String>, awaitingInput: String?, title: String?) {
        SwingUtilities.invokeLater { bridge.toast(kinds, awaitingInput, title) }
    }
    override fun activatePanel() { SwingUtilities.invokeLater { toolWindow.activate(null) } }
    override fun warn(messageKey: String) { SwingUtilities.invokeLater { bridge.warn(messageKey) } }
}
router = MessageRouter(
    sendToSidecar = sidecar::send,
    sendToWebview = { json -> SwingUtilities.invokeLater { panel.post(json) } },
    locale = locale,
    host = host,
)
```

No bloco pooled do start (após o `sidecar.start(...)` bem-sucedido, dentro do mesmo
`runCatching`): fluxo do hook —

```kotlin
val hookPath = HookSetup.ensureHookScript()
router.requestHookStatus(hookPath) { installed ->
    if (!installed) SwingUtilities.invokeLater {
        bridge.promptHookInstall(onInstall = {
            router.installHook(hookPath) { ok ->
                SwingUtilities.invokeLater {
                    if (ok) bridge.confirmHookInstalled() else bridge.hookInstallFailed("install failed")
                }
            }
        })
    }
}
```

Timer de observe (após criar o router, na EDT):

```kotlin
val observeTimer = javax.swing.Timer(10_000) { router.observe() }.apply { start() }
com.intellij.openapi.util.Disposer.register(toolWindow.disposable) { observeTimer.stop() }
```

- [ ] **Step 2: Build + tests + verifyPlugin**

`... build --console=plain` → SUCCESSFUL (23 verdes); `... verifyPlugin` → Compatible.

- [ ] **Step 3: Commit**

```bash
git add jetbrains/src
git commit -m "feat(jetbrains): factory liga RouterHost real — abrir transcript, picker, toasts, prompt de hook (SP2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: fechamento — suites + overview

**Files:**
- Modify: `docs/specs/2026-07-17-jetbrains-port-overview.md` (célula SP2)

- [ ] **Step 1:** Raiz: `npm test` + `npm run build`. jetbrains/: `test` + `build` + `verifyPlugin`. Tudo verde; reportar totais.
- [ ] **Step 2:** Overview, célula "Entregável" do SP2: prefixar `🚧 **implementado YYYY-MM-DD — smoke humano pendente (junto com o gate do SP1)** — ` mantendo o texto. (O smoke humano cobre: clique→transcript, picker, toast com janela sem foco, prompt/instalação de hook.)
- [ ] **Step 3: Commit**

```bash
git add docs/specs/2026-07-17-jetbrains-port-overview.md
git commit -m "docs(specs): SP2 — pontes nativas implementadas (porta JetBrains)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
