package com.carlosdealmeida.claudetodos

import java.util.Locale

// Espelha src/i18n/locale.ts -- manter em sincronia manual, como o catalogo.
object LocaleResolver {
    private val TRADITIONAL_COUNTRIES = setOf("TW", "HK", "MO")

    fun resolve(loc: Locale): String = when (loc.language) {
        "pt" -> "pt-br"
        "es" -> "es"
        "zh" -> when {
            // O subtag de script, quando presente, manda mais que a regiao.
            loc.script == "Hant" -> "zh-tw"
            loc.script == "Hans" -> "zh-cn"
            loc.country in TRADITIONAL_COUNTRIES -> "zh-tw"
            else -> "zh-cn"
        }
        else -> "en"
    }
}
