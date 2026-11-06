package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TaskToolsPromptSlotTest {
    @Test fun `oferece so com a flag ausente e sem a dispensa`() {
        assertTrue(TaskToolsPromptSlot.shouldOffer(FlagState.ABSENT, dismissed = false))
        assertFalse(TaskToolsPromptSlot.shouldOffer(FlagState.ABSENT, dismissed = true))
        assertFalse(TaskToolsPromptSlot.shouldOffer(FlagState.ON, dismissed = false))
        assertFalse(TaskToolsPromptSlot.shouldOffer(FlagState.OFF, dismissed = false))
    }

    @Test fun `convite da flag entra na fila uma vez por sessao`() {
        val slot = TaskToolsPromptSlot()
        assertTrue(slot.claim())
        assertFalse(slot.claim())
    }

    @Test fun `na vez dele mostra o convite normal`() {
        val slot = TaskToolsPromptSlot()
        slot.claim()
        assertEquals(TaskToolsShow.PROMPT, slot.onShow(offer = true))
    }

    @Test fun `na vez dele nao mostra se a flag ou a dispensa mudaram`() {
        val slot = TaskToolsPromptSlot()
        slot.claim()
        assertEquals(TaskToolsShow.SKIP, slot.onShow(offer = false))
    }

    @Test fun `hook instalado com o convite da flag na fila troca o texto e nao confirma`() {
        val slot = TaskToolsPromptSlot()
        slot.claim()
        assertEquals(HookFollowUp.PROMPT_ALREADY_QUEUED, slot.onHookInstalled(offer = true))
        assertEquals(TaskToolsShow.PROMPT_AFTER_HOOK, slot.onShow(offer = true))
    }

    @Test fun `hook instalado sem convite na fila enfileira a variante after-hook`() {
        val slot = TaskToolsPromptSlot()
        assertEquals(HookFollowUp.ENQUEUE_PROMPT, slot.onHookInstalled(offer = true))
        assertFalse(slot.claim(), "a startup activity nao enfileira de novo")
        assertEquals(TaskToolsShow.PROMPT_AFTER_HOOK, slot.onShow(offer = true))
    }

    @Test fun `hook instalado sem nada a oferecer mostra a confirmacao`() {
        val slot = TaskToolsPromptSlot()
        slot.claim()
        assertEquals(HookFollowUp.CONFIRM, slot.onHookInstalled(offer = false))
        assertEquals(TaskToolsShow.PROMPT, slot.onShow(offer = true))
    }

    @Test fun `hook instalado depois do convite da flag ja ter saido mostra a confirmacao`() {
        val slot = TaskToolsPromptSlot()
        slot.claim()
        slot.onShow(offer = true)
        assertEquals(HookFollowUp.CONFIRM, slot.onHookInstalled(offer = true))
    }

    @Test fun `convite after-hook que nao pode mais sair devolve a confirmacao do hook`() {
        val slot = TaskToolsPromptSlot()
        slot.claim()
        slot.onHookInstalled(offer = true)
        assertEquals(TaskToolsShow.CONFIRM_HOOK, slot.onShow(offer = false))
    }

    @Test fun `depois de sair o slot nao enfileira de novo`() {
        val slot = TaskToolsPromptSlot()
        slot.claim()
        slot.onShow(offer = false)
        assertFalse(slot.claim())
    }
}
