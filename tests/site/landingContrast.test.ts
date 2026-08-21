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
//
// Fix round 1 (revisao da Task 1) acrescentou uma segunda licao: comparar
// so os VALORES dos tokens (--brand-on-coral vs --brand-coral) nao prova
// nada sobre o que a pagina realmente pinta — um bug de especificidade
// (`.landing a { color: inherit }` vencendo `.cta { color: ... }`) fazia o
// CTA renderizar um par diferente do que os tokens prometiam, e o teste de
// entao (so token-a-token) nao via isso. A describe "cascata real" abaixo
// resolve qual DECLARACAO vence (especificidade + ordem de origem, como um
// navegador faria) para os elementos onde existe mais de uma regra
// competindo pela mesma propriedade, em vez de comparar tokens soltos.
//
// O QUE ESTE RESOLVEDOR NAO COBRE (leia antes de confiar nele para provar
// que a pagina renderiza um contraste correto — ele e UMA das protecoes,
// nao a garantia). A prova de que a lista abaixo importa e a Critical do
// review final da branch feat/site-visual-identity: uma falha real de
// 1.53:1 causada pela interacao entre theme.css e landing.css, num par que
// este arquivo nunca tentou medir porque nao esta na lista fixa abaixo — o
// resolvedor passou 8/8 o tempo todo.
//
//   1. `!important`. `resolveProperty()` so compara especificidade + ordem
//      de origem; uma regra perdedora com `!important` venceria no
//      navegador e perderia aqui. Nenhuma regra de landing.css usa
//      `!important` hoje.
//   2. Uma folha so. `parseRules`/`cascadeRatio` leem exclusivamente
//      site/src/styles/landing.css. LandingLayout.astro carrega mais tres
//      (app.css, theme.css) e o Astro ainda concatena os `<style>`
//      escopados de StoreRow.astro/LangSwitcher.svelte/ThemeToggle.svelte/
//      FeatureList.svelte/Demo.svelte — nenhuma declaracao nessas folhas
//      entra nesta simulacao.
//   3. So os elementos na lista fixa abaixo (hoje: a.cta e a.cta-secondary,
//      via HERO_CTA_ANCESTORS). Qualquer outro elemento da pagina — a
//      topbar inteira, o painel embutido, os cartoes de loja — nao e
//      medido por este arquivo nunca, so pelos testes de par-de-token
//      acima (que provam a paleta, nao o que a pagina pinta).
//   4. `@media`. `stripAtBlocks` descarta o bloco `@media` inteiro antes de
//      `parseRules` rodar — uma declaracao de cor dentro de uma media query
//      fica invisivel para este resolvedor.
//   5. `:not()`/`:is()`. `specificity()` conta os dois como uma
//      pseudo-classe generica (b += 1); pela spec, ambos deveriam assumir a
//      especificidade do argumento mais especifico da lista dentro dos
//      parenteses.
//   6. `inherit` so resolve contra `.landing`. `resolveValue()` ancora
//      TODO `inherit` incondicionalmente em `.landing` — correto por
//      coincidencia de estrutura para os dois alvos testados hoje (o
//      ancestral mais proximo que declara `color` no caminho deles ate a
//      raiz e mesmo `.landing`), errado em geral: um `<a>` dentro de
//      `footer` (que declara seu proprio `color: var(--brand-dim)`)
//      herdaria de `footer`, nao de `.landing`, e este resolvedor mediria
//      o par errado sem avisar.
//
// (Combinadores `>`/`+`/`~` tambem nao sao tratados — `selector.split(/\s+/)`
// trata qualquer um deles como parte de um compound — mas nenhuma regra de
// landing.css usa combinador algum hoje, entao fica fora da lista acima por
// nao ser um blind spot ainda exercitado por este arquivo.)

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
// medir o contraste real de um token com transparencia (--brand-line*), que
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

// =========================================================================
// Resolvedor de cascata: dado um elemento alvo (tag + classes), decide qual
// declaracao de uma propriedade REALMENTE vence entre todas as regras do
// CSS que o atingem — especificidade primeiro, ordem de origem como
// desempate — em vez de assumir que a regra "obvia" (ex.: `.cta`) e quem
// manda. E o que faltava no teste original: ele comparava valores de token
// sem nunca perguntar "qual regra o navegador aplicaria de fato aqui".
// =========================================================================

interface CssRule {
  selectors: string[];
  decls: Record<string, string>;
  order: number;
}

// Remove comentarios /* ... */ antes de qualquer outro parsing.
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Remove um bloco @regra{...} inteiro (com chaves balanceadas), preservando
// o resto do texto. Usado para tirar @media do fluxo de regras simples que
// parseRules espera — nenhuma declaracao de cor deste arquivo vive dentro
// de um @media, entao descartar o bloco inteiro (em vez de achatar seu
// conteudo) e seguro para o proposito deste resolvedor.
function stripAtBlocks(css: string, atKeyword: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const idx = css.indexOf(atKeyword, i);
    if (idx === -1) {
      out += css.slice(i);
      return out;
    }
    out += css.slice(i, idx);
    const braceStart = css.indexOf('{', idx);
    if (braceStart === -1) return out;
    let depth = 1;
    let j = braceStart + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    i = j;
  }
}

function parseRules(rawCss: string): CssRule[] {
  let css = stripComments(rawCss);
  // A url() do @import de Google Fonts tem ";" DENTRO da string de query
  // (ex.: "...wght@400;500;600..."), entao um `[^;]*;` ingenuo para no
  // primeiro ";" de dentro da URL, nao no fim real do statement — e engole
  // o resto da linha para dentro do proximo seletor, corrompendo todo o
  // parse depois dela. Casa a url(...) entre aspas primeiro (nao-guloso ate
  // a aspa de fechamento), so entao qualquer coisa ate o ";" real.
  css = css.replace(/@import\s+url\((['"])[\s\S]*?\1\)[^;]*;/g, '');
  css = stripAtBlocks(css, '@media');
  const rules: CssRule[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = ruleRe.exec(css))) {
    const selectors = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    const decls: Record<string, string> = {};
    for (const decl of match[2].split(';')) {
      const colon = decl.indexOf(':');
      if (colon === -1) continue;
      const prop = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim();
      if (prop) decls[prop] = value;
    }
    rules.push({ selectors, decls, order: order++ });
  }
  return rules;
}

// Especificidade CSS (a, b, c) = (ids, classes/atributos/pseudo-classes,
// tipos/pseudo-elementos). :where(...) contribui ZERO especificidade —
// mesmo com um seletor dentro (ex.: :where(a)) — por definicao da spec;
// e exatamente o mecanismo usado para consertar o bug do item 1.
function specificity(rawSelector: string): [number, number, number] {
  let s = rawSelector.trim();
  s = s.replace(/:where\([^)]*\)/g, ' ');
  let a = 0;
  let b = 0;
  let c = 0;
  a += (s.match(/#[-\w]+/g) || []).length;
  s = s.replace(/#[-\w]+/g, ' ');
  c += (s.match(/::[-\w]+/g) || []).length;
  s = s.replace(/::[-\w]+/g, ' ');
  b += (s.match(/:[-\w]+(\([^)]*\))?/g) || []).length;
  s = s.replace(/:[-\w]+(\([^)]*\))?/g, ' ');
  b += (s.match(/\.[-\w]+/g) || []).length;
  s = s.replace(/\.[-\w]+/g, ' ');
  b += (s.match(/\[[^\]]*\]/g) || []).length;
  s = s.replace(/\[[^\]]*\]/g, ' ');
  c += (s.match(/[a-zA-Z][-\w]*/g) || []).length;
  return [a, b, c];
}

function compareSpecificity(x: [number, number, number], y: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

interface TargetEl {
  tag: string;
  classes: string[];
  // Cadeia real de ancestrais do elemento no HTML gerado (LandingLayout.astro),
  // um token por ancestral, do mais interno ao mais externo — ".classe" para
  // ancestral com classe, "tag" (sem ponto) para seletor de tipo (ex.:
  // "footer"). Usado para nao confundir regras com ancestral qualificado
  // (".privacy a", "footer a") com regras que de fato atingem o alvo so
  // porque o compound mais a direita bate ("a") — a primeira ronda deste
  // resolvedor ignorava isso e media 1.08:1 em vez dos ~2.90:1 reais,
  // porque ".privacy a"/"footer a" (nenhum dos dois um ancestral verdadeiro
  // do CTA) venciam a cascata simulada por especificidade/ordem sem nunca
  // ter sido elegiveis para competir.
  ancestors: string[];
}

// Um "compound selector" e o trecho entre combinadores (so espaco em
// branco neste arquivo — nenhuma regra usa `>`/`+`/`~`). :where(inner) e
// tratado a parte: casa se o alvo casar com QUALQUER seletor da lista
// dentro dos parenteses.
function compoundMatches(compound: string, target: TargetEl): boolean {
  const whereMatch = compound.match(/^:where\(([^)]*)\)$/);
  if (whereMatch) {
    return whereMatch[1].split(',').some((inner) => compoundMatches(inner.trim(), target));
  }
  const classes = (compound.match(/\.[-\w]+/g) || []).map((c) => c.slice(1));
  const rest = compound.replace(/\.[-\w]+/g, '').trim();
  const type = rest.length > 0 && /^[a-zA-Z][-\w]*$/.test(rest) ? rest : undefined;
  if (type && type !== target.tag) return false;
  return classes.every((c) => target.classes.includes(c));
}

// Verdadeiro se `selector` (o texto inteiro, com combinadores) se aplica ao
// elemento alvo no HTML real: o compound mais a direita precisa casar com o
// proprio elemento, E todo compound ancestral (os demais, da esquerda para
// a direita) precisa aparecer na cadeia de ancestrais reais do alvo — sem
// isso, qualquer regra "X a" bateria em QUALQUER <a> da pagina, ancestral
// verdadeiro ou nao (era exatamente o bug: ".privacy a"/"footer a" venciam
// a cascata simulada para o CTA, que nao esta dentro de nenhum dos dois).
// Pseudo-elementos (::selection) sao excluidos aqui de proposito: eles so
// se aplicam num estado de interacao (texto selecionado), nao no
// renderizado base que os pares de contraste desta suite medem.
function selectorMatchesTarget(selector: string, target: TargetEl): boolean {
  const compounds = selector.trim().split(/\s+/);
  const rightmost = compounds[compounds.length - 1];
  if (rightmost.startsWith('::')) return false;
  if (!compoundMatches(rightmost, target)) return false;
  const ancestorCompounds = compounds.slice(0, -1);
  return ancestorCompounds.every((ac) => target.ancestors.includes(ac));
}

// Resolve, entre TODAS as regras cujo seletor de fato atinge `target`
// (compound final + ancestrais, ver selectorMatchesTarget), qual declaracao
// de `prop` vence: maior especificidade primeiro, ordem de origem (a que
// vem depois) como desempate — a mesma regra que um navegador aplica na
// ausencia de !important/camadas/origens diferentes (nenhum destes ocorre
// em landing.css).
function resolveProperty(rules: CssRule[], target: TargetEl, prop: string): string | null {
  let winner: { value: string; spec: [number, number, number]; order: number } | null = null;
  for (const rule of rules) {
    const raw = rule.decls[prop];
    if (raw === undefined) continue;
    for (const sel of rule.selectors) {
      if (!selectorMatchesTarget(sel, target)) continue;
      const spec = specificity(sel);
      const beats =
        !winner ||
        compareSpecificity(spec, winner.spec) > 0 ||
        (compareSpecificity(spec, winner.spec) === 0 && rule.order > winner.order);
      if (beats) winner = { value: raw, spec, order: rule.order };
    }
  }
  return winner ? winner.value : null;
}

// Resolve var(--nome) contra as declaracoes de `.landing` (unico lugar do
// arquivo que declara os tokens --brand-*) e "inherit" contra o `color`
// resolvido de `.landing` — os dois casos que os pares testados abaixo
// precisam. Nao e um resolvedor de cascata de heranca generico (nao
// precisa ser: so `.landing` define color/tokens no caminho ate a raiz das
// duas ancoras que os testes abaixo checam).
function resolveValue(rules: CssRule[], value: string): string {
  const varMatch = value.match(/^var\((--[-\w]+)\)$/);
  if (varMatch) {
    const landingRule = rules.find((r) => r.selectors.includes('.landing'));
    const tokenValue = landingRule?.decls[varMatch[1]];
    if (!tokenValue) throw new Error(`token ${varMatch[1]} nao encontrado em .landing`);
    return resolveValue(rules, tokenValue);
  }
  if (value === 'inherit') {
    const landingRule = rules.find((r) => r.selectors.includes('.landing'));
    const inheritedColor = landingRule?.decls.color;
    if (!inheritedColor) throw new Error('`.landing` nao declara `color` para resolver `inherit`');
    return resolveValue(rules, inheritedColor);
  }
  return value;
}

// Extrai so a cor de um valor de `border` shorthand (ex.: "1px solid
// var(--brand-line-control)") — pega o ultimo token, que e sempre a cor
// nas declaracoes deste arquivo (largura e estilo vem antes, sem funcao
// com parenteses colidindo com var(...) porque so a cor usa var() aqui).
function borderColorValue(shorthand: string): string {
  const varMatch = shorthand.match(/var\(--[-\w]+\)/);
  if (varMatch) return varMatch[0];
  const parts = shorthand.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// Razao de contraste do valor de `prop` que REALMENTE vence a cascata para
// `target`, contra um token de fundo (resolvido normalmente).
function cascadeRatio(css: string, target: TargetEl, prop: string, bgTokenName: string): number {
  const rules = parseRules(css);
  const rawWinner = resolveProperty(rules, target, prop);
  if (rawWinner === null) throw new Error(`nenhuma regra em landing.css define "${prop}" para ${JSON.stringify(target)}`);
  const resolved = prop === 'border' ? resolveValue(rules, borderColorValue(rawWinner)) : resolveValue(rules, rawWinner);
  const bg = parseColor(readToken(css, bgTokenName));
  const fgRaw = parseColor(resolved);
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

  // --brand-line (decorativo: .topbar, .swimlanes, .features li, footer) NAO
  // tem piso aqui de proposito: WCAG 1.4.11 (contraste nao-textual) cobre
  // componentes de interface e objetos graficos necessarios a compreensao
  // do conteudo, e isenta expressamente separadores decorativos — nenhum
  // dos 4 usos de --brand-line delimita um controle ou carrega significado
  // por si so (as bolinhas de estado das swimlanes carregam o significado
  // via cor, nao a linha divisoria da secao). So --brand-line-control (o
  // unico uso que delimita um controle de verdade, o botao .cta-secondary)
  // precisa do piso — testado abaixo, contra o token de controle.
  it('--brand-line-control sobre --brand-bg >= 3:1 (o unico uso que delimita um controle, WCAG 1.4.11)', () => {
    expect(ratioOf(content, '--brand-line-control', '--brand-bg')).toBeGreaterThanOrEqual(3);
  });

  // -----------------------------------------------------------------------
  // Cascata real: resolve qual declaracao vence para elementos concretos da
  // pagina (nao so compara tokens soltos) — e o que teria pegado o bug do
  // fix round 1 (`.landing a { color: inherit }` vencendo `.cta { color:
  // var(--brand-on-coral) }` por especificidade, apesar de vir antes no
  // arquivo). Prova por mutacao registrada em task-1-report.md: revertendo
  // o `:where()` de `.landing :where(a)` para `.landing a` em landing.css,
  // rodar so este arquivo faz exatamente o teste do CTA abaixo falhar
  // (2.90:1 medido, contra o piso de 4.5:1) — nenhum outro teste deste
  // arquivo muda de resultado com essa mutacao.
  // -----------------------------------------------------------------------
  describe('cascata real (nao so tokens) para elementos concretos', () => {
    // Cadeia real de ancestrais dos dois <a class="cta"[-secondary]> dentro
    // de .hero-cta-row, em LandingLayout.astro: <a> < .hero-cta-row <
    // .hero-copy < section.hero < main < body.landing. (O outro <a
    // class="cta"> do topbar tem uma cadeia mais curta — .topbar < .landing
    // — mas nenhuma regra do CSS distingue os dois, entao testar um so ja
    // cobre ambos.)
    const HERO_CTA_ANCESTORS = ['.hero-cta-row', '.hero-copy', '.hero', 'main', '.landing'];

    it('a.cta: a cor de texto que REALMENTE vence a cascata sobre o fundo do botao >= 4.5:1', () => {
      const target = { tag: 'a', classes: ['cta'], ancestors: HERO_CTA_ANCESTORS };
      const ratio = cascadeRatio(content, target, 'color', '--brand-coral');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('a.cta-secondary: a cor de texto que REALMENTE vence a cascata sobre o fundo da pagina >= 4.5:1', () => {
      const target = { tag: 'a', classes: ['cta-secondary'], ancestors: HERO_CTA_ANCESTORS };
      const ratio = cascadeRatio(content, target, 'color', '--brand-bg');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('a.cta-secondary: a borda que REALMENTE vence a cascata sobre o fundo da pagina >= 3:1 (delimita o controle)', () => {
      const target = { tag: 'a', classes: ['cta-secondary'], ancestors: HERO_CTA_ANCESTORS };
      const ratio = cascadeRatio(content, target, 'border', '--brand-bg');
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });
});
