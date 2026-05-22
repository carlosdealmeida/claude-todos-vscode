# Contribuir

[Português](CONTRIBUTING.md) · [English](CONTRIBUTING.en.md) · **Español**

## Configuración

```bash
npm install
npm test
npm run build
```

Las pruebas usan [Vitest](https://vitest.dev/). La compilación usa esbuild (extensión + hook) y Vite (webview Svelte).

## Estructura del proyecto

```
src/
  extension.ts             # punto de entrada — conecta servicios, providers, comandos
  hooks/sessionStart.ts    # script de hook independiente, empaquetado aparte
  services/
    bridgeFile.ts          # lectura/escritura de ~/.claude/.vscode-todos-bridge/sessions.json
    todosParser.ts         # lee TodoWrite de ~/.claude/projects/*.jsonl
    sessionResolver.ts     # cwd del workspace -> sesiones candidatas del bridge
    snapshotService.ts     # compone resolver + parser, omite sesiones fantasma
    todosWatcher.ts        # fs.watch en los directorios bridge + projects
    hookInstaller.ts       # ediciones idempotentes en ~/.claude/settings.json
    projectDir.ts          # codifica el cwd al nombre de directorio de proyecto de Claude Code
  providers/
    todosViewProvider.ts   # WebviewView de la Barra de Actividad
    todosPanelProvider.ts  # WebviewPanel del editor
  webview/                 # webview Svelte 5 (compilado con Vite)
tests/services/            # pruebas unitarias, una por servicio
```

## Checklist de smoke test manual

Ejecuta `F5` desde VSCode (o instala el `.vsix` generado) y verifica:

- [ ] La Barra de Actividad muestra el icono de Claude Todos
- [ ] Al hacer clic se abre la vista
- [ ] El primer arranque pide instalar los hooks
- [ ] Tras aceptar, `~/.claude/settings.json` contiene las entradas `SessionStart` y `UserPromptSubmit` apuntando al `sessionStart.js` de esta extensión
- [ ] En una ventana nueva de host de extensión, ejecuta `claude` en una terminal — el archivo bridge recibe un nuevo registro
- [ ] Usa `TodoWrite` en la sesión de Claude Code — la vista se actualiza en ~500ms
- [ ] `Ctrl+Alt+T` abre el panel del editor; la vista y el panel se actualizan en sincronía
- [ ] Alternar el tema de VSCode entre oscuro↔claro → los colores cambian correctamente
- [ ] Cerrar la carpeta → la vista muestra el estado vacío
- [ ] Abrir otra carpeta sin sesión de Claude → "Waiting for a Claude Code session"
- [ ] Dos ventanas de VSCode, dos carpetas distintas, dos sesiones `claude` → cada una ve solo sus propios todos
- [ ] Una sesión fantasma en el bridge (registro cuyo transcript no existe) se omite, y se usa la siguiente válida

## Publicación

Consulta [RELEASING.md](RELEASING.md) para el proceso completo — etiqueta un release `v*`, el workflow genera el `.vsix`, y se sube al Marketplace manualmente.

## Estilo de código

- Por defecto, sin comentarios. Agrega uno solo cuando el *porqué* no sea obvio.
- Prefiere servicios compactos y sin dependencias. La razón de que el código no tenga helpers de framework de pruebas (factories, fixtures, etc.) es que cada servicio es lo bastante pequeño para probarse directamente.
- TDD al agregar un servicio: escribe la prueba que falla, luego la implementación, y luego el check verde.
