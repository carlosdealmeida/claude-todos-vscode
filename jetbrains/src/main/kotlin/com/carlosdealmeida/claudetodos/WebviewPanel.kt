package com.carlosdealmeida.claudetodos

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import javax.swing.JComponent

/**
 * JBCefBrowser com a webview Svelte inline. JS→Kotlin via JBCefJSQuery
 * (window.__jcefPost); Kotlin→JS via executeJavaScript(window.postMessage) —
 * simétrico ao VS Code, a bridge da webview não distingue os hosts.
 */
class WebviewPanel(parentDisposable: Disposable) {
    private val browser = JBCefBrowser()
    private val query = JBCefJSQuery.create(browser as JBCefBrowserBase)
    val component: JComponent get() = browser.component

    init {
        Disposer.register(parentDisposable, browser)
        Disposer.register(parentDisposable, query)
    }

    fun load(onMessage: (String) -> Unit) {
        query.addHandler { msg -> onMessage(msg); null }
        val bridgeScript = """
            window.__jcefPost = function(json) { ${query.inject("json")} };
        """.trimIndent()
        val css = readResource("claudetodos/index.css")
        val appJs = readResource("claudetodos/main.js")
        browser.loadHTML(buildHtml(css, ThemeShim.cssVariables(), bridgeScript, appJs))
    }

    fun post(json: String) {
        // json é um objeto JSON válido — literal JS válido; sem re-encode.
        browser.cefBrowser.executeJavaScript(
            "window.postMessage($json, '*');", browser.cefBrowser.url, 0,
        )
    }

    fun updateThemeVars() {
        val vars = ThemeShim.cssVariables()
            .removePrefix(":root{").removeSuffix("}")
            .lines().filter { it.isNotBlank() }
            .joinToString("") {
                val (name, value) = it.trim().removeSuffix(";").split(":", limit = 2)
                "document.documentElement.style.setProperty('${name.trim()}', '${value.trim()}');"
            }
        browser.cefBrowser.executeJavaScript(vars, browser.cefBrowser.url, 0)
    }

    private fun readResource(path: String): String =
        javaClass.classLoader.getResourceAsStream(path)!!.bufferedReader().readText()
}
