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

    fun promptHookInstall(onInstall: () -> Unit) {
        if (props.getBoolean("claudeTodos.hookPromptDismissed", false)) return
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos-sticky")
            .createNotification(NotifyMessages.get(locale, "hook.promptMessage"), NotificationType.INFORMATION)
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "hook.install")) { onInstall() })
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "hook.notNow")) {})
            .addAction(NotificationAction.createSimpleExpiring(NotifyMessages.get(locale, "hook.dontAskAgain")) {
                props.setValue("claudeTodos.hookPromptDismissed", true)
            })
            .notify(project)
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
}
