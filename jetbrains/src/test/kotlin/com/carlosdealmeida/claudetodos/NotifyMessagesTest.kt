package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NotifyMessagesTest {
    @Test fun `every locale declares exactly the KEYS set`() {
        val expected = NotifyMessages.KEYS.toSet()
        for (locale in NotifyMessages.LOCALES)
            assertEquals(expected, NotifyMessages.rawKeys(locale), "chaves divergentes em $locale")
    }

    @Test fun `all keys are non-empty in every locale`() {
        for (locale in NotifyMessages.LOCALES)
            for (key in NotifyMessages.KEYS)
                assertTrue(NotifyMessages.get(locale, key).isNotBlank(), "vazio: $locale/$key")
    }

    @Test fun `interpolates named args`() {
        assertTrue(NotifyMessages.get("pt-br", "notify.idle", "title" to "X").contains("\"X\""))
        assertTrue(NotifyMessages.get("en", "hook.installFailed", "error" to "E1").contains("E1"))
    }

    @Test fun `unknown locale falls back to en`() {
        assertEquals(NotifyMessages.get("en", "notify.openPanel"), NotifyMessages.get("fr", "notify.openPanel"))
    }

    @Test fun `toastMessage priority allComplete over awaitingInput over idle`() {
        assertNull(NotifyMessages.toastMessage("en", emptyList(), null, "T"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("allComplete", "awaitingInput"), "plan", "T")!!
            .contains("completed"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("awaitingInput"), "plan", "T")!!
            .contains("plan"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("awaitingInput"), "question", "T")!!
            .contains("answer"))
        assertTrue(NotifyMessages.toastMessage("en", listOf("idle"), null, "T")!!
            .contains("waiting for you"))
    }
}
