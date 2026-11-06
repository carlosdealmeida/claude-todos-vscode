package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class InviteGateTest {
    private val log = mutableListOf<String>()
    private val gate = InviteGate(hide = { log += "hide" }, expire = { log += "expire" })

    @Test fun `primario esconde o balao e so expira quando o trabalho termina`() {
        var finish: () -> Unit = {}
        gate.primary { f -> log += "work"; finish = f }
        assertEquals(listOf("hide", "work"), log)
        finish()
        assertEquals(listOf("hide", "work", "expire"), log)
    }

    @Test fun `secundario roda e expira na hora`() {
        gate.secondary { log += "dismiss" }
        assertEquals(listOf("dismiss", "expire"), log)
    }

    @Test fun `clique depois do primario e ignorado`() {
        gate.primary { log += "work" }
        gate.primary { log += "work again" }
        gate.secondary { log += "dismiss" }
        assertEquals(listOf("hide", "work"), log)
    }

    @Test fun `clique depois do secundario e ignorado`() {
        gate.secondary { log += "not now" }
        gate.primary { log += "work" }
        assertEquals(listOf("not now", "expire"), log)
    }

    @Test fun `primario que lanca expira e relanca`() {
        assertFailsWith<IllegalStateException> { gate.primary { throw IllegalStateException("boom") } }
        assertEquals(listOf("hide", "expire"), log)
    }
}
