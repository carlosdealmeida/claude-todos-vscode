package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WebviewHtmlTest {
    @Test fun `inlines css, theme vars, bridge and app in order`() {
        val html = buildHtml(css = ".a{}", themeVars = ":root{--x:1}", bridgeScript = "BRIDGE()", appJs = "APP()")
        assertContains(html, ":root{--x:1}")
        assertContains(html, ".a{}")
        assertContains(html, "BRIDGE()")
        assertContains(html, "APP()")
        assertContains(html, "<div id=\"app\">")
        // bridge antes do app; tema antes do css da app (app pode sobrescrever)
        assertTrue(html.indexOf("BRIDGE()") < html.indexOf("APP()"))
        assertTrue(html.indexOf(":root{--x:1}") < html.indexOf(".a{}"))
    }

    @Test fun `escapes closing tags inside inlined content`() {
        val html = buildHtml(css = "a{content:'</style>'}", themeVars = "", bridgeScript = "", appJs = "x='</script>'")
        assertContains(html, "<\\/style>'")   // css inlinado não fecha a tag <style>
        assertContains(html, "<\\/script>'")  // js inlinado não fecha a tag <script>
    }

    @Test fun `jsSingleQuoted escapes quotes and backslashes`() {
        assertEquals("""'\'Segoe UI\', sans-serif'""", jsSingleQuoted("'Segoe UI', sans-serif"))
        assertEquals("""'a\\b'""", jsSingleQuoted("a\\b"))
    }
}
