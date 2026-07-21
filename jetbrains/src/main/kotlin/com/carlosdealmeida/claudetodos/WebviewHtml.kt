package com.carlosdealmeida.claudetodos

// Gera o HTML único carregado via loadHTML: tema (:root vars) → css da app →
// script da bridge (__jcefPost) → app. Conteúdo inline tem os closers escapados
// para não fechar as tags prematuramente.
// Match é case-sensitive por design: os bundles gerados (esbuild/vite) sempre emitem
// "</style"/"</script" em minúsculas, então não há necessidade de comparar sem case.
fun buildHtml(css: String, themeVars: String, bridgeScript: String, appJs: String): String {
    val safeCss = css.replace("</style", "<\\/style")
    val safeTheme = themeVars.replace("</style", "<\\/style")
    val safeBridge = bridgeScript.replace("</script", "<\\/script")
    val safeApp = appJs.replace("</script", "<\\/script")
    return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <style>$safeTheme</style>
          <style>$safeCss</style>
          <title>Claude Todos</title>
        </head>
        <body>
          <div id="app"></div>
          <script>$safeBridge</script>
          <script type="module">$safeApp</script>
        </body>
        </html>
    """.trimIndent()
}

// Escapa um valor para dentro de um literal JS entre aspas simples.
internal fun jsSingleQuoted(s: String): String =
    "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"
