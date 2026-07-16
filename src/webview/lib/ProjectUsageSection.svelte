<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { ModelUsage } from '../../types';
  import { formatCompact, shortModel, cacheLevel } from '../format';
  import { todosStore } from '../stores.svelte';
  import Icon from './Icon.svelte';

  let expanded = $state(false);
  let byType = $state(false);

  // Lazy por design: a agregação só roda quando o usuário expande; expandir de
  // novo re-pede (dados frescos — o memo do serviço torna isso barato).
  function toggle(): void {
    expanded = !expanded;
    if (expanded) todosStore.requestProjectUsage();
  }

  // "main"/"subagent" são baldes sentinela do serviço; tipos reais exibem cru.
  function typeLabel(agentType: string): string {
    if (agentType === 'main') return todosStore.t('project.typeMain');
    if (agentType === 'subagent') return todosStore.t('project.typeUntyped');
    return agentType;
  }

  let usage = $derived(todosStore.projectUsage);
  let loading = $derived(todosStore.projectUsageLoading);

  let cache = $derived(usage?.cache);
  let cacheTotal = $derived(cache ? cache.input + cache.read + cache.creation : 0);
  let cacheRate = $derived(cache && cacheTotal > 0 ? cache.read / cacheTotal : 0);
  let cacheLvl = $derived(cacheLevel(cacheRate));
  function pctOf(part: number): number {
    return cacheTotal > 0 ? Math.round((part / cacheTotal) * 100) : 0;
  }

  function total(rows: ModelUsage[]): ModelUsage {
    return rows.reduce(
      (acc, r) => ({ model: '', input: acc.input + r.input, output: acc.output + r.output, cache: acc.cache + r.cache }),
      { model: '', input: 0, output: 0, cache: 0 },
    );
  }
  let modelTotal = $derived(usage ? total(usage.byModel) : { model: '', input: 0, output: 0, cache: 0 });
</script>

<section class="project">
  <button class="header" onclick={toggle} aria-expanded={expanded} aria-controls="project-usage-body">
    <span class="chevron" class:open={expanded}><Icon name="chevron" size={12} /></span>
    <span class="title">{todosStore.t('project.title')}</span>
    {#if expanded && usage && usage.sessions > 0}
      <span class="count">{todosStore.t('project.sessions', { n: usage.sessions })}</span>
    {/if}
  </button>

  {#if expanded}
    <div class="body" id="project-usage-body" transition:slide={{ duration: 180 }}>
      {#if loading && usage === undefined}
        <p class="note">{todosStore.t('project.loading')}</p>
      {:else if !usage || usage.sessions === 0}
        <p class="note">{todosStore.t('project.empty')}</p>
      {:else}
        {#if cache && cacheTotal > 0}
          <div class="cache-head">
            <span class="cache-label">{todosStore.t('usage.cache')}</span>
            <span class="cache-badge {cacheLvl}">{todosStore.t('usage.cacheReuse', { pct: Math.round(cacheRate * 100) })}</span>
          </div>
          <div class="cache-stack" aria-hidden="true">
            <div class="seg read" style="width: {pctOf(cache.read)}%"></div>
            <div class="seg create" style="width: {pctOf(cache.creation)}%"></div>
            <div class="seg new" style="width: {pctOf(cache.input)}%"></div>
          </div>
        {/if}
        <div class="table-head">
          <button class="toggle" onclick={() => byType = !byType} aria-pressed={byType}>
            {byType ? '◂ ' + todosStore.t('usage.byModel') : todosStore.t('project.byAgentType') + ' ▸'}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th class="name">{byType ? todosStore.t('project.colAgentType') : todosStore.t('usage.colModel')}</th>
              <th>{todosStore.t('usage.colInput')}</th>
              <th>{todosStore.t('usage.colOutput')}</th>
              <th>{todosStore.t('usage.cache')}</th>
            </tr>
          </thead>
          <tbody>
            {#if byType}
              {#each usage.byAgentType as a (a.agentType)}
                <tr>
                  <td class="name" title={a.agentType}>{typeLabel(a.agentType)}</td>
                  <td title={String(a.input)}>{formatCompact(a.input)}</td>
                  <td title={String(a.output)}>{formatCompact(a.output)}</td>
                  <td title={String(a.cache)}>{formatCompact(a.cache)}</td>
                </tr>
              {/each}
            {:else}
              {#each usage.byModel as m (m.model)}
                <tr>
                  <td class="name" title={m.model}>{shortModel(m.model)}</td>
                  <td title={String(m.input)}>{formatCompact(m.input)}</td>
                  <td title={String(m.output)}>{formatCompact(m.output)}</td>
                  <td title={String(m.cache)}>{formatCompact(m.cache)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
          <tfoot>
            <tr>
              <td class="name">{todosStore.t('usage.total')}</td>
              <td title={String(modelTotal.input)}>{formatCompact(modelTotal.input)}</td>
              <td title={String(modelTotal.output)}>{formatCompact(modelTotal.output)}</td>
              <td title={String(modelTotal.cache)}>{formatCompact(modelTotal.cache)}</td>
            </tr>
          </tfoot>
        </table>
      {/if}
    </div>
  {/if}
</section>

<style>
  .project {
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius);
    margin: 0 var(--sp-1) var(--sp-2);
    font-size: 0.85em;
  }
  .header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    padding: 0.4rem var(--sp-2);
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
  .title {
    flex: 1;
    text-transform: uppercase;
    font-size: 0.8em;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
  }
  .count {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    font-variant-numeric: tabular-nums;
  }
  .body { padding: 0 var(--sp-2) 0.4rem; }
  .table-head { display: flex; justify-content: flex-end; margin: 0.1rem 0; }
  .toggle {
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    color: inherit;
    font: inherit;
    font-size: 0.9em;
    padding: 0 0.4rem;
    border-radius: 4px;
    cursor: pointer;
  }
  .toggle:hover { background: var(--vscode-list-hoverBackground); }
  .note {
    padding: 0.2rem 0 0.3rem;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 0.15rem 0.3rem; white-space: nowrap; }
  th.name, td.name { text-align: left; }
  thead th {
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  tfoot td {
    border-top: 1px solid var(--vscode-panel-border);
    font-weight: 600;
  }
  .cache-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0.1rem 0 0.2rem;
  }
  .cache-label { font-size: 0.9em; }
  .cache-badge {
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.85em;
    font-weight: 600;
  }
  .cache-badge.good { color: var(--vscode-charts-green); background: color-mix(in srgb, var(--vscode-charts-green) 15%, transparent); }
  .cache-badge.mid { color: var(--vscode-charts-yellow); background: color-mix(in srgb, var(--vscode-charts-yellow) 15%, transparent); }
  .cache-badge.low { color: var(--vscode-charts-red); background: color-mix(in srgb, var(--vscode-charts-red) 15%, transparent); }
  .cache-stack {
    display: flex;
    height: 7px;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.35rem;
  }
  .cache-stack .seg { height: 100%; }
  .cache-stack .seg.read { background: var(--vscode-charts-green); }
  .cache-stack .seg.create { background: var(--vscode-charts-blue); }
  .cache-stack .seg.new { background: var(--vscode-descriptionForeground); }
</style>
