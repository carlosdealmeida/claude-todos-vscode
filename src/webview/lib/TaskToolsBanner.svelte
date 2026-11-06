<script lang="ts">
  import { todosStore } from '../stores.svelte';
</script>

<section class="banner">
  <span class="text">{todosStore.t('app.taskToolsBanner.text')}</span>
  <button class="enable" onclick={() => todosStore.enableTaskTools()} title={todosStore.t('app.taskToolsOff.hint')}>
    {todosStore.t('app.taskToolsBanner.button')}
  </button>
</section>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    border: 1px solid var(--ct-border);
    border-left: 2px solid var(--ct-warn);
    border-radius: 5px;
    padding: var(--sp-1);
    margin-bottom: var(--sp-2);
    font-size: 0.85em;
  }
  .text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .enable {
    flex: none;
    background: var(--ct-btn-bg);
    color: var(--ct-btn-fg);
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 0.15rem 0.6rem;
    font: inherit;
    cursor: pointer;
  }
  .enable:hover {
    background: var(--ct-btn-hover);
    filter: brightness(1.08);
  }
</style>
