<script lang="ts">
  import { todosStore } from '../stores.svelte';
  let { reason }: { reason: 'no-workspace' | 'no-session' | 'hook-missing' } = $props();
</script>

<div class="empty">
  {#if reason === 'no-workspace'}
    <h3>{todosStore.t('empty.noWorkspace.title')}</h3>
    <p>{todosStore.t('empty.noWorkspace.body')}</p>
  {:else if reason === 'hook-missing'}
    <h3>{todosStore.t('empty.hookMissing.title')}</h3>
    <p>{todosStore.t('empty.hookMissing.before')}<code>{todosStore.t('empty.hookMissing.command')}</code>{todosStore.t('empty.hookMissing.after')}</p>
  {:else}
    <h3>{todosStore.t('empty.noSession.title')}</h3>
    <p>{todosStore.t('empty.noSession.before')}<code>claude</code>{todosStore.t('empty.noSession.after')}</p>
  {/if}
</div>

<style>
  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
  h3 { font-size: 1rem; margin-bottom: 0.5rem; }
  code {
    background: var(--vscode-textBlockQuote-background);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
  }
</style>
