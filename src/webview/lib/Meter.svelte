<script lang="ts">
  import { asciiBar, type ContextLevel } from '../format';
  import { todosStore } from '../stores.svelte';

  // percent em 0..100; level e o que contextLevel() devolveu.
  let { percent, level }: { percent: number; level: ContextLevel } = $props();
  let width = $derived(Math.min(100, Math.max(0, Math.round(percent))));
</script>

{#if todosStore.traits.meter === 'ascii'}
  <span class="ascii {level}" aria-hidden="true">{asciiBar(percent / 100, 16)}</span>
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
  .ctx-fill.ok { background: var(--ct-ok); }
  .ctx-fill.warn { background: var(--ct-warn); }
  .ctx-fill.danger { background: var(--ct-danger); }
  .ascii { font-family: var(--ct-mono); letter-spacing: -0.5px; white-space: pre; flex: 1; min-width: 0; overflow: hidden; }
  .ascii.ok { color: var(--ct-ok); }
  .ascii.warn { color: var(--ct-warn); }
  .ascii.danger { color: var(--ct-danger); }
</style>
