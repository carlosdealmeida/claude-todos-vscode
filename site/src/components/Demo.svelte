<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Locale } from '../../../src/i18n/locale';
  import type { DemoWindow } from '../../../src/webview/bridge';
  import type { ExtensionMessage } from '../../../src/types';
  import type { DemoScript, FeatureId } from '../demo/types';
  import { createPlayer, type Player } from '../demo/player';
  import { createDemoBridge, type DemoBridge } from '../demo/demoBridge';
  import { SITE_STRINGS } from '../i18n/site';

  let {
    script,
    locale = 'en' as Locale,
    onFeatureChange,
    onRequestScenario,
  }: {
    script: DemoScript;
    locale?: Locale;
    // Sentido inverso da navegacao: Explorer.svelte usa isto para manter o
    // realce da FeatureList em sincronia com o marcador que o player cruzou
    // por ultimo (nao apenas com o clique do usuario).
    onFeatureChange?: (feature: FeatureId | null) => void;
    // Acionado quando o usuario clica o botao de troca de sessao do proprio
    // painel (App.svelte -> stores.svelte.ts -> pickSession). Explorer.svelte
    // usa isto como gatilho para avancar o cenario ativo.
    onRequestScenario?: () => void;
  } = $props();

  let host: HTMLDivElement;
  // window.__claudeTodosDemo so pode ser atribuido uma vez: src/webview/
  // stores.svelte.ts le essa variavel ao carregar o modulo (uma unica vez, no
  // mount do App) e nunca mais relê window depois disso — o objeto capturado
  // ali fica sendo o unico canal de post()/onMessage() pelo resto da pagina.
  // Para trocar de roteiro sem remontar o App (armadilha conhecida deste
  // plano), este proxy e o unico objeto que a pagina injeta em window; ele
  // delega para o DemoBridge "de verdade" que muda a cada troca de cenario.
  let proxy: (DemoBridge & { setInner(next: DemoBridge): void }) | null = null;
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
  function markerAt(forScript: DemoScript, tMs: number): FeatureId | null {
    let found: FeatureId | null = null;
    for (const marker of forScript.markers) {
      if (marker.atMs > tMs) break;
      found = marker.feature;
    }
    return found;
  }

  function createScenarioProxy(): DemoBridge & { setInner(next: DemoBridge): void } {
    let inner: DemoBridge | null = null;
    let handler: ((msg: ExtensionMessage) => void) | null = null;
    return {
      onMessage(next) {
        handler = next;
        inner?.onMessage(next);
      },
      post(msg) { inner?.post(msg); },
      pushSnapshot(s) { inner?.pushSnapshot(s); },
      pushLocale(l) { inner?.pushLocale(l); },
      setInner(next) {
        inner = next;
        // O handler foi capturado uma unica vez por stores.svelte.ts; cada
        // bridge novo precisa recebe-lo de volta explicitamente, senao os
        // snapshots do roteiro novo nunca chegam ao painel ja montado.
        if (handler) inner.onMessage(handler);
      },
    };
  }

  // Destroi o player/bridge do roteiro anterior (se houver) e cria os do
  // roteiro `forScript`, sem tocar no App.svelte ja montado. Chamada tanto no
  // primeiro mount quanto em cada troca de cenario via switchScript().
  function setupForScript(forScript: DemoScript): void {
    player?.destroy();
    note = null;
    activeFeature = null;
    player = createPlayer(forScript, {
      onSnapshot: (s) => {
        bridge?.pushSnapshot(s);
        activeFeature = markerAt(forScript, player?.tMs ?? 0);
      },
    });
    bridge = createDemoBridge({
      script: forScript,
      player,
      locale,
      // No editor isto abriria o transcript na linha; no site vira uma nota.
      onOpenSource: (_s, _a, line) => { note = `line ${line}`; },
      onPickSession: () => { onRequestScenario?.(); },
    });
    proxy?.setInner(bridge);
    // O 'ready' que dispara a locale so e enviado uma vez, no primeiro mount
    // do App — sem isto o painel voltaria para o ingles a cada troca.
    proxy?.pushLocale(locale);
    player.play();
    playing = true;
  }

  $effect(() => {
    onFeatureChange?.(activeFeature);
  });

  onMount(async () => {
    proxy = createScenarioProxy();

    // O App resolve o bridge no load do modulo, entao a injecao vem antes do
    // import dinamico — nao inverter a ordem.
    (window as unknown as DemoWindow).__claudeTodosDemo = proxy;
    setupForScript(script);

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
    // O proxy injetado em window.__claudeTodosDemo sobrevive ao componente se
    // nao for limpo aqui — ele fecha sobre um player ja destruido e o script
    // inteiro. Baixo impacto hoje (pagina estatica de view unica), mas e uma
    // referencia global a objeto morto por uma linha de custo.
    delete (window as unknown as DemoWindow).__claudeTodosDemo;
  });

  export function seekToFeature(feature: FeatureId): void {
    player?.seekToFeature(feature);
    activeFeature = feature;
  }

  // Chamado por Explorer.svelte (via bind:this) quando o usuario aciona a
  // troca de cenario. Destroi o player/bridge do roteiro anterior e cria os
  // do novo, sem remontar o App.svelte ja em tela — ver setupForScript().
  export function switchScript(next: DemoScript): void {
    setupForScript(next);
  }

  function toggle(): void {
    if (!player) return;
    if (player.playing) { player.pause(); playing = false; }
    else { player.play(); playing = true; }
  }

  const strings = $derived(SITE_STRINGS[locale]);
</script>

<div class="panel">
  <div class="chrome">
    <button onclick={toggle} aria-label={playing ? strings.demoPause : strings.demoPlay}>
      <span aria-hidden="true">{playing ? '⏸' : '▶'}</span>
    </button>
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
