<script lang="ts">
  import type { ContextLevel } from '../format';
  import { todosStore } from '../stores.svelte';

  // percent em 0..100; level e o que contextLevel() devolveu.
  let { percent, level }: { percent: number; level: ContextLevel } = $props();
  let width = $derived(Math.min(100, Math.max(0, Math.round(percent))));

  // Mais caracteres do que cabem em qualquer painel: a largura da parte cheia e em
  // porcentagem e o resto e cortado. Um numero fixo de caracteres cortado pelo painel
  // estreito comeria so a parte vazia, e 42% e 93% pareceriam iguais.
  const FILLED = '█'.repeat(400);
  const EMPTY = '░'.repeat(400);
</script>

{#if todosStore.traits.meter === 'ascii'}
  <span class="ascii {level}" aria-hidden="true"><span class="on" style="width: {width}%">{FILLED}</span><span class="off">{EMPTY}</span></span>
{:else}
  <div class="ctx-bar" aria-hidden="true"><div class="ctx-fill {level}" style="width: {width}%"></div></div>
{/if}

<style>
  .ctx-bar {
    flex: 1;
    height: 4px;
    background: var(--ct-track);
    border-radius: 2px;
    overflow: hidden;
  }
  .ctx-fill { height: 100%; transition: width 200ms ease; }
  .ctx-fill.ok { background: var(--ct-meter-ok); }
  .ctx-fill.warn { background: var(--ct-warn); }
  .ctx-fill.danger { background: var(--ct-danger); }
  .ascii { display: flex; flex: 1; min-width: 0; overflow: hidden; font-family: var(--ct-mono); letter-spacing: -0.5px; white-space: pre; }
  .on { flex: none; overflow: hidden; }
  .off { flex: 1; min-width: 0; overflow: hidden; }
  .ascii.ok { color: var(--ct-meter-ok-text); }
  .ascii.warn { color: var(--ct-warn); }
  .ascii.danger { color: var(--ct-danger); }
</style>
