// Modo de cor do painel, detectado do mesmo jeito nos tres hosts:
//  - VS Code: classe que ele poe no <body> (vscode-light/-dark/-high-contrast*)
//  - site: <html data-theme> (ThemeToggle + theme.css)
//  - JetBrains: nenhum dos dois; o ThemeShim injeta --vscode-foreground, e
//    texto claro implica fundo escuro.
import { effectiveTheme, type ColorMode, type UiThemeId } from '../../themes';

// Ponto em que o contraste com branco e com preto se iguala: acima dele, o
// texto so e legivel sobre fundo escuro. Nao usar 0,5: o #bbbbbb do Darcula
// tem luminancia 0,497.
const LIGHT_TEXT_LUMINANCE = 0.18;

export interface ModeInput {
  bodyClasses: readonly string[];
  dataTheme: string | null | undefined;
  foreground: string;
}

export function relativeLuminance(color: string): number | null {
  const c = color.trim();
  let rgb: number[] | null = null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
    if (m) rgb = [m[1], m[2], m[3]].map(Number);
  }
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function resolveMode(i: ModeInput): ColorMode {
  const c = i.bodyClasses;
  if (c.includes('vscode-high-contrast') || c.includes('vscode-high-contrast-light')) return 'hc';
  if (c.includes('vscode-light')) return 'light';
  if (c.includes('vscode-dark')) return 'dark';
  if (i.dataTheme === 'light' || i.dataTheme === 'dark') return i.dataTheme;
  const l = relativeLuminance(i.foreground);
  if (l === null) return 'dark';
  return l > LIGHT_TEXT_LUMINANCE ? 'dark' : 'light';
}

export function applyAppearance(
  el: { dataset: Record<string, string | undefined> },
  choice: UiThemeId,
  mode: ColorMode,
): void {
  el.dataset.ctTheme = effectiveTheme(choice, mode);
  el.dataset.ctMode = mode;
}

// Le o modo agora e a cada troca de tema do editor. Devolve o desligamento.
export function observeMode(doc: Document, onChange: (mode: ColorMode) => void): () => void {
  const read = (): ColorMode =>
    resolveMode({
      bodyClasses: [...doc.body.classList],
      dataTheme: doc.documentElement.dataset.theme,
      foreground: getComputedStyle(doc.documentElement).getPropertyValue('--vscode-foreground'),
    });
  let last = read();
  onChange(last);
  const obs = new MutationObserver(() => {
    const next = read();
    if (next !== last) { last = next; onChange(next); }
  });
  obs.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  // style: JetBrains troca as --vscode-* inline (updateThemeVars); data-theme: site.
  obs.observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  return () => obs.disconnect();
}
