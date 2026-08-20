import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { extractLanding } from '../../site/scripts/extractLanding.mjs';

describe('extractLanding', () => {
  it('extracts the bold tagline that precedes the first image', () => {
    const out = extractLanding(fs.readFileSync('README.en.md', 'utf8'));
    expect(out.tagline).toContain('Claude Code');
    expect(out.tagline).not.toContain('**');
  });

  it('extracts the feature bullets from section 0', () => {
    const out = extractLanding(fs.readFileSync('README.en.md', 'utf8'));
    expect(out.features.length).toBeGreaterThanOrEqual(6);
    expect(out.features.every((f) => f.length > 0)).toBe(true);
    expect(out.features.some((f) => f.includes('##'))).toBe(false);
  });

  it('extracts install and privacy sections', () => {
    const out = extractLanding(fs.readFileSync('README.en.md', 'utf8'));
    expect(out.install).toContain('Marketplace');
    expect(out.privacy.toLowerCase()).toContain('local');
  });

  it('extracts the correct tagline for pt-br, where the language switcher line is also bold', () => {
    // README.md lista "Português" primeiro no seletor de idiomas; como é o
    // idioma da própria página, a linha do seletor fica em negrito
    // ("**Português** · [English](...) · ..."). A tagline real vem depois.
    const out = extractLanding(fs.readFileSync('README.md', 'utf8'));
    expect(out.tagline).toContain('Claude Code');
    expect(out.tagline).not.toContain('Português');
    expect(out.tagline).not.toContain('**');
  });

  it('works on the Chinese README, where headings differ', () => {
    const out = extractLanding(fs.readFileSync('README.zh-cn.md', 'utf8'));
    expect(out.features.length).toBeGreaterThanOrEqual(6);
    expect(out.install).toContain('Marketplace');
  });

  it('excludes intro/trailing prose and blank lines from the feature bullets', () => {
    // Os READMEs reais nao tem prosa solta na secao 0, entao esse cenario nao
    // aparece nos testes acima — sintetizamos um markdown que tem, para travar
    // o filtro de bullets (`startsWith('- ')`) e nao so o slice/trim.
    const md = '## Features\nIntro paragraph, not a feature.\n\n- First feature\n- Second feature\n\nTrailing note.\n';
    const out = extractLanding(md);
    expect(out.features).toEqual(['First feature', 'Second feature']);
  });

  it('rewrites relative links to absolute GitHub URLs, as a real <a> tag', () => {
    const out = extractLanding('## A\n\n- see [contributing](CONTRIBUTING.md)\n');
    expect(out.features[0]).toBe(
      'see <a href="https://github.com/carlosdealmeida/claude-todos-vscode/blob/master/CONTRIBUTING.md">contributing</a>',
    );
  });

  it('leaves the URL of in-page anchor links untouched, but still emits a real <a> tag', () => {
    const out = extractLanding('## A\n\n- see [jump](#privacy)\n');
    expect(out.features[0]).toBe('see <a href="#privacy">jump</a>');
  });

  it('leaves the URL of already-absolute links untouched, but still emits a real <a> tag', () => {
    const out = extractLanding('## A\n\n- see [site](https://example.com/page)\n');
    expect(out.features[0]).toBe('see <a href="https://example.com/page">site</a>');
  });

  it('converts **bold** to <strong>', () => {
    const out = extractLanding('## A\n\n- **Live agent tree** does the thing\n');
    expect(out.features[0]).toBe('<strong>Live agent tree</strong> does the thing');
    expect(out.features[0]).not.toContain('**');
  });

  it('converts `code` to <code>', () => {
    const out = extractLanding('## A\n\n- transitions `pending -> completed` live\n');
    expect(out.features[0]).toBe('transitions <code>pending -&gt; completed</code> live');
    expect(out.features[0]).not.toContain('`');
  });

  it('escapes raw HTML-sensitive characters (&, <, >) before generating tags', () => {
    const out = extractLanding('## A\n\n- Tom & Jerry: a <script> is not code, `< b >` is\n');
    // `&`, `<` e `>` fora de marcacao markdown saem escapados...
    expect(out.features[0]).toContain('Tom &amp; Jerry: a &lt;script&gt; is not code');
    // ...e o `<`/`>` DENTRO do code span tambem, senao a tag <code> gerada
    // no passo seguinte seria indistinguivel de HTML injetado pelo texto de
    // origem.
    expect(out.features[0]).toContain('<code>&lt; b &gt;</code>');
    // A saida nao deve conter um "<script>" HTML de verdade.
    expect(out.features[0]).not.toContain('<script>');
  });

  it('applies the same bold/code/link conversions to install and privacy', () => {
    // splitSections indexa por posicao (SECTION.INSTALL = 2, SECTION.PRIVACY = 5),
    // entao precisamos de 6 secoes na mesma ordem que um README real usa, com
    // conteudo relevante so nos indices 2 e 5.
    const md = [
      '## Features',
      '## How it works',
      '## Install',
      'See the **Marketplace** or run `npm install`, or read [the docs](README.md).',
      '## Commands',
      '## Settings',
      '## Privacy',
      'This is **fully local**, using `~/.claude`.',
    ].join('\n');
    const out = extractLanding(md);
    expect(out.install).toContain('<strong>Marketplace</strong>');
    expect(out.install).toContain('<code>npm install</code>');
    expect(out.install).toContain(
      '<a href="https://github.com/carlosdealmeida/claude-todos-vscode/blob/master/README.md">the docs</a>',
    );
    expect(out.privacy).toBe('This is <strong>fully local</strong>, using <code>~/.claude</code>.');
  });

  it('escapes a double quote inside a link target so it cannot break out of the href attribute', () => {
    const out = extractLanding('## A\n\n- see [x](http://example.com/" onmouseover="bad)\n');
    expect(out.features[0]).toBe(
      'see <a href="http://example.com/&quot; onmouseover=&quot;bad">x</a>',
    );
    // Nao pode sobrar uma aspa dupla crua dentro do valor do atributo href -
    // isso quebraria para fora do atributo e deixaria um atributo novo
    // (onmouseover=) ser anexado a tag <a>.
    expect(out.features[0]).not.toContain('" onmouseover=');
  });

  it('keeps a code span with two ** occurrences fully inside <code>, without a nested <strong>', () => {
    const out = extractLanding('## A\n\n- see `a ** b ** c` here\n');
    expect(out.features[0]).toBe('see <code>a ** b ** c</code> here');
    expect(out.features[0]).not.toContain('<strong>');
  });

  it('still converts a single ** inside a code span correctly (the glob pattern the real READMEs use)', () => {
    const out = extractLanding('## A\n\n- exclude `dist/**/*.ts` from the build\n');
    expect(out.features[0]).toBe('exclude <code>dist/**/*.ts</code> from the build');
    expect(out.features[0]).not.toContain('<strong>');
  });

  describe('title/lede (Step 4 — H1 e o negrito da tagline, lede e o resto)', () => {
    const LOCALE_FILES: Record<string, string> = {
      en: 'README.en.md',
      'pt-br': 'README.md',
      es: 'README.es.md',
      'zh-cn': 'README.zh-cn.md',
      'zh-tw': 'README.zh-tw.md',
    };

    it.each(Object.entries(LOCALE_FILES))(
      '%s: title e o trecho em negrito, lede e o resto sem o travessao, e tagline continua existindo',
      (_locale, file) => {
        const out = extractLanding(fs.readFileSync(file, 'utf8'));

        expect(out.title.length).toBeGreaterThan(0);
        expect(out.title).not.toContain('*');
        // O title precisa ser um prefixo do tagline original (mesmo texto,
        // so sem os marcadores "**") — garante que title nao e um trecho
        // arbitrario, e sim exatamente o que estava em negrito no inicio.
        expect(out.tagline.startsWith(out.title)).toBe(true);

        expect(out.lede).not.toContain('*');
        // O lede nao pode reabrir com o travessao que o separava do title -
        // ele existe pra ser removido, nao preservado no inicio da string.
        expect(out.lede.startsWith('—')).toBe(false);
        expect(out.lede.startsWith('-')).toBe(false);
        // tagline == title + (travessao) + lede, reconstruido: continua
        // batendo com o campo legado, que nenhum consumidor deixou de usar.
        expect(out.tagline).toContain(out.lede);
      },
    );

    it('title nunca sai vazio nos 5 READMEs reais (a garantia que Step 4 pede)', () => {
      // A garantia de "title nunca vazio" e sobre os READMEs reais, que
      // sempre tem uma linha "**tagline**" antes da 1a secao (o it.each
      // acima ja confere isso individualmente) — nao um invariante universal
      // para markdown arbitrario. Sem uma linha em negrito no head, nao ha
      // tagline nenhuma para extrair (comportamento existente, anterior a
      // este Step): title cai no fallback (a propria tagline), que tambem
      // fica vazio nesse caso.
      const md = 'plain text without any bold line\n\n## Features\n\n- x\n';
      const out = extractLanding(md);
      expect(out.tagline).toBe('');
      expect(out.title).toBe('');
      expect(out.lede).toBe('');

      for (const file of Object.values(LOCALE_FILES)) {
        const real = extractLanding(fs.readFileSync(file, 'utf8'));
        expect(real.title.length).toBeGreaterThan(0);
      }
    });

    it('separa title e lede de uma tagline sintetica com travessao em dash', () => {
      const out = extractLanding(
        '**Short pitch** — the rest of the sentence, kept verbatim.\n\n## Features\n\n- x\n',
      );
      expect(out.title).toBe('Short pitch');
      expect(out.lede).toBe('the rest of the sentence, kept verbatim.');
    });

    it('remove tambem um hifen simples como separador (nao so o em dash "—")', () => {
      const out = extractLanding('**Short pitch** - the rest.\n\n## Features\n\n- x\n');
      expect(out.title).toBe('Short pitch');
      expect(out.lede).toBe('the rest.');
    });
  });
});
