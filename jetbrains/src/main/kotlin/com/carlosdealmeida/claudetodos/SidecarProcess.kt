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
