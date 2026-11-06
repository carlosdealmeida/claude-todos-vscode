package com.carlosdealmeida.claudetodos

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationType
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.util.messages.Topic
import java.io.File

/**
 * Convite da flag das task tools, usado pela startup activity (abertura do projeto) e pelo factory
 * (depois de instalar o hook). As decisoes ficam em TaskToolsPromptSlot; aqui so a fiacao do IDE.
 */
object TaskToolsPrompt {
    /** Flag ausente em todas as fontes e sem a dispensa gravada, lidos agora. */
    fun offerNow(project: Project): Boolean = TaskToolsPromptSlot.shouldOffer(
        TaskToolsFlag.read(System.getenv(), File(HookSetup.settingsPath()), project.basePath),
        PropertiesComponent.getInstance().getBoolean(NotificationBridge.TASK_TOOLS_DISMISSED, false),
    )

    fun enqueue(project: Project, bridge: NotificationBridge, locale: String) {
        project.service<ClaudeTodosPrompts>().queue.enqueue { done -> show(project, bridge, locale, done) }
    }

    private fun show(project: Project, bridge: NotificationBridge, locale: String, done: () -> Unit) {
        if (project.isDisposed) { done(); return }
        when (project.service<ClaudeTodosPrompts>().taskTools.onShow(offerNow(project))) {
            TaskToolsShow.SKIP -> done()
            TaskToolsShow.CONFIRM_HOOK -> { bridge.confirmHookInstalled(); done() }
            TaskToolsShow.PROMPT -> prompt(project, bridge, locale, afterHook = false, done)
            TaskToolsShow.PROMPT_AFTER_HOOK -> prompt(project, bridge, locale, afterHook = true, done)
        }
    }

    private fun prompt(project: Project, bridge: NotificationBridge, locale: String, afterHook: Boolean, done: () -> Unit) {
        bridge.promptTaskTools(
            afterHook = afterHook,
            onEnable = { finish ->
                try { confirmAndEnable(project, bridge, locale) } finally { finish() }
            },
            onDone = done,
        )
    }

    // Roda na EDT (clique na notificacao): o modal e sincrono, entao ao voltar daqui a
    // notificacao do resultado ja saiu e o proximo convite pode aparecer.
    private fun confirmAndEnable(project: Project, bridge: NotificationBridge, locale: String) {
        val settings = HookSetup.settingsPath()
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
            // Painel aberto pede um snapshot novo para a faixa sumir; sem painel, ninguem escuta.
            project.messageBus.syncPublisher(TaskToolsListener.TOPIC).taskToolsEnabled()
        } catch (e: Exception) {
            bridge.notify(
                "taskTools.failed",
                mapOf("path" to settings, "error" to (e.message ?: e.toString())),
                NotificationType.ERROR,
            )
        }
    }
}

fun interface TaskToolsListener {
    fun taskToolsEnabled()

    companion object {
        val TOPIC: Topic<TaskToolsListener> =
            Topic.create("claudeTodos.taskToolsEnabled", TaskToolsListener::class.java)
    }
}
