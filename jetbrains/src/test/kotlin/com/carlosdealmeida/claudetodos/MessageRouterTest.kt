package com.carlosdealmeida.claudetodos

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MessageRouterTest {
    private val toSidecar = mutableListOf<String>()
    private val toWebview = mutableListOf<String>()

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

    @Test fun `sp2 messages are routed instead of ignored`() {
        router.onWebviewMessage("""{"type":"openTodoSource","sessionId":"s","agentId":"a","line":3}""")
        router.onWebviewMessage("""{"type":"pickSession"}""")
        router.onWebviewMessage("""{"type":"openPanel"}""")
        assertEquals("resolveTodoSource", parse(toSidecar[0])["cmd"]!!.jsonPrimitive.content)
        assertEquals("listSessions", parse(toSidecar[1])["cmd"]!!.jsonPrimitive.content)
        assertEquals(1, host.activated)
        assertTrue(toWebview.isEmpty())
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
}
