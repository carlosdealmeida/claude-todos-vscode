<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Locale } from '../../../src/i18n/locale';
  import type { DemoWindow } from '../../../src/webview/bridge';
  import type { DemoScript, FeatureId } from '../demo/types';
  import { createPlayer, type Player } from '../demo/player';
  import { createDemoBridge, type DemoBridge } from '../demo/demoBridge';

  let { script, locale = 'en' as Locale }: { script: DemoScript; locale?: Locale } = $props();

  let host: HTMLDivElement;
  let player: Player | null = null;
  let bridge: DemoBridge | null = null;
  let note = $state<string | null>(null);
  let playing = $state(false);

  onMount(async () => {
    player = createPlayer(script, { onSnapshot: (s) => bridge?.pushSnapshot(s) });
    bridge = createDemoBridge({
      script,
      player,
      locale,
      // No editor isto abriria o transcript na linha; no site vira uma nota.
      onOpenSource: (_s, _a, line) => { note = `line ${line}`; },
      onPickSession: () => { note = 'scenario'; },
    });

    // O App resolve o bridge no load do modulo, entao a injecao vem antes do
    // import dinamico — nao inverter a ordem.
    (window as unknown as DemoWindow).__claudeTodosDemo = bridge;

    const [{ mount }, App] = await Promise.all([
      import('svelte'),
      import('../../../src/webview/App.svelte').then((m) => m.default),
    ]);
    mount(App, { target: host });
    playing = true;
  });

  onDestroy(() => player?.destroy());

  export function seekToFeature(feature: FeatureId): void {
    player?.seekToFeature(feature);
  }

  function toggle(): void {
    if (!player) return;
    if (player.playing) { player.pause(); playing = false; }
    else { player.play(); playing = true; }
  }
</script>

<div class="panel">
  <div class="chrome">
    <button onclick={toggle}>{playing ? '⏸' : '▶'}</button>
    {#if note}<span class="note">{note}</span>{/if}
  </div>
  <div class="webview" bind:this={host}></div>
</div>

<style>
  .panel {
    width: 340px;
    background: var(--demo-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    overflow: hidden;
  }
  .chrome {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .note { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .webview { padding: 8px; min-height: 380px; }
</style>
