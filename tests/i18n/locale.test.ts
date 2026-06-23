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
