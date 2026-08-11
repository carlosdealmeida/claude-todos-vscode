import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Regressao do achado C1 da revisao final da branch: o site monta
// src/webview/App.svelte diretamente (nao usa main.ts nem index.html, os
// entrypoints da extensao), entao nada garantia que src/webview/app.css —
// dono de 9 tokens (--sp-1, --sp-2, --sp-3, --radius, --accent, --ok, --run,
// --muted, --card-accent) e do bloco prefers-reduced-motion — fosse
// carregado pelo site. O defeito passou por typecheck, svelte-check, build e
// inspecao visual "monta com cores" (as vars --vscode-* funcionam sozinhas,
// o que mascara a ausencia das outras 9). Este teste falha se algum nome
// usado em src/webview/ deixar de resolver pela combinacao de fontes que o
// site carrega.
//
// Criterio adotado para "definido":
// - src/webview/app.css OU site/src/demo/theme.css (as duas folhas que o
//   site carrega hoje, ver LandingLayout.astro), OU
// - uma declaracao local dentro do proprio src/webview/ (ex.: AgentSection
//   define `--tone` em `.tone-explore { --tone: var(--vscode-charts-green); }`
//   e consome em `.type-badge { color: var(--tone); }`, no mesmo arquivo).
//   Uma var assim resolve sozinha, sem depender de nenhuma folha externa —
//   nao e o bug que C1 descreve, entao contá-la como pendencia produziria
//   falso positivo permanente.
// Uma var com fallback (`var(--x, default)`) ainda conta como usada: o
// fallback mascara a ausencia em vez de resolve-la (e exatamente por isso
// que os --vscode-* de app.css, que TEM fallback, escondiam o problema dos
// que não tem). So o *nome* de cada var(--nome ...) importa aqui; o
// fallback eventual e ignorado na extracao.

const ROOT = path.join(__dirname, '..', '..');
const WEBVIEW_DIR = path.join(ROOT, 'src', 'webview');
const APP_CSS = path.join(WEBVIEW_DIR, 'app.css');
const THEME_CSS = path.join(ROOT, 'site', 'src', 'demo', 'theme.css');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// Extrai so o nome de cada var(--nome ...): o resto (fallback, espacos) e
// irrelevante para "esta var precisa existir em algum lugar".
function extractUsages(content: string): string[] {
  return [...content.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((m) => m[1]);
}

// Extrai declaracoes `--nome: valor;` (definicoes de custom property), nunca
// confundindo com um uso `var(--nome)` — este ultimo nunca tem `:` logo apos
// o nome.
function extractDefinitions(content: string): string[] {
  return [...content.matchAll(/(?:^|[{;\s])(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]);
}

describe('custom properties usadas em src/webview/ resolvem em algum lugar que o site carrega', () => {
  const webviewFiles = walk(WEBVIEW_DIR, ['.svelte', '.css']);
  expect(webviewFiles.length).toBeGreaterThan(0);

  const usages = new Set(webviewFiles.flatMap((f) => extractUsages(fs.readFileSync(f, 'utf8'))));
  // Confere que a varredura realmente encontrou algo — se a lista vier vazia
  // o teste passaria vazio e daria falsa seguranca.
  expect(usages.size).toBeGreaterThan(20);

  const definedInTheme = new Set(extractDefinitions(fs.readFileSync(THEME_CSS, 'utf8')));
  const definedInAppCss = new Set(extractDefinitions(fs.readFileSync(APP_CSS, 'utf8')));
  const definedLocally = new Set(webviewFiles.flatMap((f) => extractDefinitions(fs.readFileSync(f, 'utf8'))));

  const availableToSite = new Set([...definedInTheme, ...definedInAppCss, ...definedLocally]);

  it.each([...usages].sort())('var(%s) esta definida em app.css, theme.css ou localmente em src/webview/', (name) => {
    expect(availableToSite.has(name)).toBe(true);
  });

  // Trava a armadilha de ordem descrita em LandingLayout.astro: app.css
  // precisa aparecer ANTES de theme.css no layout, senao body{padding:0} de
  // app.css:20 vence body{padding:24px} de theme.css (mesma especificidade,
  // "ultimo declarado" ganha) e o site perde o padding de pagina.
  it('LandingLayout.astro importa app.css antes de theme.css', () => {
    const layout = fs.readFileSync(
      path.join(ROOT, 'site', 'src', 'layouts', 'LandingLayout.astro'),
      'utf8'
    );
    const appCssIdx = layout.indexOf("webview/app.css'");
    const themeCssIdx = layout.indexOf("demo/theme.css'");
    expect(appCssIdx).toBeGreaterThan(-1);
    expect(themeCssIdx).toBeGreaterThan(-1);
    expect(appCssIdx).toBeLessThan(themeCssIdx);
  });
});
