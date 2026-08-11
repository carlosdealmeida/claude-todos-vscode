<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';
  import type { FeatureId } from '../demo/types';
  import { SITE_STRINGS, type ScenarioId } from '../i18n/site';

  let {
    available,
    active = null,
    locale = 'en' as Locale,
    scenario = null,
    onSelect,
  }: {
    available: FeatureId[];
    active?: FeatureId | null;
    locale?: Locale;
    // Roteiro ativo (Task 16 — troca de cenario pelo botao de sessao do
    // painel); exibido como subtitulo para que a troca de cenario tenha um
    // rotulo estavel, nao so a lista de features mudando por baixo.
    scenario?: ScenarioId | null;
    onSelect: (feature: FeatureId) => void;
  } = $props();

  const strings = $derived(SITE_STRINGS[locale]);
</script>

<nav aria-labelledby="feature-list-title">
  <h2 id="feature-list-title">{strings.featuresTitle}</h2>
  {#if scenario}<p class="scenario" aria-live="polite">{strings.scenarios[scenario]}</p>{/if}
  <ul>
    {#each available as feature (feature)}
      <li>
        <button
          class:active={active === feature}
          aria-current={active === feature ? 'true' : undefined}
          onclick={() => onSelect(feature)}
        >
          {strings.features[feature]}
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  h2 { font-size: 13px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
  .scenario { margin: 0 0 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
  ul { list-style: none; margin: 0; padding: 0; }
  button {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font: inherit;
    padding: 6px 8px;
    text-align: left;
    width: 100%;
  }
  button:hover { background: var(--vscode-list-hoverBackground); }
  button.active { border-left: 2px solid var(--vscode-focusBorder); font-weight: 600; }
</style>
