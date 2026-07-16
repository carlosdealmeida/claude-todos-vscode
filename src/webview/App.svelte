<script lang="ts">
  import { todosStore } from './stores.svelte';
  import EmptyState from './lib/EmptyState.svelte';
  import UsageTable from './lib/UsageTable.svelte';
  import ProjectUsageSection from './lib/ProjectUsageSection.svelte';
  import Icon from './lib/Icon.svelte';
  import AgentTree from './lib/AgentTree.svelte';
  import { buildTree, isHistory } from './tree';

  let snapshot = $derived(todosStore.snapshot);
  // Alimenta o hint de lista defasada do main (condição cruza agentes).
  let hasRunningSubAgent = $derived(
    snapshot?.agents.some(a => !a.isMain && a.status === 'running') ?? false,
  );
</script>

<main>
  {#if todosStore.loading}
    <div class="loading">{todosStore.t('app.loading')}</div>
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
        {#if snapshot.pinned}<span class="pin"><Icon name="pin" size={12} /></span>{/if}
        <span class="session-title">{snapshot.title}</span>
        <span class="caret"><Icon name="chevron" size={12} /></span>
      </button>
      <button class="ghost" onclick={() => todosStore.refresh()} title={todosStore.t('app.refresh')} aria-label={todosStore.t('app.refresh')}><Icon name="refresh" size={14} /></button>
    </header>
    {#if snapshot.usage}
      <UsageTable usage={snapshot.usage} />
    {/if}
    <ProjectUsageSection />
    {#if snapshot.agents.length > 0}
      <div class="agents">
        {#each buildTree(snapshot.agents) as root (root.agent.agentId)}
          <AgentTree node={root} usage={snapshot.usage} history={isHistory(root.agent)} {hasRunningSubAgent} />
        {/each}
      </div>
    {:else}
      <div class="awaiting">
        <p class="awaiting-title">{todosStore.t('app.awaitingTitle')}</p>
        <p class="awaiting-sub">{todosStore.t('app.awaitingSubBefore')}<code>TodoWrite</code>{todosStore.t('app.awaitingSubAfter')}</p>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    padding: var(--sp-2);
    height: 100vh;
    overflow-y: auto;
  }
  .top {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    justify-content: space-between;
    padding: var(--sp-1) var(--sp-1) var(--sp-2);
    font-size: 0.85em;
  }
  .session-btn {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    color: inherit;
    font: inherit;
    padding: 0.2rem var(--sp-2);
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .session-btn:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--accent);
  }
  .session-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pin, .caret { flex: none; display: inline-flex; }
  .pin { color: var(--accent); }
  .caret { opacity: 0.65; transform: rotate(90deg); }
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
  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    color: inherit;
    padding: 0.25rem 0.4rem;
    border-radius: 5px;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .ghost:hover { background: var(--vscode-list-hoverBackground); border-color: var(--accent); }
  .loading, .error {
    padding: 1rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
  .error { color: var(--vscode-errorForeground); }
</style>
