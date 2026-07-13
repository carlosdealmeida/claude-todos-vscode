<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { AgentTodos } from '../../types';
  import TodoItem from './TodoItem.svelte';
  import Icon from './Icon.svelte';
  import { summarizeTiming, formatDuration, completedTaskDurations, formatCompact, agentTypeTone } from '../format';
  import { clock } from '../clock.svelte';
  import { todosStore } from '../stores.svelte';

  let { agent, defaultExpanded = true, history = false, tokens = null }:
    { agent: AgentTodos; defaultExpanded?: boolean; history?: boolean; tokens?: number | null } = $props();
  let expanded = $state(defaultExpanded);

  let counts = $derived({
    total: agent.todos.length,
    completed: agent.todos.filter(t => t.status === 'completed').length,
    inProgress: agent.todos.filter(t => t.status === 'in_progress').length,
  });

  // Estado visual do agente: ativo (pulsa), concluído (verde) ou ocioso.
  let state = $derived(
    counts.inProgress > 0 || agent.status === 'running'
      ? 'active'
      : counts.total > 0 && counts.completed === counts.total
        ? 'done'
        : 'idle',
  );

  let timing = $derived(summarizeTiming(agent.todos, clock.now));
  let durations = $derived(completedTaskDurations(agent.todos));

  let title = $derived(agent.name);
</script>

<section class="agent" class:hist={history} class:active={state === 'active'}>
  <button class="header" onclick={() => expanded = !expanded} aria-expanded={expanded}>
    <span class="chevron" class:open={expanded}><Icon name="chevron" size={12} /></span>
    {#if state !== 'idle'}<span class="dot" class:active={state === 'active'} class:done={state === 'done'}></span>{/if}
    <span class="title">{title}</span>
    {#if agent.agentType}
      <span class="type-badge tone-{agentTypeTone(agent.agentType)}" title={todosStore.t('agent.typeTooltip', { type: agent.agentType })}>{agent.agentType}</span>
    {/if}
    {#if tokens !== null}
      <span class="tokens" title={todosStore.t('agent.tokensTooltip')}>{formatCompact(tokens)}</span>
    {/if}
    <span class="counts">
      <span class="frac">{counts.completed}/{counts.total}</span>
      {#if counts.inProgress > 0}<span class="badge">{todosStore.t('agent.activeBadge', { count: counts.inProgress })}</span>{/if}
    </span>
  </button>

  {#if expanded}
    {#if timing.elapsedMs > 0 || timing.hasEstimate}
      <div class="timing" transition:slide={{ duration: 180 }}>
        {#if timing.elapsedMs > 0}
          <div class="stat">
            <span class="stat-label"><Icon name="clock" size={11} /> {todosStore.t('agent.elapsed')}</span>
            <span class="stat-value">{formatDuration(timing.elapsedMs)}</span>
          </div>
        {/if}
        {#if timing.hasEstimate}
          <div class="stat">
            <span class="stat-label"><Icon name="hourglass" size={11} /> {todosStore.t('agent.remaining')}</span>
            <span class="stat-value">~{formatDuration(timing.estimateMs)}</span>
            <span class="stat-cap" title={todosStore.t('agent.estimateTooltip')}>{todosStore.t('agent.estimateLabel')}</span>
          </div>
        {/if}
      </div>
    {/if}
    <ul class="list" transition:slide={{ duration: 180 }}>
      {#each agent.todos as todo, i (i)}
        <TodoItem {todo} completedMs={durations[i]} />
      {/each}
      {#if agent.todos.length === 0}
        <li class="empty">{todosStore.t('agent.noTodos')}</li>
      {/if}
    </ul>
  {/if}
</section>

<style>
  .agent {
    margin-bottom: var(--sp-2);
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: box-shadow 150ms ease;
  }
  /* Faixa de accent à esquerda do card ativo (sem deslocar o conteúdo). Cor quente
     para distinguir do azul da task em carregamento. */
  .agent.active { box-shadow: inset 2px 0 0 var(--card-accent); }
  .agent.hist { opacity: 0.5; }
  .header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    background: var(--vscode-sideBarSectionHeader-background, transparent);
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .header:hover { background: var(--vscode-list-hoverBackground); }
  .chevron {
    display: inline-flex;
    align-items: center;
    transition: transform 150ms ease;
    opacity: 0.65;
  }
  .chevron.open { transform: rotate(90deg); }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .dot.active {
    background: var(--run);
    animation: pulse-dot 1.6s ease-in-out infinite;
  }
  .dot.done { background: var(--ok); }
  @keyframes pulse-dot {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--run) 55%, transparent); }
    70%, 100% { box-shadow: 0 0 0 5px transparent; }
  }
  .title { flex: 1; font-weight: 600; letter-spacing: 0.1px; }
  .counts {
    font-size: 0.85em;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .frac { color: var(--muted); font-variant-numeric: tabular-nums; }
  .type-badge {
    flex: none;
    font-size: 0.72em;
    padding: 1px 6px;
    border-radius: 8px;
    max-width: 12ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tone);
    background: color-mix(in srgb, var(--tone) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
  }
  .tone-explore { --tone: var(--vscode-charts-green); }
  .tone-plan { --tone: var(--vscode-charts-yellow); }
  .tone-general { --tone: var(--vscode-charts-blue); }
  .tone-neutral { --tone: var(--vscode-descriptionForeground); }
  .tokens {
    flex: none;
    font-size: 0.8em;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .badge {
    background: color-mix(in srgb, var(--run) 22%, var(--vscode-badge-background));
    color: var(--vscode-badge-foreground);
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 0.82em;
    font-weight: 600;
  }
  .timing {
    display: flex;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    font-variant-numeric: tabular-nums;
  }
  /* Cada tempo é um mini cartão de métrica: rótulo pequeno em cima, valor grande
     embaixo, com fundo sutil derivado do tema (descola do cabeçalho). */
  .stat {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2);
    border-radius: 5px;
    background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
  }
  .stat-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78em;
    color: var(--muted);
  }
  .stat-value {
    font-size: 1.15em;
    font-weight: 600;
    line-height: 1.2;
  }
  .stat-cap {
    font-size: 0.72em;
    font-style: italic;
    color: var(--muted);
    opacity: 0.75;
  }
  .list {
    list-style: none;
    padding: var(--sp-1) var(--sp-1) var(--sp-2);
    margin: 0;
  }
  .empty {
    padding: var(--sp-2) var(--sp-3);
    opacity: 0.6;
    font-style: italic;
  }
</style>
