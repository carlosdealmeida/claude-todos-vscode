package com.carlosdealmeida.claudetodos

/** O que o factory faz quando o hook acabou de ser instalado. */
enum class HookFollowUp {
    /** Nao vem convite da flag em seguida: mostra a confirmacao "hooks instalados". */
    CONFIRM,

    /** Enfileira o convite da flag, que sai com o texto after-hook no lugar da confirmacao. */
    ENQUEUE_PROMPT,

    /** O convite da flag ja esta na fila e vai sair com o texto after-hook. */
    PROMPT_ALREADY_QUEUED,
}

/** O que o convite da flag faz quando chega a vez dele na fila. */
enum class TaskToolsShow { PROMPT, PROMPT_AFTER_HOOK, CONFIRM_HOOK, SKIP }

/**
 * Estado do convite da flag numa sessao de projeto: entra na fila uma vez (startup activity ou
 * factory, o que vier antes) e sai uma vez. Decide tambem se a confirmacao do hook vira texto do
 * convite (spec: a confirmacao nao sai como toast separado quando o convite da flag vem em seguida).
 */
class TaskToolsPromptSlot {
    private enum class State { NONE, QUEUED, SHOWN }

    private var state = State.NONE
    private var afterHook = false

    /** true = quem chamou deve enfileirar o convite. */
    @Synchronized fun claim(): Boolean {
        if (state != State.NONE) return false
        state = State.QUEUED
        return true
    }

    /** [offer]: flag ausente e sem a dispensa, lidos agora. */
    @Synchronized fun onHookInstalled(offer: Boolean): HookFollowUp {
        if (!offer) return HookFollowUp.CONFIRM
        return when (state) {
            State.NONE -> { state = State.QUEUED; afterHook = true; HookFollowUp.ENQUEUE_PROMPT }
            State.QUEUED -> { afterHook = true; HookFollowUp.PROMPT_ALREADY_QUEUED }
            State.SHOWN -> HookFollowUp.CONFIRM
        }
    }

    /** [offer] relido na hora de mostrar: a flag ou a dispensa podem ter mudado desde a fila. */
    @Synchronized fun onShow(offer: Boolean): TaskToolsShow {
        state = State.SHOWN
        return when {
            offer && afterHook -> TaskToolsShow.PROMPT_AFTER_HOOK
            offer -> TaskToolsShow.PROMPT
            afterHook -> TaskToolsShow.CONFIRM_HOOK
            else -> TaskToolsShow.SKIP
        }
    }

    companion object {
        fun shouldOffer(flag: FlagState, dismissed: Boolean): Boolean = flag == FlagState.ABSENT && !dismissed
    }
}
