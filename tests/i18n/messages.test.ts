import { describe, it, expect } from 'vitest';
import { messages } from '../../src/i18n/messages';

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
