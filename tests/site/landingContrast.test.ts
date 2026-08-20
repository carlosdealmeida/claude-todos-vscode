import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Trava a paleta da landing (site/src/styles/landing.css) nos pisos de
// contraste WCAG 2.x, ANTES de os valores finais existirem — este teste e
// quem valida a paleta, nao o contrario. Se um par nao passar, o valor no
// CSS e que muda; o piso abaixo nunca muda para acomodar uma cor.
//
// Licao de uma task anterior deste projeto: cores herdadas de um mockup
// ficaram em 2,48:1 sem que ninguem notasse ate a medicao programatica —
// julgamento visual sozinho nao pega isso.

const LANDING_CSS = path.join(__dirname, '..', '..', 'site', 'src', 'styles', 'landing.css');

// --- Leitura de tokens -------------------------------------------------
// landing.css declara os tokens uma unica vez, sob um seletor de escopo da
// pagina (nunca :root) — ver o proprio arquivo. Para o teste bastam
// declaracoes `--nome: valor;` literais (sem var() aninhado), entao um
// parser regex simples e suficiente e evita importar qualquer coisa do
// pipeline de build do Astro.
function readToken(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token ${name} nao encontrado em landing.css`);
  return match[1].trim();
}

// --- Cor: parse + luminancia relativa (WCAG 2.x, sRGB linearizado) -----
interface RGB { r: number; g: number; b: number; a: number }

function parseColor(value: string): RGB {
  const hex6 = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex6) {
    const n = hex6[1];
    return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16), a: 1 };
  }
  const hex3 = value.match(/^#([0-9a-fA-F]{3})$/);
  if (hex3) {
    const n = hex3[1];
    return {
      r: parseInt(n[0] + n[0], 16),
      g: parseInt(n[1] + n[1], 16),
      b: parseInt(n[2] + n[2], 16),
      a: 1,
    };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  throw new Error(`nao sei interpretar a cor "${value}" (esperado hex ou rgb[a]())`);
}

// Compoe `fg` (com seu proprio alpha) sobre um `bg` opaco — necessario para
// medir o contraste real de um token com transparencia (--brand-line), que
// e o que o navegador de fato renderiza.
function compositeOver(fg: RGB, bg: RGB): RGB {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

// Linearizacao sRGB -> luminancia relativa, formula da WCAG 2.x
// (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
function channelToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// Razao de contraste entre dois tokens do CSS, resolvendo transparencia
// (se houver) compondo sobre `overBgName` antes de medir.
function ratioOf(css: string, fgName: string, bgName: string): number {
  const bg = parseColor(readToken(css, bgName));
  const fgRaw = parseColor(readToken(css, fgName));
  const fg = fgRaw.a < 1 ? compositeOver(fgRaw, bg) : fgRaw;
  return contrastRatio(fg, bg);
}

describe('paleta da landing passa nos pisos de contraste WCAG', () => {
  const css = fs.existsSync(LANDING_CSS) ? fs.readFileSync(LANDING_CSS, 'utf8') : null;

  it('site/src/styles/landing.css existe', () => {
    expect(css).not.toBeNull();
  });

  // Os testes abaixo so fazem sentido com o arquivo carregado; se ele nao
  // existir (Step 2: ainda nao criado), o teste acima ja falha e explica o
  // motivo, sem mascarar em "token nao encontrado".
  const content = css ?? '';

  it('--brand-bone sobre --brand-bg >= 4.5:1 (texto de corpo)', () => {
    expect(ratioOf(content, '--brand-bone', '--brand-bg')).toBeGreaterThanOrEqual(4.5);
  });

  it('--brand-dim sobre --brand-bg >= 4.5:1 (texto secundario)', () => {
    expect(ratioOf(content, '--brand-dim', '--brand-bg')).toBeGreaterThanOrEqual(4.5);
  });

  it('--brand-coral sobre --brand-bg >= 4.5:1 (eyebrow, links)', () => {
    expect(ratioOf(content, '--brand-coral', '--brand-bg')).toBeGreaterThanOrEqual(4.5);
  });

  it('texto do botao (--brand-on-coral) sobre --brand-coral de fundo >= 4.5:1', () => {
    expect(ratioOf(content, '--brand-on-coral', '--brand-coral')).toBeGreaterThanOrEqual(4.5);
  });

  it('--brand-line sobre --brand-bg >= 3:1 (contraste nao-textual, WCAG 1.4.11)', () => {
    expect(ratioOf(content, '--brand-line', '--brand-bg')).toBeGreaterThanOrEqual(3);
  });
});
