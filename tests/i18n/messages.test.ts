import { describe, it, expect } from 'vitest';
import { messages } from '../../src/i18n/messages';

describe('catalog completeness', () => {
  const enKeys = Object.keys(messages.en).sort();
  for (const locale of ['pt-br', 'es'] as const) {
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
