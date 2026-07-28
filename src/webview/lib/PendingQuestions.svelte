<script lang="ts">
  import type { PendingQuestion } from '../../types';
  import { todosStore } from '../stores.svelte';
  import { pendingSummary } from '../format';

  let { questions, sessionId }: { questions: PendingQuestion[]; sessionId: string } = $props();

  // O agentId das perguntas pendentes é sempre o do agente main, que reusa o
  // próprio sessionId (ver snapshotService/todosParser) — a linha aponta para
  // o transcript principal.
  let summary = $derived(pendingSummary(questions, todosStore.t));
</script>

{#if summary}
  <section class="pending">
    <p class="pending-title">{summary.title}</p>
    {#each summary.items as item, i (i)}
      <button class="pending-item" onclick={() => todosStore.openTodoSource(sessionId, sessionId, item.line)}>
        {#if item.chip}<span class="chip">{item.chip}</span>{/if}
        <span class="text">{item.text}</span>
      </button>
    {/each}
  </section>
{/if}

<style>
  .pending {
    border: 1px solid var(--vscode-panel-border);
    border-left: 2px solid var(--vscode-charts-yellow);
    border-radius: 5px;
    padding: var(--sp-1);
    margin-bottom: var(--sp-2);
  }
  .pending-title {
    margin: 0 0 var(--sp-1);
    font-size: 0.85em;
    opacity: 0.9;
  }
  .pending-item {
    display: flex;
    align-items: baseline;
    gap: var(--sp-1);
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 2px 0;
    color: inherit;
    cursor: pointer;
    font-size: 0.85em;
  }
  .pending-item:hover .text { text-decoration: underline; }
  .chip {
    flex: none;
    max-width: 45%;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 0.9em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* header do modelo pode trazer token sem espaco (URL, path) — sem isso o
     texto estoura a largura da sidebar em vez de quebrar linha. */
  .text { min-width: 0; overflow-wrap: anywhere; }
</style>
