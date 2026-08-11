import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { frameAt, createPlayer } from '../../site/src/demo/player';
import type { DemoScript } from '../../site/src/demo/types';
import type { SessionSnapshot } from '../../src/types';

function snapWithTitle(title: string): SessionSnapshot {
  return { sessionId: 's1', cwd: '/repo', title, pinned: false, agents: [] };
}

// Snapshot com um agente e uma task com startedAt/updatedAt conhecidos, para
// exercer numericamente a formula de reancoragem (nao apenas por leitura).
function snapWithTiming(startedAt: number, updatedAt: number): SessionSnapshot {
  return {
    sessionId: 's1',
    cwd: '/repo',
    title: 'timing',
    pinned: false,
    agents: [
      {
        sessionId: 's1',
        agentId: 'a1',
        name: 'main',
        isMain: true,
        todos: [{ content: 'do thing', status: 'in_progress', activeForm: 'doing thing', startedAt }],
        updatedAt,
      },
    ],
  };
}

const script: DemoScript = {
  id: 'test',
  recordedAt: 1_000_000,
  durationMs: 3000,
  markers: [
    { feature: 'agent-tree', atMs: 0 },
    { feature: 'dashboard', atMs: 2000 },
  ],
  frames: [
    { atMs: 0, snapshot: snapWithTitle('f0') },
    { atMs: 1000, snapshot: snapWithTitle('f1') },
    { atMs: 2000, snapshot: snapWithTitle('f2') },
  ],
  projectUsage: { sessions: 0, byModel: [], byAgentType: [] },
};

// Roteiro dedicado a exercer numericamente a formula de reancoragem
// (Date.now() - (recordedAt + tMs)), com timestamps conhecidos em vez de
// agents: [] (que faz reanchor() virar um no-op).
const timingScript: DemoScript = {
  id: 'timing',
  recordedAt: 1_000_000,
  durationMs: 3000,
  markers: [],
  frames: [
    { atMs: 0, snapshot: snapWithTiming(1_000_000 + 100, 1_000_000 + 150) },
    { atMs: 1000, snapshot: snapWithTiming(1_000_000 + 100, 1_000_000 + 1150) },
  ],
  projectUsage: { sessions: 0, byModel: [], byAgentType: [] },
};

describe('frameAt', () => {
  it('returns the last frame at or before t', () => {
    expect(frameAt(script, 1500)?.title).toBe('f1');
    expect(frameAt(script, 1000)?.title).toBe('f1');
    expect(frameAt(script, 9999)?.title).toBe('f2');
  });

  it('returns null before the first frame', () => {
    const late = { ...script, frames: [{ atMs: 500, snapshot: snapWithTitle('x') }] };
    expect(frameAt(late, 100)).toBeNull();
  });
});

describe('createPlayer', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(5_000_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('emits the frame at t=0 on play, reanchored to now', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    expect(seen.at(-1)?.title).toBe('f0');
    p.destroy();
  });

  it('advances through frames as time passes', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    vi.advanceTimersByTime(1100);
    expect(seen.at(-1)?.title).toBe('f1');
    p.destroy();
  });

  it('loops back to the start after durationMs', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    vi.advanceTimersByTime(3200);
    expect(seen.at(-1)?.title).toBe('f0');
    p.destroy();
  });

  it('seekToFeature jumps to the marker', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.seekToFeature('dashboard');
    expect(p.tMs).toBe(2000);
    expect(seen.at(-1)?.title).toBe('f2');
    p.destroy();
  });

  it('keeps re-emitting while paused so live timers stay frozen', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.seek(1000);
    const before = seen.length;
    vi.advanceTimersByTime(2000);
    expect(seen.length).toBeGreaterThan(before);
    expect(seen.at(-1)?.title).toBe('f1');
    expect(p.tMs).toBe(1000);
    p.destroy();
  });

  it('pause() freezes tMs and the displayed frame; play() resumes advancing', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    vi.advanceTimersByTime(1100);
    expect(p.tMs).toBe(1000);
    expect(seen.at(-1)?.title).toBe('f1');

    p.pause();
    vi.advanceTimersByTime(1000);
    expect(p.tMs).toBe(1000); // nao avancou enquanto pausado
    expect(seen.at(-1)?.title).toBe('f1');

    p.play();
    vi.advanceTimersByTime(1000);
    expect(p.tMs).toBe(2000); // voltou a avancar a partir de onde pausou
    expect(seen.at(-1)?.title).toBe('f2');
    p.destroy();
  });

  it('clamps seek() to the script bounds (negative and past durationMs)', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });

    p.seek(-500);
    expect(p.tMs).toBe(0);
    expect(seen.at(-1)?.title).toBe('f0');

    p.seek(script.durationMs + 5000);
    expect(p.tMs).toBe(script.durationMs);
    expect(seen.at(-1)?.title).toBe('f2');
    p.destroy();
  });

  it('destroy() stops the timer: no further snapshots are emitted afterwards', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    p.play();
    vi.advanceTimersByTime(500);
    const countBeforeDestroy = seen.length;

    p.destroy();
    vi.advanceTimersByTime(5000);
    expect(seen.length).toBe(countBeforeDestroy);
  });

  it('seekToFeature works when destructured off the player (does not rely on `this`)', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    const { seekToFeature } = p;

    seekToFeature('dashboard');
    expect(p.tMs).toBe(2000);
    expect(seen.at(-1)?.title).toBe('f2');
    p.destroy();
  });

  it('reanchors startedAt/updatedAt using Date.now() - (recordedAt + tMs) while playing', () => {
    let last: SessionSnapshot | undefined;
    const p = createPlayer(timingScript, { onSnapshot: (s) => { last = s; } });

    p.play(); // tMs = 0; Date.now() == 5_000_000 (vi.setSystemTime in beforeEach)
    const expectedDelta = Date.now() - (timingScript.recordedAt + 0);
    expect(last?.agents[0]?.todos[0]?.startedAt).toBe(1_000_100 + expectedDelta);
    expect(last?.agents[0]?.updatedAt).toBe(1_000_150 + expectedDelta);
    p.destroy();
  });

  // A formula desloca um timestamp ABSOLUTO, entao o valor bruto emitido tem
  // que acompanhar o relogio real tick a tick (nao pode ficar parado — um
  // epoch parado enquanto o tempo real passa mudaria o "decorrido"
  // observado). O que efetivamente congela e o "decorrido" (Date.now() menos
  // o timestamp reancorado): e essa diferenca que fica constante enquanto
  // pausado, e e isso que a UI usa para desenhar o cronometro. Se a formula
  // do delta perder o termo de Date.now(), trocar o sinal, ou usar um
  // coeficiente errado, essa invariante quebra.
  it('while paused, the raw timestamp tracks Date.now() but the elapsed time stays frozen', () => {
    const seen: SessionSnapshot[] = [];
    const p = createPlayer(timingScript, { onSnapshot: (s) => seen.push(s) });

    p.seek(1000); // pausado (playing continua false), tMs=1000
    const startedAt1 = seen.at(-1)!.agents[0]!.todos[0]!.startedAt!;
    const elapsed1 = Date.now() - startedAt1;

    vi.advanceTimersByTime(250);
    const startedAt2 = seen.at(-1)!.agents[0]!.todos[0]!.startedAt!;
    const elapsed2 = Date.now() - startedAt2;

    vi.advanceTimersByTime(250);
    const startedAt3 = seen.at(-1)!.agents[0]!.todos[0]!.startedAt!;
    const elapsed3 = Date.now() - startedAt3;

    expect(p.tMs).toBe(1000); // seguiu pausado durante os dois ticks
    expect(startedAt2).toBe(startedAt1 + 250);
    expect(startedAt3).toBe(startedAt1 + 500);
    expect(elapsed2).toBe(elapsed1);
    expect(elapsed3).toBe(elapsed1);
    p.destroy();
  });
});
