package com.carlosdealmeida.claudetodos

// Catálogo mínimo de strings nativas (toasts, prompt de hook, picker, tempo relativo).
// Textos copiados verbatim de src/i18n/messages.ts — manter em sincronia manual.
object NotifyMessages {
    val KEYS: List<String> = listOf(
        "notify.idle", "notify.allComplete", "notify.awaitingQuestion", "notify.awaitingPlan",
        "notify.openPanel", "notify.disable",
        "hook.promptMessage", "hook.install", "hook.notNow", "hook.dontAskAgain",
        "hook.installedAuto", "hook.installFailed",
        "todo.sourceMissing", "picker.auto",
        "time.now", "time.minutesAgo", "time.hoursAgo", "time.daysAgo",
    )

    private val catalog: Map<String, Map<String, String>> = mapOf(
        "en" to mapOf(
            "notify.idle" to "\"{title}\" — waiting for you",
            "notify.allComplete" to "\"{title}\" — all tasks completed",
            "notify.awaitingQuestion" to "\"{title}\" — waiting for your answer",
            "notify.awaitingPlan" to "\"{title}\" — plan awaiting approval",
            "notify.openPanel" to "Open panel",
            "notify.disable" to "Don't notify",
            "hook.promptMessage" to "Claude Todos needs to install hooks (SessionStart + UserPromptSubmit) in ~/.claude/settings.json to detect Claude Code sessions for this workspace. UserPromptSubmit allows in-progress sessions to be tracked on the next message.",
            "hook.install" to "Install",
            "hook.notNow" to "Not now",
            "hook.dontAskAgain" to "Don't ask again",
            "hook.installedAuto" to "Claude Todos hooks installed. In-progress Claude Code sessions will be tracked on their next message; new sessions are tracked immediately.",
            "hook.installFailed" to "Failed to install hooks: {error}",
            "todo.sourceMissing" to "Transcript not found (the session may have been deleted)",
            "picker.auto" to "Auto",
            "time.now" to "just now",
            "time.minutesAgo" to "{n} min ago",
            "time.hoursAgo" to "{n} h ago",
            "time.daysAgo" to "{n} d ago",
        ),
        "pt-br" to mapOf(
            "notify.idle" to "\"{title}\" — aguardando você",
            "notify.allComplete" to "\"{title}\" — todas as tasks concluídas",
            "notify.awaitingQuestion" to "\"{title}\" — aguardando sua resposta",
            "notify.awaitingPlan" to "\"{title}\" — plano aguardando aprovação",
            "notify.openPanel" to "Abrir painel",
            "notify.disable" to "Não notificar",
            "hook.promptMessage" to "O Claude Todos precisa instalar hooks (SessionStart + UserPromptSubmit) em ~/.claude/settings.json para detectar sessões do Claude Code neste workspace. O UserPromptSubmit permite acompanhar sessões em andamento na próxima mensagem.",
            "hook.install" to "Instalar",
            "hook.notNow" to "Agora não",
            "hook.dontAskAgain" to "Não perguntar novamente",
            "hook.installedAuto" to "Hooks do Claude Todos instalados. Sessões do Claude Code em andamento serão acompanhadas na próxima mensagem; sessões novas são acompanhadas imediatamente.",
            "hook.installFailed" to "Falha ao instalar hooks: {error}",
            "todo.sourceMissing" to "Transcript não encontrado (a sessão pode ter sido apagada)",
            "picker.auto" to "Auto",
            "time.now" to "agora",
            "time.minutesAgo" to "há {n} min",
            "time.hoursAgo" to "há {n} h",
            "time.daysAgo" to "há {n} d",
        ),
        "es" to mapOf(
            "notify.idle" to "\"{title}\" — esperándote",
            "notify.allComplete" to "\"{title}\" — todas las tareas completadas",
            "notify.awaitingQuestion" to "\"{title}\" — esperando tu respuesta",
            "notify.awaitingPlan" to "\"{title}\" — plan esperando aprobación",
            "notify.openPanel" to "Abrir panel",
            "notify.disable" to "No notificar",
            "hook.promptMessage" to "Claude Todos necesita instalar hooks (SessionStart + UserPromptSubmit) en ~/.claude/settings.json para detectar sesiones de Claude Code en este espacio de trabajo. UserPromptSubmit permite seguir sesiones en curso en el próximo mensaje.",
            "hook.install" to "Instalar",
            "hook.notNow" to "Ahora no",
            "hook.dontAskAgain" to "No volver a preguntar",
            "hook.installedAuto" to "Hooks de Claude Todos instalados. Las sesiones de Claude Code en curso se seguirán en su próximo mensaje; las sesiones nuevas se siguen de inmediato.",
            "hook.installFailed" to "Error al instalar los hooks: {error}",
            "todo.sourceMissing" to "Transcript no encontrado (la sesión puede haber sido eliminada)",
            "picker.auto" to "Auto",
            "time.now" to "ahora",
            "time.minutesAgo" to "hace {n} min",
            "time.hoursAgo" to "hace {n} h",
            "time.daysAgo" to "hace {n} d",
        ),
    )

    fun get(locale: String, key: String, vararg args: Pair<String, String>): String {
        val base = catalog[locale]?.get(key) ?: catalog.getValue("en").getValue(key)
        return args.fold(base) { acc, (name, value) -> acc.replace("{$name}", value) }
    }

    fun toastMessage(locale: String, kinds: List<String>, awaitingInput: String?, title: String): String? = when {
        kinds.isEmpty() -> null
        "allComplete" in kinds -> get(locale, "notify.allComplete", "title" to title)
        "awaitingInput" in kinds ->
            get(locale, if (awaitingInput == "plan") "notify.awaitingPlan" else "notify.awaitingQuestion", "title" to title)
        else -> get(locale, "notify.idle", "title" to title)
    }
}
