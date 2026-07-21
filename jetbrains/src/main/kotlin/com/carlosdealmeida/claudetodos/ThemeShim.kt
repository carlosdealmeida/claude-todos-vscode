package com.carlosdealmeida.claudetodos

import java.awt.Color
import java.awt.Font
import javax.swing.UIManager

/**
 * Mapeia as 20 vars --vscode-* que a webview usa para cores do LaF corrente.
 * Todo valor tem fallback concreto: nenhuma var sai vazia, mesmo headless.
 */
object ThemeShim {
    val VAR_NAMES: List<String> = listOf(
        "foreground", "font-family", "font-size", "descriptionForeground",
        "errorForeground", "focusBorder", "panel-border", "list-hoverBackground",
        "badge-background", "badge-foreground", "sideBarSectionHeader-background",
        "textBlockQuote-background", "progressBar-background", "editor-font-family",
        "testing-iconPassed", "charts-blue", "charts-green", "charts-orange",
        "charts-red", "charts-yellow",
    )

    /** Nome (sem prefixo `--vscode-`) → valor, na mesma ordem de [VAR_NAMES]. Fonte de verdade única — [cssVariables] e o JS de live-update (WebviewPanel) derivam daqui. */
    fun variables(): Map<String, String> {
        val bg = UIManager.getColor("Panel.background")
        val dark = isDark(bg)
        val fg = color("Label.foreground", if (dark) Color(0xBBBBBB) else Color(0x1F1F1F))
        val muted = color("Label.disabledForeground", if (dark) Color(0x787878) else Color(0x6E6E6E))
        val border = color("Component.borderColor", if (dark) Color(0x3C3F41) else Color(0xD1D1D1))
        val hover = color("List.selectionBackgroundInactive", if (dark) Color(0x2E436E) else Color(0xD5E1F2))
        val accent = color("Component.focusColor", Color(0x3574F0))
        val panelBg = bg ?: if (dark) Color(0x2B2D30) else Color(0xF2F2F2)
        val error = color("Label.errorForeground", Color(0xE55765))
        val font = UIManager.getFont("Label.font") ?: Font("Dialog", Font.PLAIN, 13)
        val values = mapOf(
            "foreground" to hex(fg),
            "font-family" to "'${font.family}', sans-serif",
            "font-size" to "${font.size}px",
            "descriptionForeground" to hex(muted),
            "errorForeground" to hex(error),
            "focusBorder" to hex(accent),
            "panel-border" to hex(border),
            "list-hoverBackground" to hex(hover),
            "badge-background" to hex(accent),
            "badge-foreground" to "#ffffff",
            "sideBarSectionHeader-background" to hex(panelBg),
            "textBlockQuote-background" to hex(panelBg),
            "progressBar-background" to hex(accent),
            "editor-font-family" to "'JetBrains Mono', 'Consolas', monospace",
            "testing-iconPassed" to if (dark) "#57965c" else "#2e8b57",
            "charts-blue" to "#4b8bf5", "charts-green" to "#57965c",
            "charts-orange" to "#e08855", "charts-red" to "#e55765",
            "charts-yellow" to "#d6a243",
        )
        return VAR_NAMES.associateWith { values.getValue(it) }
    }

    fun cssVariables(): String {
        val body = variables().entries.joinToString("\n") { (name, value) -> "  --vscode-$name: $value;" }
        return ":root{\n$body\n}"
    }

    private fun isDark(bg: Color?): Boolean {
        if (bg == null) return true
        return (bg.red * 299 + bg.green * 587 + bg.blue * 114) / 1000 < 128
    }

    private fun color(key: String, fallback: Color): Color = UIManager.getColor(key) ?: fallback
    private fun hex(c: Color): String = "#%02x%02x%02x".format(c.red, c.green, c.blue)
}
