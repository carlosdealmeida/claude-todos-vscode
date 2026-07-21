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
