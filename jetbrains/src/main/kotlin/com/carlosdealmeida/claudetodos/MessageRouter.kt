package com.carlosdealmeida.claudetodos

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put

/**
 * Pontes nativas que o `MessageRouter` aciona quando o sidecar responde a um request
 * iniciado pela webview (abrir transcript, escolher sessão) ou empurra uma notificação
 * (idle/allComplete/awaitingInput) fora do fluxo normal snapshot/projectUsage/error.
 * Implementada pela factory (SP2); nos testes, por um fake.
 */
interface RouterHost {
    fun openFile(path: String, line: Int)
    fun pickSession(sessions: List<SessionItem>, onPick: (String?) -> Unit)
    fun onNotification(kinds: List<String>, awaitingInput: String?, title: String?)
    fun activatePanel()
    fun warn(messageKey: String)
}

data class SessionItem(val sessionId: String, val title: String, val updatedAt: Long)

/**
 * Traduz entre os vocabulários da webview (ExtensionMessage/WebviewMessage) e do
 * sidecar (CoreCommand/CoreEvent). Puro: I/O injetado por lambdas; payloads
 * (snapshot/usage) passam OPACOS — o plugin não modela o schema interno.
 *
 * Requests que precisam de uma resposta específica do sidecar (resolveTodoSource,
 * listSessions, hookStatus, installHook) viajam com um `id` gerado aqui; a resposta é
 * casada de volta via `pending` e nunca chega à webview.
 */
class MessageRouter(
    private val sendToSidecar: (String) -> Unit,
    private val sendToWebview: (String) -> Unit,
    private val locale: String,
    private val host: RouterHost,
) {
    // Acessados de múltiplas threads (CEF/pool/EDT) — estruturas thread-safe
    private val nextId = AtomicInteger(0)
    private val pending = ConcurrentHashMap<String, (JsonObject) -> Unit>()

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
            "openTodoSource" -> {
                val sessionId = msg["sessionId"]?.jsonPrimitive?.content ?: return
                val agentId = msg["agentId"]?.jsonPrimitive?.content ?: return
                val line = msg["line"]?.jsonPrimitive?.intOrNull ?: 0
                val id = "src-${nextId.getAndIncrement()}"
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
                val id = "pick-${nextId.getAndIncrement()}"
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
            else -> Unit
        }
    }

    fun onSidecarEvent(json: String) {
        val ev = parse(json) ?: return

        val id = ev["id"]?.jsonPrimitive?.contentOrNull
        if (id != null) { pending.remove(id)?.invoke(ev); return } // resposta a request nosso; id desconhecido: ignora

        val type = ev["ev"]?.jsonPrimitive?.content
        when (type) {
            "notification" -> {
                host.onNotification(
                    ev["kinds"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                    ev["awaitingInput"]?.jsonPrimitive?.contentOrNull,
                    ev["title"]?.jsonPrimitive?.contentOrNull,
                )
                return
            }
        }

        val out = when (type) {
            "snapshot" -> buildJsonObject {
                put("type", "snapshot"); put("snapshot", ev["snapshot"] ?: JsonNull)
            }
            "projectUsage" -> buildJsonObject {
                put("type", "projectUsage"); put("usage", ev["usage"] ?: JsonNull)
            }
            "error" -> buildJsonObject {
                put("type", "error"); put("message", ev["message"] ?: JsonNull)
            }
            else -> null // sessions/todoSource sem id: sem consumidor (respostas normais vêm com id)
        }
        if (out != null) sendToWebview(out.toString())
        if (type == "snapshot") sendToSidecar("""{"cmd":"observe"}""") // detecção event-driven
    }

    /** Host-iniciado: pede ao sidecar que reavalie kinds/awaitingInput e empurre `notification`. */
    fun observe() { sendToSidecar("""{"cmd":"observe"}""") }

    fun requestHookStatus(scriptPath: String, onResult: (Boolean) -> Unit) {
        val id = "hs-${nextId.getAndIncrement()}"
        pending[id] = { ev -> onResult(ev["installed"]?.jsonPrimitive?.booleanOrNull ?: false) }
        sendToSidecar(buildJsonObject { put("cmd", "hookStatus"); put("hookScriptPath", scriptPath); put("id", id) }.toString())
    }

    fun installHook(scriptPath: String, onDone: (Boolean) -> Unit) {
        val id = "ih-${nextId.getAndIncrement()}"
        pending[id] = { ev -> onDone(ev["ev"]?.jsonPrimitive?.content == "hookInstalled") }
        sendToSidecar(buildJsonObject { put("cmd", "installHook"); put("hookScriptPath", scriptPath); put("id", id) }.toString())
    }

    private fun parse(json: String) =
        runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull()
}
