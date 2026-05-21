<script lang="ts">
  import { todosStore } from './stores.svelte';
  import AgentSection from './lib/AgentSection.svelte';
  import EmptyState from './lib/EmptyState.svelte';

  let snapshot = $derived(todosStore.snapshot);
</script>

<main>
  {#if todosStore.loading}
    <div class="loading">Loading…</div>
  {:else if todosStore.error}
    <div class="error">{todosStore.error}</div>
  {:else if !snapshot}
    <EmptyState reason="no-session" />
  {:else if snapshot.agents.length === 0}
    <EmptyState reason="no-session" />
  {:else}
    <header class="top">
      <div class="session-id" title={snapshot.sessionId}>
        Session · {snapshot.sessionId.slice(0, 8)}
      </div>
      <button class="ghost" onclick={() => todosStore.refresh()} title="Refresh">↻</button>
    </header>
    <div class="agents">
      {#each snapshot.agents as agent (agent.agentId)}
        <AgentSection {agent} defaultExpanded={agent.isMain} />
      {/each}
    </div>
  {/if}
</main>

<style>
  main {
    padding: 0.5rem;
    height: 100vh;
    overflow-y: auto;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem 0.5rem;
    font-size: 0.85em;
    opacity: 0.8;
  }
  .session-id {
    font-family: var(--vscode-editor-font-family);
  }
  .ghost {
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    color: inherit;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
  }
  .ghost:hover { background: var(--vscode-list-hoverBackground); }
  .loading, .error {
    padding: 1rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
  .error { color: var(--vscode-errorForeground); }
</style>
