package com.carlosdealmeida.claudetodos

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.WindowManager

// Toasts nativos com os MESMOS gates do VS Code (maybeToast): setting ligado +
// janela do IDE sem foco. A detecção roda sempre; só a exibição é gateada.
class NotificationBridge(
    private val project: Project,
    private val locale: String,
    private val activatePanel: () -> Unit,
) {
    private val props get() = PropertiesComponent.getInstance()

    fun toast(kinds: List<String>, awaitingInput: String?, title: String?) {
        if (title == null) return
        if (!props.getBoolean("claudeTodos.notifications", true)) return
        if (WindowManager.getInstance().getFrame(project)?.isActive == true) return
        val message = NotifyMessages.toastMessage(locale, kinds, awaitingInput, title) ?: return
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(message, NotificationType.INFORMATION)
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "notify.openPanel")) { activatePanel() })
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "notify.disable")) {
                props.setValue("claudeTodos.notifications", false, true)
            })
            .notify(project)
    }

    fun warn(messageKey: String) {
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(NotifyMessages.get(locale, messageKey), NotificationType.WARNING)
            .notify(project)
    }

    fun notify(messageKey: String, args: Map<String, String>, type: NotificationType) {
        val text = NotifyMessages.get(locale, messageKey, *args.map { it.key to it.value }.toTypedArray())
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(text, type)
            .notify(project)
    }

    // onDone libera a fila de convites quando a notificacao expira. Instalar/Ativar so expira
    // quando o trabalho do clique chama `finish` (InviteGate); os outros botoes, na hora.
    // Fechar no X nao expira: o proximo convite espera.
    fun promptHookInstall(onInstall: (finish: () -> Unit) -> Unit, onDone: () -> Unit) {
        if (props.getBoolean(HOOK_DISMISSED, false)) { onDone(); return }
        invite("hook.promptMessage", "hook.install", HOOK_DISMISSED, onInstall, onDone)
    }

    fun promptTaskTools(afterHook: Boolean, onEnable: (finish: () -> Unit) -> Unit, onDone: () -> Unit) {
        if (props.getBoolean(TASK_TOOLS_DISMISSED, false)) { onDone(); return }
        val messageKey = if (afterHook) "taskTools.promptAfterHook" else "taskTools.promptMessage"
        invite(messageKey, "taskTools.enable", TASK_TOOLS_DISMISSED, onEnable, onDone)
    }

    private fun invite(
        messageKey: String,
        primaryKey: String,
        dismissKey: String,
        onPrimary: (finish: () -> Unit) -> Unit,
        onDone: () -> Unit,
    ) {
        val notification = NotificationGroupManager.getInstance().getNotificationGroup("claude-todos-sticky")
            .createNotification(NotifyMessages.get(locale, messageKey), NotificationType.INFORMATION)
        val gate = InviteGate(hide = notification::hideBalloon, expire = notification::expire)
        notification
            .addAction(NotificationAction.create(NotifyMessages.get(locale, primaryKey)) { _, _ -> gate.primary(onPrimary) })
            .addAction(NotificationAction.create(NotifyMessages.get(locale, "hook.notNow")) { _, _ -> gate.secondary {} })
            .addAction(NotificationAction.create(NotifyMessages.get(locale, "hook.dontAskAgain")) { _, _ ->
                gate.secondary { props.setValue(dismissKey, true) }
            })
        notification.whenExpired { onDone() }
        notification.notify(project)
    }

    fun confirmHookInstalled() {
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(NotifyMessages.get(locale, "hook.installedAuto"), NotificationType.INFORMATION)
            .notify(project)
    }

    fun hookInstallFailed(error: String) {
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(NotifyMessages.get(locale, "hook.installFailed", "error" to error), NotificationType.ERROR)
            .notify(project)
    }

    companion object {
        const val HOOK_DISMISSED = "claudeTodos.hookPromptDismissed"
        const val TASK_TOOLS_DISMISSED = "claudeTodos.taskToolsPromptDismissed"
    }
}
