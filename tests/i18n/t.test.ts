import { describe, it, expect } from 'vitest';
import { createT } from '../../src/i18n/t';

describe('createT', () => {
  it('looks up a key in the requested locale', () => {
    expect(createT('pt-br')('app.loading')).toBe('Carregando…');
    expect(createT('es')('usage.total')).toBe('Total');
  });
  it('interpolates params', () => {
    expect(createT('en')('agent.activeBadge', { count: 3 })).toBe('3 active');
    expect(createT('pt-br')('time.minutesAgo', { n: 5 })).toBe('há 5 min');
    expect(createT('es')('hook.installFailed', { error: 'EACCES' })).toBe('Error al instalar los hooks: EACCES');
  });
  it('looks up directly in en', () => {
    expect(createT('en')('app.loading')).toBe('Loading…');
  });
  it('returns the key itself when it is missing from every locale', () => {
    // The locale->en fallback branch is a defensive safety net that valid keys
    // cannot reach (catalog completeness is guaranteed by messages.test.ts), so
    // we only cover the key-as-fallback path here, casting to bypass the type.
    expect(createT('pt-br')('does.not.exist' as any)).toBe('does.not.exist');
  });
});
