import { describe, it, expect } from 'vitest';
import { sessionPickDescription } from '../../src/services/sessionPicker';
import type { MessageKey } from '../../src/i18n/messages';

const t = (key: MessageKey): string => (key === 'picker.alive' ? 'ao vivo' : key);

describe('sessionPickDescription', () => {
  const session = { sessionId: 'abcd1234efgh', cwd: '/work/api' };

  it('viva + mono-root: bolinha + id curto + tempo, sem pasta', () => {
    expect(sessionPickDescription({ ...session, alive: true }, false, 'há 5 min', t))
      .toBe('● ao vivo · abcd1234 · há 5 min');
  });

  it('morta + mono-root: sem bolinha, sem pasta', () => {
    expect(sessionPickDescription(session, false, 'há 5 min', t))
      .toBe('abcd1234 · há 5 min');
  });

  it('viva + multi-root: bolinha + id curto + basename da pasta + tempo', () => {
    expect(sessionPickDescription({ ...session, alive: true }, true, 'há 5 min', t))
      .toBe('● ao vivo · abcd1234 · api · há 5 min');
  });

  it('morta + multi-root: id curto + basename da pasta + tempo, sem bolinha', () => {
    expect(sessionPickDescription(session, true, 'há 5 min', t))
      .toBe('abcd1234 · api · há 5 min');
  });
});
