<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { AgentTodos } from '../../types';
  import TodoItem from './TodoItem.svelte';
  import Icon from './Icon.svelte';
  import { summarizeTiming, formatDuration, completedTaskDurations, formatCompact, agentTypeTone, listStaleness, modelBadge, shortModel } from '../format';
  import { clock } from '../clock.svelte';
  import { todosStore } from '../stores.svelte';

  let { agent, defaultExpanded = true, history = false, tokens = null, hasRunningSubAgent = false, currentModel, usedModels = [], mainModel }:
    { agent: AgentTodos; defaultExpanded?: boolean; history?: boolean; tokens?: number | null; hasRunningSubAgent?: boolean; currentModel?: string; usedModels?: string[]; mainModel?: string } = $props();
  // Captura so o valor inicial de proposito: depois disso quem manda e o
  // clique do usuario. Reagir a prop re-expandiria a secao sozinha sempre que
  // o agente voltasse a rodar, desfazendo o que o usuario colapsou.
  // svelte-ignore state_referenced_locally
  let expanded = $state(defaultExpanded);

  let mBadge = $derived(modelBadge(currentModel, mainModel, agent.isMain));

  let stale = $derived(listStaleness(agent, hasRunningSubAgent, clock.now));

  let counts = $derived({
    total: agent.todos.length,
    completed: agent.todos.filter(t => t.status === 'completed').length,
    inProgress: agent.todos.filter(t => t.status === 'in_progress').length,
  });

  // Estado visual do agente: ativo (pulsa), concluído (verde) ou ocioso.
  // Nao chamar de `state`: colide com a rune $state e o svelte-check passa a
  // ler `$state(...)` como auto-subscribe de um store chamado `state`.
  let visualState = $derived(
    counts.inProgress > 0 || agent.status === 'running'
      ? 'active'
      : counts.total > 0 && counts.completed === counts.total
        ? 'done'
        : 'idle',
  );

  let timing = $derived(summarizeTiming(agent.todos, clock.now));
  let durations = $derived(completedTaskDurations(agent.todos));

  let title = $derived(agent.name);

  let sectionEl = $state<HTMLElement | null>(null);
  // Card recolhido ainda vai crescer: rolar agora mediria so o cabecalho e deixaria
  // as tarefas fora da tela. Nesse caso a rolagem espera o fim do slide.
  let scrollWhenOpen = false;
  function scrollToCard(): void {
    sectionEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // Zerar o pedido e obrigatorio: este effect roda de novo a cada snapshot,
  // porque a prop `agent` muda de identidade. Com o pedido ainda de pe, o card
  // reabriria e a tela rolaria a cada atualizacao.
  $effect(() => {
    if (todosStore.focus !== agent.agentId) return;
    todosStore.focus = null;
    if (expanded) {
      scrollToCard();
    } else {
      scrollWhenOpen = true;
      expanded = true;
    }
  });
</script>

<section bind:this={sectionEl} class="agent" class:hist={history} class:active={visualState === 'active'}>
  <button class="header" onclick={() => expanded = !expanded} aria-expanded={expanded}>
    <span class="chevron" class:open={expanded}><Icon name="chevron" size={12} /></span>
    {#if visualState !== 'idle'}<span class="dot" class:active={visualState === 'active'} class:done={visualState === 'done'}></span>{/if}
    <span class="title">{title}</span>
    {#if agent.agentType}
      <span class="type-badge tone-{agentTypeTone(agent.agentType)}" title={todosStore.t('agent.typeTooltip', { type: agent.agentType })}>{agent.agentType}</span>
    {/if}
    {#if mBadge}
      <span class="model-badge" title={todosStore.t('agent.modelTooltip', { models: usedModels.map(shortModel).join(', ') })}>{mBadge}</span>
    {/if}
    {#if tokens !== null}
      <span class="tokens" title={todosStore.t('agent.tokensTooltip')}>{formatCompact(tokens)}</span>
    {/if}
    <span class="counts">
      <span class="frac">{counts.completed}/{counts.total}</span>
      {#if counts.inProgress > 0}<span class="badge">{todosStore.t('agent.activeBadge', { count: counts.inProgress })}</span>{/if}
    </span>
  </button>

  {#if stale !== null}
    <div class="stale" title={todosStore.t('todos.staleListHint')}>
      <Icon name="clock" size={10} />
      <span>{todosStore.t('todos.staleList', { d: formatDuration(stale) })}</span>
    </div>
  {/if}

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
    <ul class="list" transition:slide={{ duration: 180 }} onintroend={() => { if (scrollWhenOpen) { scrollWhenOpen = false; scrollToCard(); } }}>
      {#each agent.todos as todo, i (i)}
        <TodoItem {todo} completedMs={durations[i]} sessionId={agent.sessionId} agentId={agent.agentId} />
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
    border: 1px solid var(--ct-border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: box-shadow 150ms ease;
  }
  /* Faixa de accent à esquerda do card ativo (sem deslocar o conteúdo). Cor quente
     para distinguir do azul da task em carregamento. */
  .agent.active { box-shadow: inset 2px 0 0 var(--ct-agent-active); }
  .agent.hist { opacity: 0.5; }
  .header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    background: var(--ct-header-bg);
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .header:hover { background: var(--ct-hover); }
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
    background: var(--ct-run);
    animation: pulse-dot 1.6s ease-in-out infinite;
  }
  .dot.done { background: var(--ct-done); }
  @keyframes pulse-dot {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ct-run) 55%, transparent); }
    70%, 100% { box-shadow: 0 0 0 5px transparent; }
  }
  .title { flex: 1; font-weight: 600; letter-spacing: 0.1px; }
  .counts {
    font-size: 0.85em;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .frac { color: var(--ct-muted); font-variant-numeric: tabular-nums; }
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
  .tone-explore { --tone: var(--ct-tone-explore); }
  .tone-plan { --tone: var(--ct-tone-plan); }
  .tone-general { --tone: var(--ct-tone-general); }
  .tone-neutral { --tone: var(--ct-tone-neutral); }
  .model-badge {
    flex: none;
    font-size: 0.68em;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--ct-border);
    color: var(--ct-muted);
    white-space: nowrap;
  }
  .tokens {
    flex: none;
    font-size: 0.8em;
    color: var(--ct-muted);
    font-variant-numeric: tabular-nums;
  }
  .badge {
    background: color-mix(in srgb, var(--ct-run) 22%, var(--ct-badge-bg));
    color: var(--ct-badge-fg);
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 0.82em;
    font-weight: 600;
  }
  /* Hint de lista defasada: informativo, não alarmante — o painel continua
     espelho fiel; só sinaliza que o progresso real pode estar nos sub-agents. */
  .stale {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px var(--sp-3) var(--sp-1);
    font-size: 0.78em;
    font-style: italic;
    color: var(--ct-muted);
    cursor: help;
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
    background: color-mix(in srgb, var(--ct-fg) 5%, transparent);
  }
  .stat-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78em;
    color: var(--ct-muted);
  }
  .stat-value {
    font-size: 1.15em;
    font-weight: 600;
    line-height: 1.2;
  }
  .stat-cap {
    font-size: 0.72em;
    font-style: italic;
    color: var(--ct-muted);
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
