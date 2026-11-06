package com.carlosdealmeida.claudetodos

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.wm.ToolWindowManager
import java.util.Locale

// Ao abrir o projeto, oferece ligar as task tools quando a flag esta ausente em todas as fontes
// e a dispensa nao esta gravada. As duas coisas sao relidas quando chega a vez do convite na fila.
class TaskToolsStartupActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        if (!TaskToolsPrompt.offerNow(project)) return

        val locale = LocaleResolver.resolve(Locale.getDefault())
        val bridge = NotificationBridge(project, locale, activatePanel = {
            ApplicationManager.getApplication().invokeLater {
                ToolWindowManager.getInstance(project).getToolWindow("Claude Todos")?.activate(null)
            }
        })
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            // O factory pode ter enfileirado antes (hook instalado): nao enfileira duas vezes.
            if (project.service<ClaudeTodosPrompts>().taskTools.claim()) TaskToolsPrompt.enqueue(project, bridge, locale)
        }
    }
}
