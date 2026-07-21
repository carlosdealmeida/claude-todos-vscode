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
