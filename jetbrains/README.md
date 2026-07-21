# Claude Todos — plugin JetBrains

Porta JetBrains da extensão (specs em `../docs/specs/2026-07-17-jetbrains-port-overview.md`).

## Dev

1. Na raiz do repo: `npm run build` (gera webview + sidecar em `../dist`)
2. Aqui: `./gradlew runIde` (baixa o IDE alvo na primeira vez)

Testes: `./gradlew test` · Empacotar: `./gradlew buildPlugin`
