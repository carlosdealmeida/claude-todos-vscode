import { describe, it, expect } from 'vitest';
import { SessionNotifier, ACTIVITY_MIN_MS, IDLE_MS } from '../../src/services/sessionNotifier';

const T0 = 1_000_000_000;
const MIN = 60_000;

describe('SessionNotifier', () => {
  // Simula uma rajada de atividade contínua: observações a cada 30s (< IDLE_MS,
  // logo a rajada é contínua), do instante `from` até `from + span`, usando o
  // próprio timestamp como mtime (cada observação vê um mtime NOVO). Retorna o
  // instante/mtime da última mudança — observar depois com `mtime` igual a esse
  // retorno simula silêncio.
  function burst(n: SessionNotifier, sessionId: string, from: number, span: number, allComplete = false): number {
    let t = from;
    for (; t <= from + span; t += 30_000) {
      expect(n.observe({ sessionId, mtime: t, allComplete, now: t })).toEqual([]);
    }
    return t - 30_000;
  }

  it('never notifies on the first observation, even if already complete', () => {
    const n = new SessionNotifier();
    expect(n.observe({ sessionId: 's1', mtime: 1, allComplete: true, now: T0 })).toEqual([]);
  });

  it('fires idle exactly once after sustained activity followed by silence', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const lastChange = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    // silêncio: mesmo mtime, 45s depois da última mudança
    expect(n.observe({ sessionId: 's1', mtime: lastChange, allComplete: false, now: lastChange + IDLE_MS }))
      .toEqual(['idle']);
    // silêncio continua — não repete
    expect(n.observe({ sessionId: 's1', mtime: lastChange, allComplete: false, now: lastChange + IDLE_MS + 60_000 }))
      .toEqual([]);
  });

  it('does not fire idle after a short burst', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const lastChange = burst(n, 's1', T0, 20_000); // só 20s de atividade (< ACTIVITY_MIN_MS)
    expect(n.observe({ sessionId: 's1', mtime: lastChange, allComplete: false, now: lastChange + IDLE_MS }))
      .toEqual([]);
  });

  it('rearms idle when activity resumes after firing', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    expect(n.observe({ sessionId: 's1', mtime: c1, allComplete: false, now: c1 + IDLE_MS })).toEqual(['idle']);
    // nova rajada (gap > IDLE_MS abre um novo ciclo) e novo silêncio
    const t2 = c1 + IDLE_MS + 120_000;
    const c2 = burst(n, 's1', t2, ACTIVITY_MIN_MS);
    expect(n.observe({ sessionId: 's1', mtime: c2, allComplete: false, now: c2 + IDLE_MS })).toEqual(['idle']);
  });

  it('fires allComplete only on the false -> true transition', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
    expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: true, now: T0 + 5_000 }))
      .toEqual(['allComplete']);
    expect(n.observe({ sessionId: 's1', mtime: 3, allComplete: true, now: T0 + 10_000 })).toEqual([]);
  });

  it('does not fire allComplete when the session is complete since the first observation', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 1, allComplete: true, now: T0 });
    expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: true, now: T0 + 5_000 })).toEqual([]);
  });

  it('rearms allComplete when a new pending task appears', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
    expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: true, now: T0 + 5_000 })).toEqual(['allComplete']);
    expect(n.observe({ sessionId: 's1', mtime: 3, allComplete: false, now: T0 + 10_000 })).toEqual([]);
    expect(n.observe({ sessionId: 's1', mtime: 4, allComplete: true, now: T0 + 15_000 })).toEqual(['allComplete']);
  });

  it('resets all state when the displayed session changes', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    // troca de sessão: primeira observação da nova nunca notifica…
    expect(n.observe({ sessionId: 's2', mtime: 999, allComplete: true, now: c1 + 1_000 })).toEqual([]);
    // …e o silêncio herdado da s1 não vaza para a s2
    expect(n.observe({ sessionId: 's2', mtime: 999, allComplete: true, now: c1 + 1_000 + IDLE_MS })).toEqual([]);
  });

  it('can return both kinds in one observe, allComplete first', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    // no mesmo instante: tasks completaram (transição) e o silêncio venceu
    expect(n.observe({ sessionId: 's1', mtime: c1, allComplete: true, now: c1 + IDLE_MS }))
      .toEqual(['allComplete', 'idle']);
  });

  describe('shouldPoll', () => {
    it('is false before any observation', () => {
      expect(new SessionNotifier().shouldPoll(T0)).toBe(false);
    });

    it('is true while counting silence and false after idle fires', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
      expect(n.shouldPoll(c1 + 10_000)).toBe(true);   // silêncio ainda contando
      n.observe({ sessionId: 's1', mtime: c1, allComplete: false, now: c1 + IDLE_MS }); // dispara idle
      expect(n.shouldPoll(c1 + IDLE_MS + 1_000)).toBe(false); // notificado — timer pode parar
    });

    it('is false after a short burst goes silent past IDLE_MS', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const c1 = burst(n, 's1', T0, 20_000);
      expect(n.shouldPoll(c1 + IDLE_MS + 1_000)).toBe(false); // nada vai disparar sem nova atividade
    });
  });
});
