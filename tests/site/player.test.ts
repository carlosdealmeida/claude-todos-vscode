import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { frameAt, createPlayer } from '../../site/src/demo/player';
import type { DemoScript } from '../../site/src/demo/types';
import type { SessionSnapshot } from '../../src/types';

function snapWithTitle(title: string): SessionSnapshot {
  return { sessionId: 's1', cwd: '/repo', title, pinned: false, agents: [] };
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
});
