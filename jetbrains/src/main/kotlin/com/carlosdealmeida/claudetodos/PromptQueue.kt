package com.carlosdealmeida.claudetodos

import com.intellij.openapi.components.Service
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Serializa os convites do projeto: nunca dois na tela ao mesmo tempo.
 * `show` recebe `done`, que libera o proximo; chamar `done` mais de uma vez nao tem efeito.
 */
class PromptQueue {
    private val lock = Any()
    private val pending = ArrayDeque<(done: () -> Unit) -> Unit>()
    private var busy = false

    fun enqueue(show: (done: () -> Unit) -> Unit) {
        synchronized(lock) {
            if (busy) {
                pending.add(show)
                return
            }
            busy = true
        }
        run(show)
    }

    private fun run(show: (done: () -> Unit) -> Unit) {
        val released = AtomicBoolean(false)
        show {
            if (released.compareAndSet(false, true)) next()?.let { run(it) }
        }
    }

    // Devolve o proximo da fila, ou marca a fila como livre.
    private fun next(): ((done: () -> Unit) -> Unit)? = synchronized(lock) {
        val n = pending.poll()
        if (n == null) busy = false
        n
    }
}

@Service(Service.Level.PROJECT)
class ClaudeTodosPrompts {
    val queue = PromptQueue()
}
