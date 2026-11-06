package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals

class PromptQueueTest {
    @Test fun `fila vazia mostra na hora`() {
        val q = PromptQueue()
        val ran = mutableListOf<Int>()
        q.enqueue { ran += 1 }
        assertEquals(listOf(1), ran)
    }

    @Test fun `segundo espera o done do primeiro`() {
        val q = PromptQueue()
        val ran = mutableListOf<Int>()
        var done1: () -> Unit = {}
        q.enqueue { d -> ran += 1; done1 = d }
        q.enqueue { ran += 2 }
        assertEquals(listOf(1), ran)
        done1()
        assertEquals(listOf(1, 2), ran)
    }

    @Test fun `done repetido nao pula ninguem`() {
        val q = PromptQueue()
        val ran = mutableListOf<Int>()
        var done1: () -> Unit = {}
        q.enqueue { d -> ran += 1; done1 = d }
        q.enqueue { ran += 2 }
        q.enqueue { ran += 3 }
        done1()
        done1()
        assertEquals(listOf(1, 2), ran)
    }

    @Test fun `show que chama done na hora libera o proximo`() {
        val q = PromptQueue()
        val ran = mutableListOf<Int>()
        q.enqueue { d -> ran += 1; d() }
        q.enqueue { ran += 2 }
        assertEquals(listOf(1, 2), ran)
    }
}
