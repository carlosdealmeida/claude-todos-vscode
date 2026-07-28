<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';
  import type { DemoScript, FeatureId } from '../demo/types';
  import Demo from './Demo.svelte';
  import FeatureList from './FeatureList.svelte';

  let { script, locale = 'en' as Locale }: { script: DemoScript; locale?: Locale } = $props();

  // `bind:this` num componente Svelte 5 devolve suas funcoes exportadas. Tipar
  // com a interface minima que consumimos evita depender de ReturnType do
  // componente, que nao e estavel.
  interface DemoHandle { seekToFeature(feature: FeatureId): void }

  let demo = $state<DemoHandle | null>(null);
  let active = $state<FeatureId | null>(null);

  const available = $derived([...new Set(script.markers.map((m) => m.feature))]);
</script>

<div class="stage">
  <FeatureList
    {available}
    {locale}
    {active}
    onSelect={(f) => { active = f; demo?.seekToFeature(f); }}
  />
  <Demo bind:this={demo} {script} {locale} onFeatureChange={(f) => { active = f; }} />
</div>

<style>
  .stage { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
</style>
