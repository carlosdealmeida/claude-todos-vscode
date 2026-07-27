import { describe, it, expect } from 'vitest';
import { normalizeLocale, resolveLocaleFrom } from '../../src/i18n/locale';

describe('normalizeLocale', () => {
  it('maps Portuguese variants to pt-br', () => {
    expect(normalizeLocale('pt')).toBe('pt-br');
    expect(normalizeLocale('pt-BR')).toBe('pt-br');
    expect(normalizeLocale('pt-PT')).toBe('pt-br');
  });
  it('maps Spanish variants to es', () => {
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('es-ES')).toBe('es');
    expect(normalizeLocale('es-419')).toBe('es');
  });
  it('falls back to en for English and unknown tags', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale('')).toBe('en');
  });
});

describe('resolveLocaleFrom', () => {
  it('uses the forced value when it is not auto', () => {
    expect(resolveLocaleFrom('es', 'pt-BR')).toBe('es');
    expect(resolveLocaleFrom('pt-br', 'en-US')).toBe('pt-br');
  });
  it('falls back to the VS Code language when forced is auto/empty', () => {
    expect(resolveLocaleFrom('auto', 'pt-BR')).toBe('pt-br');
    expect(resolveLocaleFrom(undefined, 'es-ES')).toBe('es');
    expect(resolveLocaleFrom('', 'en-US')).toBe('en');
  });
});

describe('normalizeLocale — chines', () => {
  const cases: Array<[string | undefined, string]> = [
    ['zh', 'zh-cn'],
    ['zh-CN', 'zh-cn'],
    ['zh-cn', 'zh-cn'],
    ['zh-SG', 'zh-cn'],
    ['zh-TW', 'zh-tw'],
    ['zh_TW', 'zh-tw'],
    ['zh-HK', 'zh-tw'],
    ['zh-MO', 'zh-tw'],
    ['zh-Hans', 'zh-cn'],
    ['zh-Hant', 'zh-tw'],
    ['zh-Hant-CN', 'zh-tw'],
    ['zh-Hans-TW', 'zh-cn'],
    ['zh-TW-x-algo', 'zh-tw'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      expect(normalizeLocale(input)).toBe(expected);
    });
  }
});

describe('resolveLocaleFrom — chines', () => {
  it('setting explicito vence o idioma da IDE', () => {
    expect(resolveLocaleFrom('zh-tw', 'zh-CN')).toBe('zh-tw');
  });
  it('auto segue o idioma da IDE', () => {
    expect(resolveLocaleFrom('auto', 'zh-TW')).toBe('zh-tw');
  });
  it('setting vazio segue o idioma da IDE', () => {
    expect(resolveLocaleFrom(undefined, 'zh-HK')).toBe('zh-tw');
  });
});
