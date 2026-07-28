<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Locale } from '../../../src/i18n/locale';
  import type { DemoWindow } from '../../../src/webview/bridge';
  import type { DemoScript, FeatureId } from '../demo/types';
  import { createPlayer, type Player } from '../demo/player';
  import { createDemoBridge, type DemoBridge } from '../demo/demoBridge';

  let {
    script,
    locale = 'en' as Locale,
    onFeatureChange,
  }: {
    script: DemoScript;
    locale?: Locale;
    // Sentido inverso da navegacao: Explorer.svelte usa isto para manter o
    // realce da FeatureList em sincronia com o marcador que o player cruzou
    // por ultimo (nao apenas com o clique do usuario).
    onFeatureChange?: (feature: FeatureId | null) => void;
  } = $props();

  let host: HTMLDivElement;
  let player: Player | null = null;
  let bridge: DemoBridge | null = null;
  let note = $state<string | null>(null);
  let playing = $state(false);
  let activeFeature = $state<FeatureId | null>(null);

  // Sentido inverso da navegacao: enquanto o roteiro toca, destaca a feature
  // cujo marcador foi o ultimo atingido.
  //
  // Premissa: script.markers precisa estar ordenado por atMs crescente — o
  // loop para no primeiro marcador que ultrapassa tMs, entao um marcador fora
  // de ordem seria ignorado (ou venceria cedo demais) sem erro visivel. Vale
  // para as fixtures atuais; nao ha ordenacao defensiva aqui de proposito.
  function markerAt(tMs: number): FeatureId | null {
    let found: FeatureId | null = null;
    for (const marker of script.markers) {
      if (marker.atMs > tMs) break;
      found = marker.feature;
    }
    return found;
  }

  $effect(() => {
    onFeatureChange?.(activeFeature);
  });

  onMount(async () => {
    player = createPlayer(script, {
      onSnapshot: (s) => {
        bridge?.pushSnapshot(s);
        activeFeature = markerAt(player?.tMs ?? 0);
      },
    });
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

    // O import('svelte') dinamico aqui, ao lado do import estatico do modulo
    // 'svelte' que o proprio Astro/@astrojs/svelte ja injeta neste componente,
    // e o que o Vite acusa no aviso de build ("dynamically imported ... but
    // also statically imported"). E ruido inofensivo: o Rollup detecta que o
    // runtime ja esta no grafo e reaproveita o mesmo chunk (sem duplicar o
    // Svelte) — o import dinamico existe so para atrasar a resolucao de
    // 'App.svelte' ate depois da linha acima, garantindo que
    // window.__claudeTodosDemo ja esteja atribuido quando o App resolve o
    // bridge no load do modulo. Nao trocar por um import estatico no topo.
    const [{ mount }, App] = await Promise.all([
      import('svelte'),
      import('../../../src/webview/App.svelte').then((m) => m.default),
    ]);
    mount(App, { target: host });
    playing = true;
  });

  onDestroy(() => {
    player?.destroy();
    // O bridge injetado em window.__claudeTodosDemo sobrevive ao componente se
    // nao for limpo aqui — ele fecha sobre um player ja destruido e o script
    // inteiro. Baixo impacto hoje (pagina estatica de view unica), mas e uma
    // referencia global a objeto morto por uma linha de custo.
    delete (window as unknown as DemoWindow).__claudeTodosDemo;
  });

  export function seekToFeature(feature: FeatureId): void {
    player?.seekToFeature(feature);
    activeFeature = feature;
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
