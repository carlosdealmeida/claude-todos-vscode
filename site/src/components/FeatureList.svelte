<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';
  import type { FeatureId } from '../demo/types';
  import { SITE_STRINGS } from '../i18n/site';

  let {
    available,
    active = null,
    locale = 'en' as Locale,
    onSelect,
  }: {
    available: FeatureId[];
    active?: FeatureId | null;
    locale?: Locale;
    onSelect: (feature: FeatureId) => void;
  } = $props();

  const strings = $derived(SITE_STRINGS[locale]);
</script>

<nav>
  <h2>{strings.featuresTitle}</h2>
  <ul>
    {#each available as feature (feature)}
      <li>
        <button class:active={active === feature} onclick={() => onSelect(feature)}>
          {strings.features[feature]}
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  h2 { font-size: 13px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
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
