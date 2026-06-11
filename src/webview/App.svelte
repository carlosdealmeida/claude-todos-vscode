<script lang="ts">
  import { todosStore } from './stores.svelte';
  import AgentSection from './lib/AgentSection.svelte';
  import EmptyState from './lib/EmptyState.svelte';
  import UsageTable from './lib/UsageTable.svelte';
  import type { AgentTodos } from '../types';

  function isHistory(agent: AgentTodos): boolean {
    return !agent.isMain && agent.status !== 'running' && agent.todos.length === 0;
  }

  function isFirstHistory(agents: AgentTodos[], i: number): boolean {
    return isHistory(agents[i]) && (i === 0 || !isHistory(agents[i - 1]));
  }

  let snapshot = $derived(todosStore.snapshot);
</script>

<main>
  {#if todosStore.loading}
    <div class="loading">Loading…</div>
  {:else if todosStore.error}
    <div class="error">{todosStore.error}</div>
  {:else if !snapshot}
    <EmptyState reason="no-session" />
  {:else}
    <header class="top">
      <button
        class="session-btn"
        onclick={() => todosStore.pickSession()}
        title={`${snapshot.title}\n${snapshot.sessionId}`}
      >
        {#if snapshot.pinned}<span class="pin">📌</span>{/if}
        <span class="session-title">{snapshot.title}</span>
        <span class="caret">▾</span>
      </button>
      <button class="ghost" onclick={() => todosStore.refresh()} title="Refresh">↻</button>
    </header>
    {#if snapshot.usage}
      <UsageTable usage={snapshot.usage} />
    {/if}
    {#if snapshot.agents.length > 0}
      <div class="agents">
        {#each snapshot.agents as agent, i (agent.agentId)}
          {#if isFirstHistory(snapshot.agents, i)}
            <div class="history-divider">histórico</div>
          {/if}
          <AgentSection {agent} defaultExpanded={agent.isMain} history={isHistory(agent)} />
        {/each}
      </div>
    {:else}
      <div class="awaiting">
        <p class="awaiting-title">Sessão ativa — aguardando tasks</p>
        <p class="awaiting-sub">As tarefas aparecem aqui assim que o agente usar <code>TodoWrite</code>.</p>
      </div>
    {/if}
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
  .session-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    color: inherit;
    font: inherit;
    padding: 0.15rem 0.5rem;
    cursor: pointer;
  }
  .session-btn:hover { background: var(--vscode-list-hoverBackground); }
  .session-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pin, .caret { flex: none; }
  .caret { opacity: 0.7; }
  .awaiting {
    padding: 1.25rem 1rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
  .awaiting-title { font-size: 0.9rem; margin-bottom: 0.35rem; }
  .awaiting-sub { font-size: 0.8rem; opacity: 0.85; }
  .awaiting code {
    background: var(--vscode-textBlockQuote-background);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
  }
  .history-divider {
    text-transform: uppercase;
    font-size: 0.7em;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
    margin: 0.5rem 0 0.25rem;
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
