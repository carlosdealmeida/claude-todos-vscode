import { describe, it, expect, vi } from 'vitest';
import { createScenarioProxy } from '../../site/src/demo/scenarioProxy';
import { createDemoBridge, type DemoBridge } from '../../site/src/demo/demoBridge';
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

function bridge(): DemoBridge {
  const player = { tMs: 0, playing: false, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), seekToFeature: vi.fn(), destroy: vi.fn() };
  return createDemoBridge({ script, player, locale: 'en', onOpenSource: vi.fn(), onPickSession: vi.fn() });
}

const appearances = (seen: ExtensionMessage[]) => seen.filter((m) => m.type === 'appearance');

describe('createScenarioProxy', () => {
  // O chunk do painel demora a carregar: quem troca o tema antes disso nao pode
  // ficar com o seletor em um tema e o painel em outro.
  it('applies a theme picked before the panel loaded', () => {
    const proxy = createScenarioProxy();
    proxy.setInner(bridge());
    proxy.pushAppearance('mission');

    const seen: ExtensionMessage[] = [];
    proxy.onMessage((m) => seen.push(m));
    proxy.post({ type: 'ready' });

    expect(appearances(seen)).toEqual([{ type: 'appearance', theme: 'mission' }]);
  });

  it('sends no theme when nobody picked one', () => {
    const proxy = createScenarioProxy();
    proxy.setInner(bridge());
    const seen: ExtensionMessage[] = [];
    proxy.onMessage((m) => seen.push(m));
    proxy.post({ type: 'ready' });

    expect(appearances(seen)).toEqual([]);
  });

  it('delivers a theme picked after the panel loaded once', () => {
    const proxy = createScenarioProxy();
    proxy.setInner(bridge());
    const seen: ExtensionMessage[] = [];
    proxy.onMessage((m) => seen.push(m));
    proxy.post({ type: 'ready' });
    proxy.pushAppearance('papel');

    expect(appearances(seen)).toEqual([{ type: 'appearance', theme: 'papel' }]);
  });

  // Trocar de cenario nao remonta o painel: o handler passa para o bridge novo.
  it('keeps delivering to the mounted panel after a scenario switch', () => {
    const proxy = createScenarioProxy();
    proxy.setInner(bridge());
    const seen: ExtensionMessage[] = [];
    proxy.onMessage((m) => seen.push(m));
    proxy.setInner(bridge());
    proxy.pushAppearance('terminal');

    expect(appearances(seen)).toEqual([{ type: 'appearance', theme: 'terminal' }]);
  });
});
