package com.carlosdealmeida.claudetodos

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class LocaleResolverTest {
    private fun tag(t: String) = Locale.forLanguageTag(t)

    @Test fun `chinese resolves by script then region`() {
        assertEquals("zh-cn", LocaleResolver.resolve(tag("zh")))
        assertEquals("zh-cn", LocaleResolver.resolve(tag("zh-CN")))
        assertEquals("zh-cn", LocaleResolver.resolve(tag("zh-SG")))
        assertEquals("zh-tw", LocaleResolver.resolve(tag("zh-TW")))
        assertEquals("zh-tw", LocaleResolver.resolve(tag("zh-HK")))
        assertEquals("zh-tw", LocaleResolver.resolve(tag("zh-MO")))
        assertEquals("zh-tw", LocaleResolver.resolve(tag("zh-Hant")))
        assertEquals("zh-cn", LocaleResolver.resolve(tag("zh-Hans")))
        assertEquals("zh-tw", LocaleResolver.resolve(tag("zh-Hant-CN")))
        assertEquals("zh-cn", LocaleResolver.resolve(tag("zh-Hans-TW")))
    }

    @Test fun `legacy java locale form still works`() {
        assertEquals("zh-tw", LocaleResolver.resolve(Locale("zh", "TW")))
        assertEquals("zh-cn", LocaleResolver.resolve(Locale("zh")))
    }

    @Test fun `existing locales are unchanged`() {
        assertEquals("pt-br", LocaleResolver.resolve(tag("pt")))
        assertEquals("pt-br", LocaleResolver.resolve(tag("pt-BR")))
        assertEquals("es", LocaleResolver.resolve(tag("es")))
        assertEquals("es", LocaleResolver.resolve(tag("es-MX")))
        assertEquals("en", LocaleResolver.resolve(tag("fr")))
        assertEquals("en", LocaleResolver.resolve(tag("en-US")))
    }

}
