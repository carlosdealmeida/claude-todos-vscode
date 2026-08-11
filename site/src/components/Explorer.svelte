<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';
  import type { DemoScript, FeatureId } from '../demo/types';
  import type { ScenarioId } from '../i18n/site';
  import Demo from './Demo.svelte';
  import FeatureList from './FeatureList.svelte';
  import smokeTest from '../demo/scripts/smoke-test.json';
  import contextoCritico from '../demo/scripts/contexto-critico.json';
  import listaDefasada from '../demo/scripts/lista-defasada.json';

  let { script, locale = 'en' as Locale }: { script: DemoScript; locale?: Locale } = $props();

  // `bind:this` num componente Svelte 5 devolve suas funcoes exportadas. Tipar
  // com a interface minima que consumimos evita depender de ReturnType do
  // componente, que nao e estavel.
  interface DemoHandle {
    seekToFeature(feature: FeatureId): void;
    switchScript(next: DemoScript): void;
  }

  // Os tres roteiros embarcados em site/src/demo/scripts/ — juntos cobrem as 7
  // features (tests/site/scripts.test.ts garante isso e que nenhum fica
  // orfao). `script` (prop vinda de LandingLayout.astro) so decide o indice
  // inicial; o botao de sessao do painel percorre esta lista inteira.
  const SCRIPTS = [smokeTest, contextoCritico, listaDefasada] as unknown as DemoScript[];

  let demo = $state<DemoHandle | null>(null);
  let active = $state<FeatureId | null>(null);
  let activeIndex = $state(Math.max(0, SCRIPTS.findIndex((s) => s.id === script.id)));

  const activeScript = $derived(SCRIPTS[activeIndex]);
  const available = $derived([...new Set(activeScript.markers.map((m) => m.feature))]);

  function nextScenario(): void {
    activeIndex = (activeIndex + 1) % SCRIPTS.length;
    demo?.switchScript(activeScript);
  }
</script>

<div class="stage">
  <FeatureList
    {available}
    {locale}
    {active}
    scenario={activeScript.id as ScenarioId}
    onSelect={(f) => { active = f; demo?.seekToFeature(f); }}
  />
  <Demo
    bind:this={demo}
    script={activeScript}
    {locale}
    onFeatureChange={(f) => { active = f; }}
    onRequestScenario={nextScenario}
  />
</div>

<style>
  .stage { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
</style>
