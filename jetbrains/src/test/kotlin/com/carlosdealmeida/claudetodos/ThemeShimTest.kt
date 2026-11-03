package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ThemeShimTest {
    @Test fun `emits all 23 vars with concrete values`() {
        val css = ThemeShim.cssVariables()
        assertEquals(23, ThemeShim.VAR_NAMES.size)
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

    @Test fun `variables map has the 23 names with non-empty values`() {
        val vars = ThemeShim.variables()
        assertEquals(ThemeShim.VAR_NAMES, vars.keys.toList())
        assertTrue(vars.values.all { it.isNotBlank() })
    }

    @Test fun `recognizes high contrast themes by name`() {
        assertTrue(ThemeShim.isHighContrast("High contrast"))
        assertTrue(ThemeShim.isHighContrast("High Contrast"))
        assertFalse(ThemeShim.isHighContrast("Darcula"))
        assertFalse(ThemeShim.isHighContrast("IntelliJ Light"))
        assertFalse(ThemeShim.isHighContrast(null))
    }

    // A webview so sabe do alto contraste por esta classe, a mesma do VS Code.
    @Test fun `toggles the high contrast class on the body`() {
        assertEquals("document.body.classList.toggle('vscode-high-contrast', true);", ThemeShim.highContrastToggleJs(true))
        assertEquals("document.body.classList.toggle('vscode-high-contrast', false);", ThemeShim.highContrastToggleJs(false))
    }
}
