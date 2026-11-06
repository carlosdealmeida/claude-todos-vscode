package com.carlosdealmeida.claudetodos

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Botoes de um convite. Expirar a notificacao libera a fila (whenExpired -> done), entao o botao
 * primario (Instalar/Ativar) so expira quando o trabalho dele termina: ate la o proximo convite
 * espera. O balao some no clique. Vale o primeiro clique; os seguintes nao fazem nada.
 */
class InviteGate(private val hide: () -> Unit, private val expire: () -> Unit) {
    private val answered = AtomicBoolean(false)

    fun primary(work: (finish: () -> Unit) -> Unit) {
        if (!answered.compareAndSet(false, true)) return
        hide()
        try {
            work(expire)
        } catch (e: Throwable) {
            expire()
            throw e
        }
    }

    fun secondary(action: () -> Unit) {
        if (!answered.compareAndSet(false, true)) return
        try {
            action()
        } finally {
            expire()
        }
    }
}
