import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { messages } from '../../src/i18n/messages';

describe('termo de agente em zh-tw', () => {
  // 代理 significa proxy: o resto do idioma chama agente de 智慧體.
  it('o catalogo e a secao de temas do README nao usam 代理', () => {
    expect(Object.values(messages['zh-tw']).filter((v) => v.includes('代理'))).toEqual([]);
    const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.zh-tw.md'), 'utf8');
    const temas = readme.slice(readme.indexOf('### 主題'), readme.indexOf('## 隱私'));
    expect(temas).not.toContain('代理');
  });
});

describe('catalog completeness', () => {
  const enKeys = Object.keys(messages.en).sort();
  // Derivado do proprio catalogo: locale novo entra na suite sozinho.
  const locales = Object.keys(messages).filter((l) => l !== 'en') as Array<
    Exclude<keyof typeof messages, 'en'>
  >;

  it('has at least one locale besides en', () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  for (const locale of locales) {
    it(`${locale} has exactly the same keys as en`, () => {
      expect(Object.keys(messages[locale]).sort()).toEqual(enKeys);
    });
    it(`${locale} has no empty strings`, () => {
      for (const [k, v] of Object.entries(messages[locale])) {
        expect(v, `empty value for ${k}`).not.toBe('');
      }
    });
  }
});
