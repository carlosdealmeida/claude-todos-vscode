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
import java.util.concurrent.TimeUnit
import java.util.zip.CRC32

/**
 * Processo sidecar: `node core-main.js` falando JSON-lines. Extrai o bundle dos
 * resources para um path estável por conteúdo (CRC32); envia init+watch no start; lê o
 * stdout num executor; 1 auto-restart em morte inesperada, depois onDead.
 */
class SidecarProcess(
    private val nodePath: String,
    private val project: Project,
) : Disposable {
    private val log = Logger.getInstance(SidecarProcess::class.java)
    private val lock = Any()
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
        val p: Process
        synchronized(lock) {
            if (disposed) return
            p = ProcessBuilder(nodePath, script.absolutePath)
                .redirectErrorStream(false)
                .start()
            try { writer?.close() } catch (_: Exception) {} // fecha o writer antigo antes de trocar
            process = p
            writer = p.outputStream.bufferedWriter()
        }

        AppExecutorUtil.getAppExecutorService().execute {
            p.inputStream.bufferedReader().forEachLine { line ->
                if (line.isNotBlank()) onEvent(line)
            }
            // stdout fechou = processo morrendo
            if (!disposed) {
                if (restarts < 1) {
                    restarts++
                    log.warn("claude-todos: sidecar morreu; reiniciando (1/1)")
                    try {
                        launch(script, onEvent, onDead)
                    } catch (e: Exception) {
                        log.warn("claude-todos: falha ao reiniciar sidecar", e)
                        onDead()
                    }
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

    // Extrai o bundle para um path estável por CONTEÚDO (idempotente; nunca serve bundle stale em dev).
    private fun extractScript(): File {
        val bytes = javaClass.classLoader.getResourceAsStream("claudetodos/core-main.js")!!.use { it.readBytes() }
        val target = File(PathManager.getTempPath(), "claude-todos/${contentKey(bytes)}/core-main.js")
        if (!target.isFile) {
            target.parentFile.mkdirs()
            target.writeBytes(bytes)
        }
        return target
    }

    override fun dispose() {
        val p: Process?
        val w: BufferedWriter?
        synchronized(lock) {
            disposed = true
            p = process
            w = writer
        }
        try { w?.close() } catch (_: Exception) {} // stdin EOF → sidecar sai sozinho
        p?.let {
            if (!it.waitFor(2, TimeUnit.SECONDS)) it.destroyForcibly()
        }
    }
}

/** Chave de conteúdo (CRC32 em hex) usada para nomear o dir de extração do bundle — estável entre rebuilds. */
internal fun contentKey(bytes: ByteArray): String {
    val crc = CRC32()
    crc.update(bytes)
    return crc.value.toString(16)
}
