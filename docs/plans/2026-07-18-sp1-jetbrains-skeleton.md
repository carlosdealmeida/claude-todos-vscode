# SP1 — Esqueleto Kotlin + JCEF (painel read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugin JetBrains mínimo funcional: tool window com a webview Svelte existente renderizada em JCEF, alimentada ao vivo pelo sidecar Node do SP0 — painel read-only (árvore + tokens + dashboard) dentro do IntelliJ.

**Architecture:** Módulo Gradle isolado em `jetbrains/` (IntelliJ Platform Gradle Plugin 2.x, `sinceBuild=242`). Kotlin fino: factory com gates (JCEF/node), `SidecarProcess` (spawn + JSON-lines), `WebviewPanel` (`loadHTML` inline + `JBCefJSQuery`), `MessageRouter` puro traduzindo webview↔sidecar, `ThemeShim` (20 vars → LaF). No TS: correlation-id no protocolo (retrocompat) e `createJcefBridge` real.

**Tech Stack:** Kotlin 2.1, Gradle 8.13 (CLI local em `C:\Gradle\bin` gera o wrapper), IntelliJ Platform Gradle Plugin 2.2.1, kotlinx-serialization-json, JUnit 5. TS/vitest existentes. JDK 17 (`JAVA_HOME` já aponta).

**Spec:** [docs/specs/2026-07-18-sp1-jetbrains-skeleton-design.md](../specs/2026-07-18-sp1-jetbrains-skeleton-design.md)

## Global Constraints

- **Zero regressão no lado npm:** suíte `npm test` (285) permanece verde; `npm run build` limpo. As únicas mudanças fora de `jetbrains/` são as Tasks 1-2 (dispatcher id + jcefBridge).
- Protocolo: `id?: string` opcional em TODOS os comandos; eco do `id` SOMENTE no evento-resposta direta; pushes de watch SEM id; comando sem id → evento sem id (retrocompat total).
- Kotlin puro testável sem IDE/JCEF: `MessageRouter`, `buildHtml`, `ThemeShim`, `NodeLocator` não podem referenciar `JBCefBrowser`/`Project` (injeção por parâmetro).
- Plugin id `com.carlosdealmeida.claude-todos`; `sinceBuild=242`; sem `untilBuild`.
- O snapshot passa OPACO pelo Kotlin (`JsonElement` passthrough) — o plugin nunca modela o schema interno do snapshot.
- Commits pequenos, pt-BR, rodapé `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Comandos npm rodam na RAIZ do repo; comandos gradle rodam em `jetbrains/` (`./gradlew` = `gradlew.bat` no Windows — nos exemplos, usar `cmd //c gradlew.bat` a partir do bash).

---

### Task 1: correlation-id no dispatcher (TS)

**Files:**
- Modify: `src/core/dispatcher.ts`
- Test: `tests/core/dispatcher.test.ts` (append)

**Interfaces:**
- Consumes: dispatcher existente do SP0.
- Produces: `CoreCommand` = shapes atuais + `id?: string`; `CoreEvent` = shapes atuais + `id?: string` nos eventos de resposta direta (`snapshot` a `getSnapshot`, `projectUsage`, `sessions`, `todoSource`, `error` de comando pós-init inválido). Push de watch NUNCA carrega id. `error` de "not initialized" ecoa o id do comando que falhou, se houver.

- [ ] **Step 1: Write the failing tests**

Append em `tests/core/dispatcher.test.ts`:

```ts
describe('correlation id', () => {
  const init = { cmd: 'init', claudeDir: '/c', cwds: ['/p'] };

  it('echoes the id on the direct response', () => {
    const events = run([init, { cmd: 'getSnapshot', id: 'r1' }]);
    expect(events.at(-1)).toMatchObject({ ev: 'snapshot', id: 'r1' });
  });

  it('omits the id when the command has none (retrocompat)', () => {
    const events = run([init, { cmd: 'getSnapshot' }]);
    expect(events.at(-1)).not.toHaveProperty('id');
  });

  it('watch pushes never carry an id', () => {
    let fire: (() => void) | null = null;
    const core = fakeCore({ onChange: (l: () => void) => { fire = l; return { dispose: vi.fn() }; } });
    const events: CoreEvent[] = [];
    const dispatch = createDispatcher((e) => events.push(e), () => core);
    dispatch(init as any);
    dispatch({ cmd: 'watch', on: true, id: 'w1' } as any);
    fire!();
    expect(events.at(-1)).toMatchObject({ ev: 'snapshot' });
    expect(events.at(-1)).not.toHaveProperty('id');
  });

  it('echoes the id on error events too', () => {
    expect(run([{ cmd: 'getSnapshot', id: 'e1' }]).at(-1))
      .toEqual({ ev: 'error', message: 'not initialized', id: 'e1' });
    expect(run([init, { cmd: 'nope', id: 'e2' } as any]).at(-1))
      .toEqual({ ev: 'error', message: 'unknown command: nope', id: 'e2' });
  });

  it('echoes the id on sessions, projectUsage and todoSource', () => {
    expect(run([init, { cmd: 'listSessions', id: 'a' }]).at(-1)).toMatchObject({ ev: 'sessions', id: 'a' });
    expect(run([init, { cmd: 'getProjectUsage', id: 'b' }]).at(-1)).toMatchObject({ ev: 'projectUsage', id: 'b' });
    expect(run([init, { cmd: 'resolveTodoSource', sessionId: 's', agentId: 's', line: 2, id: 'c' }]).at(-1))
      .toMatchObject({ ev: 'todoSource', id: 'c' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/core/dispatcher.test.ts`
Expected: FAIL — nenhum evento carrega `id`.

- [ ] **Step 3: Implement**

Em `src/core/dispatcher.ts`:

1. Tipos: acrescentar o campo opcional em cada membro de `CoreCommand` é verboso; em vez disso, redefinir como interseção:

```ts
export type CoreCommand = (
  | { cmd: 'init'; claudeDir: string; cwds: string[] }
  | { cmd: 'getSnapshot' }
  | { cmd: 'watch'; on: boolean }
  | { cmd: 'getProjectUsage' }
  | { cmd: 'resolveTodoSource'; sessionId: string; agentId: string; line: number }
  | { cmd: 'setPinned'; sessionId: string | null }
  | { cmd: 'listSessions' }
) & { id?: string };

export type CoreEvent = (
  | { ev: 'snapshot'; snapshot: SessionSnapshot | null }
  | { ev: 'projectUsage'; usage: ProjectUsage | null }
  | { ev: 'todoSource'; filePath: string; line: number }
  | { ev: 'todoSource'; filePath: null }
  | { ev: 'sessions'; sessions: SessionSummary[] }
  | { ev: 'error'; message: string }
) & { id?: string };
```

2. No corpo do dispatcher, helper local + uso em todas as respostas diretas:

```ts
// Eco do correlation id: só respostas diretas ao comando corrente o carregam;
// pushes de watch saem sem id (o closure do watch não usa withId).
const withId = (ev: CoreEvent, id: string | undefined): CoreEvent =>
  id !== undefined ? { ...ev, id } : ev;
```

Cada `emit(...)` de resposta direta vira `emit(withId({ ... }, cmd.id))` — inclusive os dois
`error`. O closure do `watch` permanece `emit({ ev: 'snapshot', snapshot: core!.buildSnapshot() })`
sem id. `init`/`setPinned`/`watch` seguem sem emitir resposta.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/core/dispatcher.test.ts`
Expected: PASS (novos + os 9 existentes).

- [ ] **Step 5: Full suite + commit**

Run: `npm test` → Expected: 285+ PASS.

```bash
git add src/core/dispatcher.ts tests/core/dispatcher.test.ts
git commit -m "feat(core): correlation-id opcional no protocolo do sidecar (SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `createJcefBridge` real (TS)

**Files:**
- Modify: `src/webview/bridge.ts`
- Modify: `tests/webview/bridge.test.ts` (substituir os 2 testes de throw; adicionar os novos)

**Interfaces:**
- Consumes: `WebviewBridge` do SP0.
- Produces: `createJcefBridge(win?)` funcional — `post` delega para `window.__jcefPost(JSON.stringify(msg))`; `onMessage` ouve `message` events (idêntico ao vscode). `createBridge()` inalterado na detecção.

- [ ] **Step 1: Update the tests (failing first)**

Em `tests/webview/bridge.test.ts`, REMOVER os describes `createJcefBridge` (throw) e
`createBridge` (throw em node) e adicionar:

```ts
describe('createJcefBridge', () => {
  it('post stringifies and delegates to window.__jcefPost', () => {
    const __jcefPost = vi.fn();
    const win = { __jcefPost, addEventListener: vi.fn() };
    const bridge = createJcefBridge(win as any);
    bridge.post({ type: 'refresh' });
    expect(__jcefPost).toHaveBeenCalledWith(JSON.stringify({ type: 'refresh' }));
  });

  it('onMessage receives event.data from message events', () => {
    let captured: ((e: any) => void) | null = null;
    const win = { __jcefPost: vi.fn(), addEventListener: (_: string, cb: (e: any) => void) => { captured = cb; } };
    const bridge = createJcefBridge(win as any);
    const seen: unknown[] = [];
    bridge.onMessage((msg) => seen.push(msg));
    captured!({ data: { type: 'locale', locale: 'pt-br' } });
    expect(seen).toEqual([{ type: 'locale', locale: 'pt-br' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/webview/bridge.test.ts`
Expected: FAIL — `createJcefBridge` ainda lança e não aceita `win`.

- [ ] **Step 3: Implement**

Em `src/webview/bridge.ts`, substituir `createJcefBridge`:

```ts
// Host JCEF (plugin JetBrains): o Kotlin injeta `window.__jcefPost` (JBCefJSQuery)
// antes do load e entrega mensagens via `window.postMessage` — o listener fica
// idêntico ao do VS Code.
interface JcefWindow extends Pick<Window, 'addEventListener'> {
  __jcefPost(json: string): void;
}

export function createJcefBridge(win: JcefWindow = window as unknown as JcefWindow): WebviewBridge {
  return {
    post: (msg) => win.__jcefPost(JSON.stringify(msg)),
    onMessage: (handler) => {
      win.addEventListener('message', (event) => {
        handler((event as MessageEvent).data as ExtensionMessage);
      });
    },
  };
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test -- tests/webview/bridge.test.ts` → PASS.
Run: `npm test` → tudo verde. `npm run build` → limpo (webview recompila).

- [ ] **Step 5: Commit**

```bash
git add src/webview/bridge.ts tests/webview/bridge.test.ts
git commit -m "feat(webview): createJcefBridge real — __jcefPost + message events (SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: esqueleto Gradle do módulo `jetbrains/`

**Files:**
- Create: `jetbrains/settings.gradle.kts`, `jetbrains/build.gradle.kts`, `jetbrains/.gitignore`, `jetbrains/src/main/resources/META-INF/plugin.xml`, `jetbrains/README.md`
- Create (gerado): `jetbrains/gradlew`, `jetbrains/gradlew.bat`, `jetbrains/gradle/wrapper/*`

**Interfaces:**
- Consumes: nada.
- Produces: módulo Gradle que compila vazio, task `syncWebAssets` copiando os 3 artefatos npm para `src/main/resources/claudetodos/`, `verifyPlugin` passando.

- [ ] **Step 1: Generate the wrapper**

```bash
mkdir -p jetbrains && cd jetbrains && gradle wrapper --gradle-version 8.13
```

(O CLI `gradle` local em `C:\Gradle\bin` só serve para gerar o wrapper; tudo depois usa `gradlew`.)
Expected: `gradlew`, `gradlew.bat`, `gradle/wrapper/` criados.

- [ ] **Step 2: Write the build files**

`jetbrains/settings.gradle.kts`:

```kotlin
rootProject.name = "claude-todos-jetbrains"
```

`jetbrains/build.gradle.kts`:

```kotlin
import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.1.0"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.carlosdealmeida"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        create("IC", "2024.2.4")
    }
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin { jvmToolchain(17) }

intellijPlatform {
    pluginConfiguration {
        id = "com.carlosdealmeida.claude-todos"
        name = "Claude Todos"
        ideaVersion {
            sinceBuild = "242"
            untilBuild = provider { null }
        }
    }
}

tasks.test { useJUnitPlatform() }

// Copia os artefatos da build npm (raiz do repo) para os resources do plugin.
// Pré-requisito: `npm run build` na raiz. Falha com instrução clara se faltar.
val syncWebAssets by tasks.registering(Copy::class) {
    val dist = rootDir.resolve("../dist")
    doFirst {
        require(dist.resolve("webview/main.js").exists() && dist.resolve("core/main.js").exists()) {
            "Artefatos npm ausentes em ../dist — rode `npm run build` na raiz do repo antes."
        }
    }
    from(dist.resolve("webview/main.js"), dist.resolve("webview/index.css"))
    from(dist.resolve("core/main.js")) { rename { "core-main.js" } }
    into(layout.projectDirectory.dir("src/main/resources/claudetodos"))
}

tasks.processResources { dependsOn(syncWebAssets) }
```

`jetbrains/.gitignore`:

```
.gradle/
build/
.intellijPlatform/
src/main/resources/claudetodos/
```

`jetbrains/src/main/resources/META-INF/plugin.xml`:

```xml
<idea-plugin>
  <id>com.carlosdealmeida.claude-todos</id>
  <name>Claude Todos</name>
  <vendor url="https://github.com/carlosdealmeida/claude-todos-vscode">carlosdealmeida</vendor>
  <description><![CDATA[
    Live observability for your Claude Code agents: agent tree, per-task progress,
    tokens/context/cache and a 7-day usage dashboard — read from the transcripts
    Claude Code already writes. Companion of the Claude Todos VS Code extension.
  ]]></description>
  <depends>com.intellij.modules.platform</depends>
  <extensions defaultExtensionNs="com.intellij">
    <!-- toolWindow registrado na Task 7 -->
  </extensions>
</idea-plugin>
```

`jetbrains/README.md`:

```markdown
# Claude Todos — plugin JetBrains

Porta JetBrains da extensão (specs em `../docs/specs/2026-07-17-jetbrains-port-overview.md`).

## Dev

1. Na raiz do repo: `npm run build` (gera webview + sidecar em `../dist`)
2. Aqui: `./gradlew runIde` (baixa o IDE alvo na primeira vez)

Testes: `./gradlew test` · Empacotar: `./gradlew buildPlugin`
```

- [ ] **Step 3: Verify the skeleton builds**

```bash
cd jetbrains && cmd //c gradlew.bat build --console=plain -x test
```

Expected: BUILD SUCCESSFUL (primeira execução baixa o IDE alvo — minutos). `syncWebAssets`
deve ter copiado os 3 arquivos (conferir `src/main/resources/claudetodos/`). Se `../dist`
estiver vazio, rode `npm run build` na raiz primeiro.

- [ ] **Step 4: Commit**

```bash
cd .. && git add jetbrains/ && git commit -m "feat(jetbrains): esqueleto Gradle — IntelliJ Platform 2.x, sinceBuild 242, syncWebAssets (SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `MessageRouter` (Kotlin puro) + envelopes

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/MessageRouter.kt`
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/MessageRouterTest.kt`

**Interfaces:**
- Consumes: nada de IDE.
- Produces: `class MessageRouter(sendToSidecar: (String) -> Unit, sendToWebview: (String) -> Unit, locale: String)` com `onWebviewMessage(json: String)` e `onSidecarEvent(json: String)`. Payloads opacos (`JsonElement` passthrough).

- [ ] **Step 1: Write the failing tests**

`MessageRouterTest.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MessageRouterTest {
    private val toSidecar = mutableListOf<String>()
    private val toWebview = mutableListOf<String>()
    private val router = MessageRouter(toSidecar::add, toWebview::add, locale = "pt-br")

    private fun parse(s: String) = Json.parseToJsonElement(s).jsonObject

    @Test fun `ready pushes locale and requests a snapshot`() {
        router.onWebviewMessage("""{"type":"ready"}""")
        assertEquals("locale", parse(toWebview.single())["type"]!!.jsonPrimitive.content)
        assertEquals("pt-br", parse(toWebview.single())["locale"]!!.jsonPrimitive.content)
        assertEquals("getSnapshot", parse(toSidecar.single())["cmd"]!!.jsonPrimitive.content)
    }

    @Test fun `refresh maps to getSnapshot`() {
        router.onWebviewMessage("""{"type":"refresh"}""")
        assertEquals("getSnapshot", parse(toSidecar.single())["cmd"]!!.jsonPrimitive.content)
    }

    @Test fun `projectUsage maps to getProjectUsage`() {
        router.onWebviewMessage("""{"type":"projectUsage"}""")
        assertEquals("getProjectUsage", parse(toSidecar.single())["cmd"]!!.jsonPrimitive.content)
    }

    @Test fun `sp2 messages are no-ops`() {
        router.onWebviewMessage("""{"type":"openTodoSource","sessionId":"s","agentId":"a","line":3}""")
        router.onWebviewMessage("""{"type":"pickSession"}""")
        router.onWebviewMessage("""{"type":"openPanel"}""")
        assertTrue(toSidecar.isEmpty()); assertTrue(toWebview.isEmpty())
    }

    @Test fun `snapshot event passes through opaque`() {
        router.onSidecarEvent("""{"ev":"snapshot","snapshot":{"sessionId":"s1","agents":[{"x":1}]}}""")
        val out = parse(toWebview.single())
        assertEquals("snapshot", out["type"]!!.jsonPrimitive.content)
        assertEquals("s1", out["snapshot"]!!.jsonObject["sessionId"]!!.jsonPrimitive.content)
    }

    @Test fun `projectUsage and error events map types`() {
        router.onSidecarEvent("""{"ev":"projectUsage","usage":null}""")
        router.onSidecarEvent("""{"ev":"error","message":"boom"}""")
        assertEquals("projectUsage", parse(toWebview[0])["type"]!!.jsonPrimitive.content)
        assertEquals("error", parse(toWebview[1])["type"]!!.jsonPrimitive.content)
        assertEquals("boom", parse(toWebview[1])["message"]!!.jsonPrimitive.content)
    }

    @Test fun `sessions and todoSource events are ignored in sp1`() {
        router.onSidecarEvent("""{"ev":"sessions","sessions":[]}""")
        router.onSidecarEvent("""{"ev":"todoSource","filePath":null}""")
        assertTrue(toWebview.isEmpty())
    }

    @Test fun `malformed json is swallowed`() {
        router.onWebviewMessage("not json")
        router.onSidecarEvent("{broken")
        assertTrue(toSidecar.isEmpty()); assertTrue(toWebview.isEmpty())
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd jetbrains && cmd //c gradlew.bat test --console=plain --tests "*MessageRouterTest*"
```

Expected: FAIL de compilação — `MessageRouter` não existe.

- [ ] **Step 3: Implement**

`MessageRouter.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Traduz entre os vocabulários da webview (ExtensionMessage/WebviewMessage) e do
 * sidecar (CoreCommand/CoreEvent). Puro: I/O injetado por lambdas; payloads
 * (snapshot/usage) passam OPACOS — o plugin não modela o schema interno.
 */
class MessageRouter(
    private val sendToSidecar: (String) -> Unit,
    private val sendToWebview: (String) -> Unit,
    private val locale: String,
) {
    fun onWebviewMessage(json: String) {
        val msg = parse(json) ?: return
        when (msg["type"]?.jsonPrimitive?.content) {
            "ready" -> {
                sendToWebview(buildJsonObject {
                    put("type", "locale"); put("locale", locale)
                }.toString())
                sendToSidecar("""{"cmd":"getSnapshot"}""")
            }
            "refresh" -> sendToSidecar("""{"cmd":"getSnapshot"}""")
            "projectUsage" -> sendToSidecar("""{"cmd":"getProjectUsage"}""")
            // SP2: openTodoSource, pickSession, openPanel
            else -> Unit
        }
    }

    fun onSidecarEvent(json: String) {
        val ev = parse(json) ?: return
        val out = when (ev["ev"]?.jsonPrimitive?.content) {
            "snapshot" -> buildJsonObject {
                put("type", "snapshot"); put("snapshot", ev["snapshot"] ?: JsonNull)
            }
            "projectUsage" -> buildJsonObject {
                put("type", "projectUsage"); put("usage", ev["usage"] ?: JsonNull)
            }
            "error" -> buildJsonObject {
                put("type", "error"); put("message", ev["message"] ?: JsonNull)
            }
            else -> null // sessions/todoSource: sem consumidor no SP1
        }
        if (out != null) sendToWebview(out.toString())
    }

    private fun parse(json: String) =
        runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd jetbrains && cmd //c gradlew.bat test --console=plain --tests "*MessageRouterTest*"
```

Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
cd .. && git add jetbrains/src && git commit -m "feat(jetbrains): MessageRouter puro — webview<->sidecar com payload opaco (SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `buildHtml` + `ThemeShim` + `NodeLocator` (Kotlin puro)

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/WebviewHtml.kt`
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ThemeShim.kt`
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NodeLocator.kt`
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/WebviewHtmlTest.kt`, `ThemeShimTest.kt`, `NodeLocatorTest.kt`

**Interfaces:**
- Consumes: nada de IDE (`ThemeShim` usa `javax.swing.UIManager`/`java.awt.Color` com fallbacks — roda headless).
- Produces: `buildHtml(css: String, themeVars: String, bridgeScript: String, appJs: String): String`; `ThemeShim.cssVariables(): String` (bloco `:root{--vscode-…}` com as 20 vars) e `ThemeShim.VAR_NAMES: List<String>`; `NodeLocator.find(pathEnv: String?, isWindows: Boolean): String?`.

- [ ] **Step 1: Write the failing tests**

`WebviewHtmlTest.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertTrue

class WebviewHtmlTest {
    @Test fun `inlines css, theme vars, bridge and app in order`() {
        val html = buildHtml(css = ".a{}", themeVars = ":root{--x:1}", bridgeScript = "BRIDGE()", appJs = "APP()")
        assertContains(html, ":root{--x:1}")
        assertContains(html, ".a{}")
        assertContains(html, "BRIDGE()")
        assertContains(html, "APP()")
        assertContains(html, "<div id=\"app\">")
        // bridge antes do app; tema antes do css da app (app pode sobrescrever)
        assertTrue(html.indexOf("BRIDGE()") < html.indexOf("APP()"))
        assertTrue(html.indexOf(":root{--x:1}") < html.indexOf(".a{}"))
    }

    @Test fun `escapes closing tags inside inlined content`() {
        val html = buildHtml(css = "a{content:'</style>'}", themeVars = "", bridgeScript = "", appJs = "x='</script>'")
        assertContains(html, "<\\/style>'")   // css inlinado não fecha a tag <style>
        assertContains(html, "<\\/script>'")  // js inlinado não fecha a tag <script>
    }
}
```

`ThemeShimTest.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ThemeShimTest {
    @Test fun `emits all 20 vars with concrete values`() {
        val css = ThemeShim.cssVariables()
        assertEquals(20, ThemeShim.VAR_NAMES.size)
        for (name in ThemeShim.VAR_NAMES) {
            assertTrue(css.contains("--vscode-$name:"), "faltou --vscode-$name")
        }
        // nenhuma var vazia: todo valor tem conteúdo até o ';'
        assertTrue(!Regex(":\\s*;").containsMatchIn(css))
    }

    @Test fun `colors are hex formatted`() {
        val css = ThemeShim.cssVariables()
        assertTrue(Regex("--vscode-foreground:\\s*#[0-9a-fA-F]{6}").containsMatchIn(css))
    }
}
```

`NodeLocatorTest.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import java.nio.file.Files
import kotlin.io.path.createFile
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NodeLocatorTest {
    @Test fun `finds node in a PATH dir`() {
        val dir = Files.createTempDirectory("nl")
        val exe = dir.resolve("node.exe").createFile()
        assertEquals(exe.toString(), NodeLocator.find(dir.toString(), isWindows = true))
    }

    @Test fun `null when absent`() {
        val dir = Files.createTempDirectory("nl2")
        assertNull(NodeLocator.find(dir.toString(), isWindows = true))
        assertNull(NodeLocator.find(null, isWindows = false))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd jetbrains && cmd //c gradlew.bat test --console=plain
```

Expected: FAIL de compilação.

- [ ] **Step 3: Implement**

`WebviewHtml.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

// Gera o HTML único carregado via loadHTML: tema (:root vars) → css da app →
// script da bridge (__jcefPost) → app. Conteúdo inline tem os closers escapados
// para não fechar as tags prematuramente.
fun buildHtml(css: String, themeVars: String, bridgeScript: String, appJs: String): String {
    val safeCss = css.replace("</style", "<\\/style")
    val safeTheme = themeVars.replace("</style", "<\\/style")
    val safeBridge = bridgeScript.replace("</script", "<\\/script")
    val safeApp = appJs.replace("</script", "<\\/script")
    return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <style>$safeTheme</style>
          <style>$safeCss</style>
          <title>Claude Todos</title>
        </head>
        <body>
          <div id="app"></div>
          <script>$safeBridge</script>
          <script type="module">$safeApp</script>
        </body>
        </html>
    """.trimIndent()
}
```

`ThemeShim.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import java.awt.Color
import java.awt.Font
import javax.swing.UIManager

/**
 * Mapeia as 20 vars --vscode-* que a webview usa para cores do LaF corrente.
 * Todo valor tem fallback concreto: nenhuma var sai vazia, mesmo headless.
 */
object ThemeShim {
    val VAR_NAMES: List<String> = listOf(
        "foreground", "font-family", "font-size", "descriptionForeground",
        "errorForeground", "focusBorder", "panel-border", "list-hoverBackground",
        "badge-background", "badge-foreground", "sideBarSectionHeader-background",
        "textBlockQuote-background", "progressBar-background", "editor-font-family",
        "testing-iconPassed", "charts-blue", "charts-green", "charts-orange",
        "charts-red", "charts-yellow",
    )

    fun cssVariables(): String {
        val dark = isDark()
        val fg = color("Label.foreground", if (dark) Color(0xBBBBBB) else Color(0x1F1F1F))
        val muted = color("Label.disabledForeground", if (dark) Color(0x787878) else Color(0x6E6E6E))
        val border = color("Component.borderColor", if (dark) Color(0x3C3F41) else Color(0xD1D1D1))
        val hover = color("List.selectionBackgroundInactive", if (dark) Color(0x2E436E) else Color(0xD5E1F2))
        val accent = color("Component.focusColor", if (dark) Color(0x3574F0) else Color(0x3574F0))
        val panelBg = color("Panel.background", if (dark) Color(0x2B2D30) else Color(0xF2F2F2))
        val error = color("Label.errorForeground", Color(0xE55765))
        val font = UIManager.getFont("Label.font") ?: Font("Dialog", Font.PLAIN, 13)
        val values = mapOf(
            "foreground" to hex(fg),
            "font-family" to "'${font.family}', sans-serif",
            "font-size" to "${font.size}px",
            "descriptionForeground" to hex(muted),
            "errorForeground" to hex(error),
            "focusBorder" to hex(accent),
            "panel-border" to hex(border),
            "list-hoverBackground" to hex(hover),
            "badge-background" to hex(accent),
            "badge-foreground" to "#ffffff",
            "sideBarSectionHeader-background" to hex(panelBg),
            "textBlockQuote-background" to hex(panelBg),
            "progressBar-background" to hex(accent),
            "editor-font-family" to "'JetBrains Mono', 'Consolas', monospace",
            "testing-iconPassed" to if (dark) "#57965c" else "#2e8b57",
            "charts-blue" to "#4b8bf5", "charts-green" to "#57965c",
            "charts-orange" to "#e08855", "charts-red" to "#e55765",
            "charts-yellow" to "#d6a243",
        )
        val body = VAR_NAMES.joinToString("\n") { "  --vscode-$it: ${values.getValue(it)};" }
        return ":root{\n$body\n}"
    }

    private fun isDark(): Boolean {
        val bg = UIManager.getColor("Panel.background") ?: return true
        return (bg.red * 299 + bg.green * 587 + bg.blue * 114) / 1000 < 128
    }

    private fun color(key: String, fallback: Color): Color = UIManager.getColor(key) ?: fallback
    private fun hex(c: Color): String = "#%02x%02x%02x".format(c.red, c.green, c.blue)
}
```

`NodeLocator.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import java.io.File

// Localiza o executável do node varrendo o PATH. Sem bundling (o público de
// Claude Code tem node por definição — premissa do overview).
object NodeLocator {
    fun find(
        pathEnv: String? = System.getenv("PATH"),
        isWindows: Boolean = System.getProperty("os.name").lowercase().contains("win"),
    ): String? {
        if (pathEnv.isNullOrBlank()) return null
        val names = if (isWindows) listOf("node.exe", "node.cmd") else listOf("node")
        for (dir in pathEnv.split(File.pathSeparator)) {
            if (dir.isBlank()) continue
            for (name in names) {
                val f = File(dir, name)
                if (f.isFile) return f.absolutePath
            }
        }
        return null
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd jetbrains && cmd //c gradlew.bat test --console=plain
```

Expected: todos PASS (Router 8 + Html 2 + Theme 2 + Node 2).

- [ ] **Step 5: Commit**

```bash
cd .. && git add jetbrains/src && git commit -m "feat(jetbrains): buildHtml + ThemeShim (20 vars) + NodeLocator, puros e testados (SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `SidecarProcess`

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/SidecarProcess.kt`

**Interfaces:**
- Consumes: `NodeLocator` (Task 5).
- Produces: `class SidecarProcess(nodePath: String, project: Project) : Disposable` com `start(onEvent: (String) -> Unit, onDead: () -> Unit)` e `send(json: String)`. Extrai `core-main.js` dos resources; `init` + `watch:true` automáticos no start; 1 auto-restart.

- [ ] **Step 1: Implement** (sem unit próprio — as partes puras já têm teste; o processo é coberto pelo smoke da Task 8)

`SidecarProcess.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.io.BufferedWriter
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.TimeUnit

/**
 * Processo sidecar: `node core-main.js` falando JSON-lines. Extrai o bundle dos
 * resources para um path estável por versão; envia init+watch no start; lê o
 * stdout num executor; 1 auto-restart em morte inesperada, depois onDead.
 */
class SidecarProcess(
    private val nodePath: String,
    private val project: Project,
) : Disposable {
    private val log = Logger.getInstance(SidecarProcess::class.java)
    @Volatile private var process: Process? = null
    @Volatile private var writer: BufferedWriter? = null
    @Volatile private var disposed = false
    @Volatile private var restarts = 0

    fun start(onEvent: (String) -> Unit, onDead: () -> Unit) {
        val script = extractScript()
        launch(script, onEvent, onDead)
    }

    fun send(json: String) {
        try {
            writer?.let { it.write(json); it.newLine(); it.flush() }
        } catch (e: Exception) {
            log.warn("claude-todos: falha ao escrever no sidecar", e)
        }
    }

    private fun launch(script: File, onEvent: (String) -> Unit, onDead: () -> Unit) {
        if (disposed) return
        val p = ProcessBuilder(nodePath, script.absolutePath)
            .redirectErrorStream(false)
            .start()
        process = p
        writer = p.outputStream.bufferedWriter()

        AppExecutorUtil.getAppExecutorService().execute {
            p.inputStream.bufferedReader().forEachLine { line ->
                if (line.isNotBlank()) onEvent(line)
            }
            // stdout fechou = processo morrendo
            if (!disposed) {
                if (restarts < 1) {
                    restarts++
                    log.warn("claude-todos: sidecar morreu; reiniciando (1/1)")
                    launch(script, onEvent, onDead)
                    sendInit()
                } else {
                    log.warn("claude-todos: sidecar morreu de novo; desistindo")
                    onDead()
                }
            }
        }
        AppExecutorUtil.getAppExecutorService().execute {
            p.errorStream.bufferedReader().forEachLine { log.info("claude-todos sidecar: $it") }
        }
        sendInit()
    }

    private fun sendInit() {
        val claudeDir = System.getenv("CLAUDE_CONFIG_DIR")
            ?: File(System.getProperty("user.home"), ".claude").absolutePath
        val basePath = project.basePath ?: return
        send(buildJsonObject {
            put("cmd", "init"); put("claudeDir", claudeDir)
            putJsonArray("cwds") { add(basePath) }
        }.toString())
        send("""{"cmd":"watch","on":true}""")
    }

    // Extrai o bundle para um path estável por versão do plugin (idempotente).
    private fun extractScript(): File {
        val version = javaClass.classLoader.getResource("claudetodos/core-main.js")
            ?.let { it.hashCode().toString() } ?: "dev"
        val target = File(PathManager.getTempPath(), "claude-todos/$version/core-main.js")
        if (!target.isFile) {
            target.parentFile.mkdirs()
            javaClass.classLoader.getResourceAsStream("claudetodos/core-main.js")!!.use { input ->
                Files.copy(input, target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        }
        return target
    }

    override fun dispose() {
        disposed = true
        try { writer?.close() } catch (_: Exception) {} // stdin EOF → sidecar sai sozinho
        process?.let {
            if (!it.waitFor(2, TimeUnit.SECONDS)) it.destroyForcibly()
        }
    }
}
```

- [ ] **Step 2: Compile**

```bash
cd jetbrains && cmd //c gradlew.bat build --console=plain -x test && cmd //c gradlew.bat test --console=plain
```

Expected: BUILD SUCCESSFUL; testes existentes seguem verdes.

- [ ] **Step 3: Commit**

```bash
cd .. && git add jetbrains/src && git commit -m "feat(jetbrains): SidecarProcess — spawn node, JSON-lines, init+watch, 1 auto-restart (SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `WebviewPanel` + `ClaudeTodosToolWindowFactory` + registro

**Files:**
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/WebviewPanel.kt`
- Create: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ClaudeTodosToolWindowFactory.kt`
- Modify: `jetbrains/src/main/resources/META-INF/plugin.xml` (toolWindow)

**Interfaces:**
- Consumes: `buildHtml`, `ThemeShim`, `NodeLocator`, `SidecarProcess`, `MessageRouter`.
- Produces: tool window "Claude Todos" funcional.

- [ ] **Step 1: Implement `WebviewPanel`**

`WebviewPanel.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import javax.swing.JComponent

/**
 * JBCefBrowser com a webview Svelte inline. JS→Kotlin via JBCefJSQuery
 * (window.__jcefPost); Kotlin→JS via executeJavaScript(window.postMessage) —
 * simétrico ao VS Code, a bridge da webview não distingue os hosts.
 */
class WebviewPanel(parentDisposable: Disposable) {
    private val browser = JBCefBrowser()
    private val query = JBCefJSQuery.create(browser as JBCefBrowserBase)
    val component: JComponent get() = browser.component

    init {
        Disposer.register(parentDisposable, browser)
        Disposer.register(parentDisposable, query)
    }

    fun load(onMessage: (String) -> Unit) {
        query.addHandler { msg -> onMessage(msg); null }
        val bridgeScript = """
            window.__jcefPost = function(json) { ${query.inject("json")} };
        """.trimIndent()
        val css = readResource("claudetodos/index.css")
        val appJs = readResource("claudetodos/main.js")
        browser.loadHTML(buildHtml(css, ThemeShim.cssVariables(), bridgeScript, appJs))
    }

    fun post(json: String) {
        // json é um objeto JSON válido — literal JS válido; sem re-encode.
        browser.cefBrowser.executeJavaScript(
            "window.postMessage($json, '*');", browser.cefBrowser.url, 0,
        )
    }

    fun updateThemeVars() {
        val vars = ThemeShim.cssVariables()
            .removePrefix(":root{").removeSuffix("}")
            .lines().filter { it.isNotBlank() }
            .joinToString("") {
                val (name, value) = it.trim().removeSuffix(";").split(":", limit = 2)
                "document.documentElement.style.setProperty('${name.trim()}', '${value.trim()}');"
            }
        browser.cefBrowser.executeJavaScript(vars, browser.cefBrowser.url, 0)
    }

    private fun readResource(path: String): String =
        javaClass.classLoader.getResourceAsStream(path)!!.bufferedReader().readText()
}
```

- [ ] **Step 2: Implement the factory**

`ClaudeTodosToolWindowFactory.kt`:

```kotlin
package com.carlosdealmeida.claudetodos

import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.util.ui.JBUI
import java.util.Locale
import javax.swing.JPanel
import javax.swing.SwingUtilities

class ClaudeTodosToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val factory = ContentFactory.getInstance()

        if (!JBCefApp.isSupported()) {
            toolWindow.contentManager.addContent(
                factory.createContent(message("Este IDE não suporta JCEF — painel indisponível."), "", false),
            )
            return
        }
        val node = NodeLocator.find()
        if (node == null) {
            toolWindow.contentManager.addContent(
                factory.createContent(
                    message("Node.js não encontrado no PATH. Instale em nodejs.org e reinicie o IDE."), "", false,
                ),
            )
            return
        }

        val panel = WebviewPanel(toolWindow.disposable)
        val sidecar = SidecarProcess(node, project)
        com.intellij.openapi.util.Disposer.register(toolWindow.disposable, sidecar)

        val router = MessageRouter(
            sendToSidecar = sidecar::send,
            sendToWebview = { json -> SwingUtilities.invokeLater { panel.post(json) } },
            locale = ideLocale(),
        )

        panel.load(onMessage = router::onWebviewMessage)
        sidecar.start(
            onEvent = router::onSidecarEvent,
            onDead = {
                SwingUtilities.invokeLater {
                    panel.post("""{"type":"error","message":"sidecar terminated"}""")
                }
            },
        )

        ApplicationManager.getApplication().messageBus.connect(toolWindow.disposable)
            .subscribe(LafManagerListener.TOPIC, LafManagerListener {
                SwingUtilities.invokeLater { panel.updateThemeVars() }
            })

        toolWindow.contentManager.addContent(factory.createContent(panel.component, "", false))
    }

    private fun message(text: String): JPanel = JPanel().apply {
        add(JBLabel(text).apply { border = JBUI.Borders.empty(16) })
    }

    private fun ideLocale(): String = when (Locale.getDefault().language) {
        "pt" -> "pt-br"
        "es" -> "es"
        else -> "en"
    }
}
```

- [ ] **Step 3: Register the tool window**

Em `plugin.xml`, dentro de `<extensions defaultExtensionNs="com.intellij">`:

```xml
<toolWindow id="Claude Todos" anchor="right" secondary="true"
            factoryClass="com.carlosdealmeida.claudetodos.ClaudeTodosToolWindowFactory"/>
```

- [ ] **Step 4: Build + tests + verifyPlugin**

```bash
cd jetbrains && cmd //c gradlew.bat build --console=plain && cmd //c gradlew.bat verifyPlugin --console=plain
```

Expected: BUILD SUCCESSFUL; verifyPlugin sem erros (warnings de ícone são aceitáveis no SP1).

- [ ] **Step 5: Commit**

```bash
cd .. && git add jetbrains/src && git commit -m "feat(jetbrains): tool window + WebviewPanel JCEF + gates e tema ao vivo (SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: smoke `runIde` + fechamento

**Files:**
- Modify: `docs/specs/2026-07-17-jetbrains-port-overview.md` (marcar SP1)

- [ ] **Step 1: Suites completas dos dois toolchains**

Na raiz: `npm test` (285+) e `npm run build`.
Em `jetbrains/`: `cmd //c gradlew.bat test build --console=plain`.
Expected: tudo verde.

- [ ] **Step 2: Smoke no IDE real**

```bash
cd jetbrains && cmd //c gradlew.bat runIde --console=plain
```

(Primeira execução baixa o IDE — minutos.) No IDE sandbox: abrir a pasta deste repo
(`c:\@work\MyProjects\claude-todos-vscode`), abrir o tool window "Claude Todos" (borda
direita) e conferir o gate de aceite do SP1: painel renderiza com o tema do IDE, mostra a
sessão ativa real (árvore de agentes + tokens + contexto) e atualiza ao vivo quando uma
sessão Claude Code roda. Trocar o tema do IDE (Settings → Appearance) e confirmar que as
cores acompanham sem reload.

Se o ambiente bloquear GUI (limitação conhecida de spawnar apps daqui), reportar
DONE_WITH_CONCERNS com o passo humano pendente e validar o proxy: `runIde` chega a subir?
`idea.log` do sandbox (`jetbrains/build/idea-sandbox/*/log/idea.log`) registra o spawn do
sidecar sem exceções?

- [ ] **Step 3: Mark SP1 in the overview**

Na tabela do overview, célula "Entregável" do SP1: prefixar
"✅ **concluído YYYY-MM-DD** (commits …) — " mantendo o texto (padrão do SP0). Se o smoke
ficou pendente de humano, usar "🚧 **implementado YYYY-MM-DD — smoke humano pendente** — ".

- [ ] **Step 4: Commit**

```bash
git add docs/specs/2026-07-17-jetbrains-port-overview.md
git commit -m "docs(specs): SP1 — painel JCEF read-only no IntelliJ (porta JetBrains)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
