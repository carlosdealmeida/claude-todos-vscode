package com.carlosdealmeida.claudetodos

import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindowManager
import java.io.File
import java.util.Locale

// Ao abrir o projeto, oferece ligar as task tools quando a flag esta ausente em todas as fontes.
// Dispensa gravada ("Nao perguntar mais") e checada em NotificationBridge.promptTaskTools.
class TaskToolsStartupActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        val settings = HookSetup.settingsPath()
        if (TaskToolsFlag.read(System.getenv(), File(settings), project.basePath) != FlagState.ABSENT) return

        val locale = LocaleResolver.resolve(Locale.getDefault())
        val bridge = NotificationBridge(project, locale, activatePanel = {
            ApplicationManager.getApplication().invokeLater {
                ToolWindowManager.getInstance(project).getToolWindow("Claude Todos")?.activate(null)
            }
        })
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            project.service<ClaudeTodosPrompts>().queue.enqueue { done ->
                bridge.promptTaskTools(onEnable = { confirmAndEnable(project, bridge, locale, settings) }, onDone = done)
            }
        }
    }

    private fun confirmAndEnable(project: Project, bridge: NotificationBridge, locale: String, settings: String) {
        val answer = Messages.showYesNoDialog(
            project,
            NotifyMessages.get(locale, "taskTools.confirm", "path" to settings),
            "Claude Todos",
            NotifyMessages.get(locale, "taskTools.enable"),
            NotifyMessages.get(locale, "taskTools.cancel"),
            Messages.getQuestionIcon(),
        )
        if (answer != Messages.YES) return
        try {
            val changed = TaskToolsFlag.enable(File(settings))
            bridge.notify(
                if (changed) "taskTools.enabled" else "taskTools.alreadyEnabled",
                mapOf("path" to settings),
                NotificationType.INFORMATION,
            )
        } catch (e: Exception) {
            bridge.notify(
                "taskTools.failed",
                mapOf("path" to settings, "error" to (e.message ?: e.toString())),
                NotificationType.ERROR,
            )
        }
    }
}
