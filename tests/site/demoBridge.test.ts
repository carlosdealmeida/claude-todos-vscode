import { describe, it, expect, vi } from 'vitest';
import { createDemoBridge } from '../../site/src/demo/demoBridge';
import type { DemoScript } from '../../site/src/demo/types';
import type { ExtensionMessage } from '../../src/types';

const script: DemoScript = {
  id: 'test',
  recordedAt: 0,
  durationMs: 1000,
  markers: [],
  frames: [{ atMs: 0, snapshot: { sessionId: 's1', cwd: '/r', title: 't', pinned: false, agents: [] } }],
  projectUsage: { sessions: 7, byModel: [], byAgentType: [] },
};

function fakePlayer() {
  return { tMs: 0, playing: false, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), seekToFeature: vi.fn(), destroy: vi.fn() };
}

describe('createDemoBridge', () => {
  it('starts the player when the panel reports ready', () => {
    const player = fakePlayer();
    const bridge = createDemoBridge({ script, player, locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage(() => {});
    bridge.post({ type: 'ready' });
    expect(player.play).toHaveBeenCalled();
  });

  it('sends the current locale on ready', () => {
    const seen: ExtensionMessage[] = [];
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'zh-tw', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage((m) => seen.push(m));
    bridge.post({ type: 'ready' });
    expect(seen).toContainEqual({ type: 'locale', locale: 'zh-tw' });
  });

  it('answers projectUsage with the script fixture', () => {
    const seen: ExtensionMessage[] = [];
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage((m) => seen.push(m));
    bridge.post({ type: 'projectUsage' });
    expect(seen).toContainEqual({ type: 'projectUsage', usage: script.projectUsage });
  });

  it('routes openTodoSource to the host callback', () => {
    const onOpenSource = vi.fn();
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource, onPickSession: vi.fn() });
    bridge.onMessage(() => {});
    bridge.post({ type: 'openTodoSource', sessionId: 's1', agentId: 'a1', line: 42 });
    expect(onOpenSource).toHaveBeenCalledWith('s1', 'a1', 42);
  });

  it('routes pickSession to the host callback', () => {
    const onPickSession = vi.fn();
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession });
    bridge.onMessage(() => {});
    bridge.post({ type: 'pickSession' });
    expect(onPickSession).toHaveBeenCalled();
  });

  it('ignores messages posted before a handler is registered', () => {
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    expect(() => bridge.post({ type: 'refresh' })).not.toThrow();
  });
});
