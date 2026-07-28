import { describe, it, expect, vi } from 'vitest';
import { createDemoBridge } from '../../site/src/demo/demoBridge';
import type { DemoScript } from '../../site/src/demo/types';
import type { ExtensionMessage, SessionSnapshot } from '../../src/types';

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

  it('forwards pushSnapshot to the registered handler with the exact snapshot', () => {
    const seen: ExtensionMessage[] = [];
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage((m) => seen.push(m));
    const snapshot: SessionSnapshot = { sessionId: 's2', cwd: '/other', title: 'other', pinned: true, agents: [] };
    bridge.pushSnapshot(snapshot);
    expect(seen).toContainEqual({ type: 'snapshot', snapshot });
  });

  it('forwards pushLocale to the registered handler with the exact locale', () => {
    const seen: ExtensionMessage[] = [];
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    bridge.onMessage((m) => seen.push(m));
    bridge.pushLocale('es');
    expect(seen).toContainEqual({ type: 'locale', locale: 'es' });
  });

  it('ignores post() messages sent through the panel-answer path before a handler is registered', () => {
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    // projectUsage (like ready) goes through send() internally — this is the
    // path the null-handler guard actually protects, unlike 'refresh' which
    // never calls send() and would pass even without the guard.
    expect(() => bridge.post({ type: 'projectUsage' })).not.toThrow();

    // Once a handler attaches, subsequent sends must still work normally —
    // the earlier no-handler send should have been silently dropped, not
    // queued or left in a broken state.
    const seen: ExtensionMessage[] = [];
    bridge.onMessage((m) => seen.push(m));
    bridge.post({ type: 'projectUsage' });
    expect(seen).toEqual([{ type: 'projectUsage', usage: script.projectUsage }]);
  });

  it('ignores pushSnapshot/pushLocale calls made before a handler is registered', () => {
    const bridge = createDemoBridge({ script, player: fakePlayer(), locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
    expect(() => bridge.pushSnapshot({ sessionId: 's1', cwd: '/r', title: 't', pinned: false, agents: [] })).not.toThrow();
    expect(() => bridge.pushLocale('pt-br')).not.toThrow();
  });
});
