package com.carlosdealmeida.claudetodos

import kotlinx.serialization.json.*
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class ThemeChoiceTest {
    @Test fun `valor ausente ou desconhecido vira classic`() {
        assertEquals("classic", ThemeChoice.parse(null))
        assertEquals("classic", ThemeChoice.parse(""))
        assertEquals("classic", ThemeChoice.parse("inexistente"))
    }

    @Test fun `todo id registrado e aceito`() {
        ThemeChoice.IDS.forEach { assertEquals(it, ThemeChoice.parse(it)) }
    }

    // Copia manual da lista do package.json, como o LocaleResolver; este teste trava a sincronia.
    // O gradle roda com working dir = jetbrains/.
    @Test fun `lista igual ao enum da setting no package json`() {
        val pkg = Json.parseToJsonElement(File("../package.json").readText()).jsonObject
        val enum = pkg["contributes"]!!.jsonObject["configuration"]!!.jsonObject["properties"]!!
            .jsonObject["claudeTodos.theme"]!!.jsonObject["enum"]!!.jsonArray.map { it.jsonPrimitive.content }
        assertEquals(enum, ThemeChoice.IDS)
    }
}
