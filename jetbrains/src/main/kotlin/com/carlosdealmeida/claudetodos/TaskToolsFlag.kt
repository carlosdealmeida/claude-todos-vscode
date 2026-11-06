package com.carlosdealmeida.claudetodos

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

enum class FlagState { ON, OFF, ABSENT }

/**
 * Gemeo em Kotlin de taskToolsGate.ts (leitura) e ClaudeSettingsFile.setEnv (gravacao).
 * A leitura e tolerante; a gravacao e estrita: arquivo invalido nunca e sobrescrito.
 */
object TaskToolsFlag {
    const val ENV = "CLAUDE_CODE_ENABLE_TODO_TOOLS"

    @OptIn(ExperimentalSerializationApi::class)
    private val pretty = Json {
        prettyPrint = true
        prettyPrintIndent = "  "
    }

    fun stateOf(value: JsonElement?): FlagState {
        if (value == null || value is JsonNull) return FlagState.ABSENT
        if (value !is JsonPrimitive) return FlagState.ABSENT
        return when (value.content.trim().lowercase()) {
            "1", "true" -> FlagState.ON
            "0", "false" -> FlagState.OFF
            else -> FlagState.ABSENT
        }
    }

    fun combine(states: List<FlagState>): FlagState = when {
        FlagState.ON in states -> FlagState.ON
        FlagState.OFF in states -> FlagState.OFF
        else -> FlagState.ABSENT
    }

    fun readFile(file: File): FlagState = try {
        val root = Json.parseToJsonElement(file.readText(Charsets.UTF_8)) as? JsonObject
        val env = root?.get("env") as? JsonObject
        stateOf(env?.get(ENV))
    } catch (_: Exception) {
        FlagState.ABSENT
    }

    fun read(env: Map<String, String>, userSettings: File, projectBase: String?): FlagState {
        val files = mutableListOf(userSettings)
        if (!projectBase.isNullOrEmpty()) {
            val claude = File(projectBase, ".claude")
            files += File(claude, "settings.json")
            files += File(claude, "settings.local.json")
        }
        return combine(
            listOf(stateOf(env[ENV]?.let { JsonPrimitive(it) })) + files.map { readFile(it) },
        )
    }

    /** true = o arquivo mudou. Lanca IllegalStateException se o arquivo existe e e invalido. */
    fun enable(settings: File): Boolean {
        val root: JsonObject = if (settings.exists()) {
            val parsed = try {
                Json.parseToJsonElement(settings.readText(Charsets.UTF_8))
            } catch (e: Exception) {
                throw IllegalStateException("settings.json is not valid JSON (${settings.path}): ${e.message}", e)
            }
            parsed as? JsonObject
                ?: throw IllegalStateException("settings.json is not valid JSON (${settings.path}): top-level value is not an object")
        } else {
            JsonObject(emptyMap())
        }
        val envElement = root["env"]
        if (envElement != null && envElement !is JsonObject) {
            throw IllegalStateException("settings.json is not valid JSON (${settings.path}): env is not an object")
        }
        val env = envElement as? JsonObject ?: JsonObject(emptyMap())
        val current = env[ENV]
        if (current is JsonPrimitive && current.isString && current.content == "1") return false

        val newEnv = JsonObject(LinkedHashMap(env).apply { put(ENV, JsonPrimitive("1")) })
        val newRoot = JsonObject(LinkedHashMap(root).apply { put("env", newEnv) })
        writeAtomic(settings, pretty.encodeToString(JsonElement.serializer(), newRoot))
        return true
    }

    private fun writeAtomic(target: File, text: String) {
        val dir = target.absoluteFile.parentFile
        dir.mkdirs()
        val tmp = Files.createTempFile(dir.toPath(), target.name, ".tmp")
        try {
            Files.write(tmp, text.toByteArray(Charsets.UTF_8))
            Files.move(tmp, target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } finally {
            Files.deleteIfExists(tmp)
        }
    }
}
