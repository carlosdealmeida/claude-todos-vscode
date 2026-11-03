import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WEBVIEW = path.join(__dirname, '..', '..', 'src', 'webview');
const THEMES = path.join(WEBVIEW, 'themes');
// Unicos arquivos onde --vscode-* pode aparecer.
const VSCODE_ALLOWED = new Set(['tokens.css', 'painel.css']);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('componentes so usam tokens --ct-*', () => {
  const files = walk(WEBVIEW).filter((f) => /\.(svelte|css)$/.test(f));
  it.each(files.map((f) => [path.relative(WEBVIEW, f)]))('%s', (rel) => {
    const name = path.basename(rel);
    if (rel.startsWith('themes') && VSCODE_ALLOWED.has(name)) return;
    const content = fs.readFileSync(path.join(WEBVIEW, rel), 'utf8');
    expect(content.match(/var\(\s*--vscode-[\w-]+/g) ?? []).toEqual([]);
    // Os tokens antigos sairam: nenhum uso pode ter sobrado.
    expect(content.match(/var\(\s*--(accent|ok|run|muted|card-accent)\b/g) ?? []).toEqual([]);
  });
});

describe('tema Painel', () => {
  // O ThemeShim nao define textLink, e focusBorder vem do foco do IDE: no Darcula
  // e no IntelliJ Light da 1,64:1 sobre o fundo, ilegivel para a task em andamento.
  it('token que pinta texto nao cai em focusBorder', () => {
    const css = fs.readFileSync(path.join(THEMES, 'painel.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const textTokens = [...css.matchAll(/--(ct-(?:run|link|tone-[\w-]+))\s*:\s*([^;]+);/g)];
    expect(textTokens.length).toBeGreaterThanOrEqual(5);
    for (const [, name, value] of textTokens) expect(value, name).not.toContain('focusBorder');
  });
});

describe('arquivos de tema', () => {
  it('so declaram custom properties nos seletores permitidos', () => {
    const themeFiles = fs.readdirSync(THEMES).filter((f) => f.endsWith('.css') && !['tokens.css', 'index.css'].includes(f));
    for (const file of themeFiles) {
      const css = fs.readFileSync(path.join(THEMES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const id = file.replace(/\.css$/, '');
      for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selector = m[1].trim();
        expect(selector, file).toMatch(new RegExp(`^:root\\[data-ct-theme="${id}"\\](\\[data-ct-mode="(dark|light)"\\])?$`));
        for (const decl of m[2].split(';').map((d) => d.trim()).filter(Boolean)) {
          expect(decl, file).toMatch(/^--(ct-[\w-]+|sp-[123]|radius)\s*:/);
        }
      }
    }
  });
});
