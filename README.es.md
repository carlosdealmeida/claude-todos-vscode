# Claude Todos para VSCode

[Português](README.md) · [English](README.en.md) · **Español**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/CarlosJunior1992.claude-todos?label=VS%20Code%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/CarlosJunior1992.claude-todos?label=installs)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/CarlosJunior1992.claude-todos?label=rating)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos&ssr=false#review-details)
[![CI](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Vista en vivo de `TodoWrite` de Claude Code, acotada al workspace abierto en la ventana actual de VSCode. El panel muestra el agente principal y sus sub-agentes uno al lado del otro. Dos ventanas de VSCode en proyectos distintos nunca ven los todos de la otra.

## Instalación

1. Instala la extensión (archivo `.vsix` o desde el VSCode Marketplace una vez publicada).
2. En el primer arranque, acepta el aviso para instalar los hooks en `~/.claude/settings.json` — la extensión agrega dos: `SessionStart` y `UserPromptSubmit`. Los hooks existentes se conservan.
3. Abre una carpeta y ejecuta `claude` en cualquier terminal. La vista **Claude Todos** (Barra de Actividad) se llena en cuanto Claude llama a `TodoWrite`.

**Las sesiones que ya estaban en ejecución** cuando instalaste los hooks se detectan en el siguiente mensaje que les envíes (para eso sirve `UserPromptSubmit`). Las sesiones nuevas se rastrean de inmediato.

## Comandos

| Comando | Atajo predeterminado |
|---|---|
| Claude Todos: Open in Editor | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Claude Todos: Refresh | — |
| Claude Todos: Install Session Hook | — |

## Configuración

| Ajuste | Predeterminado | Efecto |
|---|---|---|
| `claudeTodos.claudeDir` | `""` (detección automática vía `os.homedir()`) | Sobrescribe la ubicación de `~/.claude`. |
| `claudeTodos.autoInstallHook` | `true` | Muestra el aviso de primer arranque pidiendo instalar los hooks. |

## Privacidad y flujo de datos

Esta extensión es **totalmente local**. No se envía nada a ningún servidor.

| Archivo | Cómo se accede | Por qué |
|---|---|---|
| `~/.claude/settings.json` | Lectura + escritura (una vez, con permiso) | Agrega dos comandos de hook en `hooks.SessionStart` y `hooks.UserPromptSubmit`. Los demás hooks y ajustes se conservan. |
| `~/.claude/.vscode-todos-bridge/sessions.json` | Escrito por el script de hook incluido | Registra `{cwd, sessionId, terminalPid, startedAt}` para que la extensión sepa qué sesión de Claude pertenece a qué ventana de VSCode. Limitado a 200 entradas. |
| `~/.claude/projects/{cwd-encoded}/{sessionId}.jsonl` | Solo lectura | Transcript de la sesión del propio Claude Code. La extensión lo recorre desde el final para encontrar el último evento `TodoWrite`. |
| `~/.claude/todos/` | No se toca | Ubicación heredada de Claude Code 1.x. Se ignora. |

La extensión nunca modifica tus transcripts y nunca borra nada.

## Requisitos

- VSCode 1.85 o más reciente
- Claude Code 2.x (cualquier versión que escriba transcripts en `~/.claude/projects/`)
- Node.js 20+ en el `PATH` (el script de hook es un pequeño programa Node)

## Compilar desde el código fuente

```bash
git clone <repo-url>
cd claude-todos-vscode
npm install
npm test         # vitest — 51 pruebas en 6 suites de servicio
npm run build    # esbuild para la extensión + hook, vite para el webview Svelte
npx vsce package # genera claude-todos-<versión>.vsix
```

Para ejecutar la extensión en un host de desarrollo: abre la carpeta en VSCode y pulsa F5 (usa `.vscode/launch.json`).

## Limitaciones conocidas

- Los workspaces multi-raíz solo usan la primera carpeta.
- El script de hook debe ser alcanzable desde la ruta guardada en `~/.claude/settings.json`. Si borras la extensión manualmente sin desinstalarla, esos comandos de hook quedan como no-ops — elimínalos a mano o reinstala y usa `Claude Todos: Install Session Hook` de nuevo.

## Contribuir

Consulta [CONTRIBUTING.es.md](CONTRIBUTING.es.md) para el checklist de smoke-test y el plan de pruebas manuales.

## Licencia

[MIT](LICENSE)
