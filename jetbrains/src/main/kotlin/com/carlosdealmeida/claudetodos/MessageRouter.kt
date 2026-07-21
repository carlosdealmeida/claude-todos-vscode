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
