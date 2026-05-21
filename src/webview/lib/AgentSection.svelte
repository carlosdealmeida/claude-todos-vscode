<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { AgentTodos } from '../../types';
  import TodoItem from './TodoItem.svelte';

  let { agent, defaultExpanded = true }: { agent: AgentTodos; defaultExpanded?: boolean } = $props();
  let expanded = $state(defaultExpanded);

  let counts = $derived({
    total: agent.todos.length,
    completed: agent.todos.filter(t => t.status === 'completed').length,
    inProgress: agent.todos.filter(t => t.status === 'in_progress').length,
  });

  let title = $derived(agent.isMain ? 'Main agent' : `Sub-agent · ${agent.agentId.slice(0, 8)}`);
</script>

<section class="agent" class:sub={!agent.isMain}>
  <button class="header" onclick={() => expanded = !expanded} aria-expanded={expanded}>
    <span class="chevron" class:open={expanded}>▶</span>
    <span class="title">{title}</span>
    <span class="counts">
      {counts.completed}/{counts.total}
      {#if counts.inProgress > 0}<span class="badge">{counts.inProgress} active</span>{/if}
    </span>
  </button>

  {#if expanded}
    <ul class="list" transition:slide={{ duration: 180 }}>
      {#each agent.todos as todo, i (i)}
        <TodoItem {todo} />
      {/each}
      {#if agent.todos.length === 0}
        <li class="empty">No todos yet</li>
      {/if}
    </ul>
  {/if}
</section>

<style>
  .agent {
    margin-bottom: 0.5rem;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .agent.sub { margin-left: 1rem; }
  .header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--vscode-sideBarSectionHeader-background, transparent);
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .header:hover { background: var(--vscode-list-hoverBackground); }
  .chevron {
    display: inline-block;
    transition: transform 120ms ease;
    font-size: 0.7em;
    opacity: 0.7;
  }
  .chevron.open { transform: rotate(90deg); }
  .title { flex: 1; font-weight: 600; }
  .counts {
    font-size: 0.85em;
    opacity: 0.75;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.85em;
  }
  .list {
    list-style: none;
    padding: 0.25rem 0.25rem 0.5rem;
    margin: 0;
  }
  .empty {
    padding: 0.5rem 0.75rem;
    opacity: 0.6;
    font-style: italic;
  }
</style>
