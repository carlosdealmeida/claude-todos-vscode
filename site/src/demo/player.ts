import type { SessionSnapshot } from '../../../src/types';
import type { DemoScript, FeatureId } from './types';
import { reanchor } from './reanchor';

const TICK_MS = 250;

export interface PlayerOptions {
  onSnapshot(snapshot: SessionSnapshot): void;
}

export interface Player {
  readonly tMs: number;
  readonly playing: boolean;
  play(): void;
  pause(): void;
  seek(tMs: number): void;
  seekToFeature(feature: FeatureId): void;
  destroy(): void;
}

// Cada frame carrega o estado completo (nao delta), entao exibir o instante t e
// so achar o ultimo frame com atMs <= t. Seek para tras sai de graca.
export function frameAt(script: DemoScript, tMs: number): SessionSnapshot | null {
  let found: SessionSnapshot | null = null;
  for (const frame of script.frames) {
    if (frame.atMs > tMs) break;
    found = frame.snapshot;
  }
  return found;
}

export function createPlayer(script: DemoScript, opts: PlayerOptions): Player {
  let tMs = 0;
  let playing = false;

  // Reancora em funcao do t atual: no instante t do roteiro, o inicio da
  // gravacao equivale a `Date.now() - t`. Tocando a 1x o relogio do painel
  // avanca em sincronia sozinho; pausado, re-emitir a cada tick recalcula o
  // delta e congela os cronometros em vez de deixa-los correndo.
  function emit(): void {
    const snapshot = frameAt(script, tMs);
    if (!snapshot) return;
    opts.onSnapshot(reanchor(snapshot, Date.now() - (script.recordedAt + tMs)));
  }

  const timer = setInterval(() => {
    if (playing) {
      tMs += TICK_MS;
      if (tMs >= script.durationMs) tMs = 0;
    }
    emit();
  }, TICK_MS);

  return {
    get tMs() { return tMs; },
    get playing() { return playing; },
    play() { playing = true; emit(); },
    pause() { playing = false; },
    seek(next: number) {
      tMs = Math.max(0, Math.min(next, script.durationMs));
      emit();
    },
    seekToFeature(feature: FeatureId) {
      const marker = script.markers.find((m) => m.feature === feature);
      if (marker) this.seek(marker.atMs);
    },
    destroy() { clearInterval(timer); },
  };
}
