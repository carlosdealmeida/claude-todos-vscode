package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ThemeShimTest {
    @Test fun `emits all 20 vars with concrete values`() {
        val css = ThemeShim.cssVariables()
        assertEquals(20, ThemeShim.VAR_NAMES.size)
        for (name in ThemeShim.VAR_NAMES) {
            assertTrue(css.contains("--vscode-$name:"), "faltou --vscode-$name")
        }
        // nenhuma var vazia: todo valor tem conteúdo até o ';'
        assertTrue(!Regex(":\\s*;").containsMatchIn(css))
    }

    @Test fun `colors are hex formatted`() {
        val css = ThemeShim.cssVariables()
        assertTrue(Regex("--vscode-foreground:\\s*#[0-9a-fA-F]{6}").containsMatchIn(css))
    }
}
