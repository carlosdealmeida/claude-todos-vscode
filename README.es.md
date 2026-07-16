# Claude Todos para VSCode

[Português](README.md) · [English](README.en.md) · **Español**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/CarlosJunior1992.claude-todos?label=VS%20Code%20Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos)
[![Open VSX](https://img.shields.io/open-vsx/v/CarlosJunior1992/claude-todos?label=Open%20VSX&color=c160ef)](https://open-vsx.org/extension/CarlosJunior1992/claude-todos)
[![CI](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Observability para tus agentes Claude Code** — tareas, árbol de agentes, tiempos, tokens y caché en vivo, acotado al workspace abierto en la ventana actual de VSCode. Todo 100% local: dos ventanas en proyectos distintos nunca ven los datos de la otra.

![Panel Claude Todos: agente principal y sub-agentes con las tareas avanzando de pending → in_progress → completed en vivo, con tiempos por tarea](screenshots/claude-todos-demo.gif)

## Qué obtienes

- **Árbol de agentes en vivo ("mission control")** — main → subagentes → agentes anidados, con badge de tipo (Explore, Plan, general-purpose…), estado y tokens por agente.
- **Tareas en tiempo real** — cada ítem transiciona `pending → in_progress → completed` conforme el agente trabaja; hacer clic en una tarea abre el transcript en la línea de su último cambio de estado. Si el orquestador deja de actualizar su lista mientras los subagentes siguen corriendo, el panel señala el desfase.
- **Tiempos por tarea** — duración de cada tarea completada, cronómetro en vivo de la tarea en curso y una estimación (etiquetada) del resto.
- **Tokens, contexto y caché** — tabla por modelo o por agente, indicador de la ventana de contexto con semáforo y eficiencia de caché (reutilizado × creado × nuevo).
- **Dashboard "Últimos 7 días"** — uso agregado del proyecto, por modelo y por tipo de agente.
- **Notificaciones** — un toast cuando la sesión queda inactiva esperándote, o cuando todas las tareas se completan (solo con la ventana sin foco).
- **UI en 3 idiomas** — en, pt-br y es; sigue el idioma de VS Code, con override por setting.

## Cómo funciona

![Panel Claude Todos actualizándose en vivo durante una sesión de Claude Code](screenshots/panel-live-during-smoke-test.png)

El panel **Claude Todos** (en la Barra de Actividad, a la izquierda) lee los transcripts que el propio Claude Code ya escribe en disco — sin proxy, sin API — y refleja todo en tiempo real conforme el agente trabaja.

No importa **dónde** se esté ejecutando `claude`: puede ser el terminal integrado de VSCode, cualquier terminal externo (Windows Terminal, iTerm, gnome-terminal) o la CLI de Claude Code en otra ventana. Mientras el directorio de trabajo de la sesión coincida con el workspace abierto en VSCode, el panel lo refleja.

## Instalación

| Editor | Dónde |
|---|---|
| VS Code | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos) |
| Cursor · Windsurf · VSCodium | [Open VSX](https://open-vsx.org/extension/CarlosJunior1992/claude-todos) |
| Cualquiera | `.vsix` de un [GitHub Release](https://github.com/carlosdealmeida/claude-todos-vscode/releases) |

1. Instala la extensión (tabla de arriba). La guía **"Empieza con Claude Todos"** aparece en la página *Welcome/Get Started* del editor y acompaña los pasos de abajo.
2. En el primer arranque, acepta el aviso para instalar los hooks en `~/.claude/settings.json` — la extensión agrega dos: `SessionStart` y `UserPromptSubmit`. Los hooks existentes se conservan.
3. Abre una carpeta y ejecuta `claude` en cualquier terminal. La vista **Claude Todos** (Barra de Actividad) se llena en cuanto la sesión tiene actividad.

**Las sesiones que ya estaban en ejecución** cuando instalaste los hooks se detectan en el siguiente mensaje que les envíes (para eso sirve `UserPromptSubmit`). Las sesiones nuevas se rastrean de inmediato.

## Comandos

| Comando | Atajo predeterminado |
|---|---|
| Claude Todos: Open in Editor | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Claude Todos: Choose Session | `Ctrl+Alt+S` / `Cmd+Alt+S` |
| Claude Todos: Refresh | — |
| Claude Todos: Install Session Hook | — |

## Configuración

| Ajuste | Predeterminado | Efecto |
|---|---|---|
| `claudeTodos.claudeDir` | `""` (detección automática vía `os.homedir()`) | Sobrescribe la ubicación de `~/.claude`. |
| `claudeTodos.autoInstallHook` | `true` | Muestra el aviso de primer arranque pidiendo instalar los hooks. |
| `claudeTodos.language` | `auto` | Idioma de la UI del panel (`auto` \| `en` \| `pt-br` \| `es`). |
| `claudeTodos.notifications` | `true` | Toast cuando la sesión queda inactiva o completa todas las tareas (ventana sin foco). |
| `claudeTodos.activeFolder` | `""` | Multi-root: carpeta del workspace a seguir; vacío = seguir la sesión más activa. |

## Privacidad y flujo de datos

Esta extensión es **totalmente local**. No se envía nada a ningún servidor.

| Archivo | Cómo se accede | Por qué |
|---|---|---|
| `~/.claude/settings.json` | Lectura + escritura (una vez, con permiso) | Agrega dos comandos de hook en `hooks.SessionStart` y `hooks.UserPromptSubmit`. Los demás hooks y ajustes se conservan. |
| `~/.claude/.vscode-todos-bridge/sessions.json` | Escrito por el script de hook incluido | Registra `{cwd, sessionId, terminalPid, startedAt}` para que la extensión sepa qué sesión de Claude pertenece a qué ventana de VSCode. Limitado a 200 entradas. |
| `~/.claude/projects/{cwd-encoded}/…` | Solo lectura | Transcripts de la sesión y de los subagentes (`.jsonl` + `.meta.json`) escritos por el propio Claude Code — la fuente de tareas, árbol, tiempos y tokens. |
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
npm test         # vitest
npm run build    # esbuild para la extensión + hook, vite para el webview Svelte
npx vsce package # genera claude-todos-<versión>.vsix
```

Para ejecutar la extensión en un host de desarrollo: abre la carpeta en VSCode y pulsa F5 (usa `.vscode/launch.json`).

## Limitaciones conocidas

- El script de hook debe ser alcanzable desde la ruta guardada en `~/.claude/settings.json`. Si borras la extensión manualmente sin desinstalarla, esos comandos de hook quedan como no-ops — elimínalos a mano o reinstala y usa `Claude Todos: Install Session Hook` de nuevo.

## Contribuir

Consulta [CONTRIBUTING.es.md](CONTRIBUTING.es.md) para el checklist de smoke-test y el plan de pruebas manuales.

## Licencia

[MIT](LICENSE)
