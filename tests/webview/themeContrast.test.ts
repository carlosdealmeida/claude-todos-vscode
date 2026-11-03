import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { relativeLuminance } from '../../src/webview/themes/mode';

// Temas com paleta propria. Painel e Classico derivam do editor: o contraste
// e o do tema do usuario, fora do alcance deste teste.
const OWN_PALETTE = ['papel'];
const THEMES = path.join(__dirname, '..', '..', 'src', 'webview', 'themes');

function declarations(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/--(ct-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function tokens(css: string, id: string, mode: string): Record<string, string> {
  const re = new RegExp(`:root\\[data-ct-theme="${id}"\\]\\[data-ct-mode="${mode}"\\]\\s*\\{([^}]*)\\}`);
  const body = re.exec(css)?.[1];
  if (!body) throw new Error(`${id}/${mode}: bloco nao encontrado`);
  return declarations(body);
}

function ratio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  if (la === null || lb === null) throw new Error(`cor invalida: ${a} / ${b}`);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const FLOORS: [string, number][] = [
  ['ct-fg', 7], ['ct-muted', 4.5], ['ct-link', 4.5],
  ['ct-run', 3], ['ct-ok', 3], ['ct-done', 3], ['ct-warn', 3], ['ct-danger', 3], ['ct-accent', 3],
];

// Tokens que, no Classico, vem direto do editor. Um tema com paleta propria que
// esquecer um deles mostra a cor do editor no meio da paleta. Fontes ficam de
// fora de proposito: a do editor vale em todo tema.
const FONT_TOKENS = new Set(['ct-font', 'ct-font-size', 'ct-mono']);
const tokensCss = fs.readFileSync(path.join(THEMES, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const classic = declarations(/^:root\s*\{([^}]*)\}/m.exec(tokensCss)![1]);
const EDITOR_DERIVED = Object.entries(classic)
  .filter(([k, v]) => v.includes('--vscode-') && !FONT_TOKENS.has(k))
  .map(([k]) => k);

describe.each(OWN_PALETTE)('contraste do tema %s', (id) => {
  const css = fs.readFileSync(path.join(THEMES, `${id}.css`), 'utf8');
  describe.each(['dark', 'light'])('%s', (mode) => {
    const t = tokens(css, id, mode);
    it('cores de paleta propria sao hex de 6 digitos', () => {
      for (const [k, v] of Object.entries(t)) {
        if (k === 'ct-bg-image') continue;
        expect(v, k).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
    it('redefine todo token que no Classico vem do editor', () => {
      expect(EDITOR_DERIVED.length).toBeGreaterThan(10);
      expect(EDITOR_DERIVED.filter((k) => !(k in t))).toEqual([]);
    });
    const grounds = ['ct-bg', ...(t['ct-bg-alt'] ? ['ct-bg-alt'] : [])];
    for (const ground of grounds) {
      it.each(FLOORS)(`%s sobre ${ground} >= %d:1`, (fg, floor) => {
        expect(ratio(t[fg], t[ground])).toBeGreaterThanOrEqual(floor);
      });
    }
    it('botao: texto sobre o fundo do botao >= 4.5:1', () => {
      expect(ratio(t['ct-btn-fg'], t['ct-btn-bg'])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
