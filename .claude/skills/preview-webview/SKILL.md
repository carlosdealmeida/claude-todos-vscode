---
name: preview-webview
description: Use when you need to visually see a real Svelte webview component of the Claude Todos panel (a screenshot), not just run tests or the build — e.g. confirming a UI change under src/webview/ actually looks right.
---

# Preview the webview visually

The panel is a Svelte webview. Tests and `npm run build` prove it compiles, not
that it looks right. This renders the **real compiled component** in a browser and
captures a PNG.

**Core trick:** mount the target component directly with mock props. Do NOT mount
`App.svelte` or import `stores.svelte.ts` — the store calls `acquireVsCodeApi()` at
module load, which only exists inside VSCode and crashes a plain browser.

## Steps

1. **Write `src/webview/preview.ts`** mounting the component with mock props. Adapt
   this (here previewing `UsageTable` in several states):

   ```ts
   import { mount } from 'svelte';
   import UsageTable from './lib/UsageTable.svelte';
   import type { SessionUsage } from '../types';

   const cases: { title: string; usage: SessionUsage }[] = [
     { title: '34% ok', usage: { byModel: [{ model: 'claude-opus-4-8', input: 12000, output: 3400, cache: 98000 }], byAgent: [], context: { tokens: 68000, limit: 200000 } } },
     { title: 'no context', usage: { byModel: [{ model: 'claude-opus-4-8', input: 12000, output: 3400, cache: 98000 }], byAgent: [] } },
   ];

   const root = document.getElementById('app')!;
   for (const c of cases) {
     const section = document.createElement('div');
     section.style.cssText = 'max-width:320px;margin:0 auto 22px';
     const h = document.createElement('div');
     h.textContent = c.title;
     h.style.cssText = 'font:600 12px sans-serif;color:#9d9d9d;margin:0 0 6px';
     const host = document.createElement('div');
     section.append(h, host);
     root.append(section);
     mount(UsageTable, { target: host, props: { usage: c.usage } });
   }
   ```

2. **Copy the template** `preview.html` from this skill folder to `src/webview/preview.html`
   (it defines the VSCode theme CSS variables the components need, and loads `./preview.ts`).

3. **Start the Vite dev server** with the Bash tool and `run_in_background: true`
   (serving over HTTP is required — `file://` breaks ESM module loading via CORS):

   ```
   npx vite --port 5174 --strictPort
   ```

   Poll `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/preview.html`
   until it returns `200`.

4. **Screenshot** with the helper (locates Chrome/Edge, applies the right flags):

   ```
   bash .claude/skills/preview-webview/shoot.sh http://localhost:5174/preview.html c:/tmp/webview-preview.png 400,1080
   ```

5. **Look at it** — Read `c:/tmp/webview-preview.png`. A blank image = the component
   didn't mount; check the Vite log for an `acquireVsCodeApi`/import error.

6. **Clean up:** TaskStop the Vite background task. On Windows TaskStop may leave the
   node child alive holding the port, so also free it explicitly (PowerShell):

   ```
   Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue |
     Select-Object -ExpandProperty OwningProcess -Unique |
     ForEach-Object { Stop-Process -Id $_ -Force }
   ```

   Then delete `src/webview/preview.ts` and `src/webview/preview.html`, and the PNG in
   `c:/tmp`. Confirm `git status` is clean.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Blank page / instant crash | Imported `App.svelte` or the store → `acquireVsCodeApi` undefined. Mount the leaf component directly. |
| No colors, plain text | Missing theme vars. Use the provided `preview.html` (defines `--vscode-*`). |
| CORS / module load error | Don't open `file://`. Serve via the Vite dev server over `http://localhost`. |
| Screenshot too narrow, content cut off | Pass a wider window size as the 3rd arg, e.g. `480,1080`. |
| Component renders a `<li>` (e.g. `TodoItem`) | Mount into a `<ul>` host, not a `<div>`, or the layout is off. |
| Some props look empty/wrong | Populate every field the component reads — check `src/types.ts`. E.g. an `in_progress` todo renders `activeForm`, not `content`. |
| Vite task "failed"/exit 1, "Port 5174 already in use" | A Vite orphan from a previous run still holds the port (TaskStop didn't kill the node child). It serves the current files fine (curl `200`), so the screenshot works — just free the port in cleanup (step 6). |
| PNG in the repo / leftover files | Write screenshots to `c:/tmp`, not the project. Delete the preview files when done. |

## Notes

- Output goes to `c:/tmp`, never into the repo. The two preview files are scratch — never commit them.
- `shoot.sh` assumes the dev server is already up; it only drives the browser, so the
  Vite process stays under your control (background task + TaskStop) and never leaks.
