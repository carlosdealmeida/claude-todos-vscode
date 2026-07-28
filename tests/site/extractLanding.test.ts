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

  it('rewrites relative links to absolute GitHub URLs', () => {
    const out = extractLanding('## A\n\n- see [contributing](CONTRIBUTING.md)\n');
    expect(out.features[0]).toContain('https://github.com/carlosdealmeida/claude-todos-vscode/blob/master/CONTRIBUTING.md');
  });
});
