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
