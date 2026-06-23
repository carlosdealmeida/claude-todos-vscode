<script lang="ts">
  import type { SessionUsage, ModelUsage } from '../../types';
  import { formatCompact, shortModel, contextLevel, cacheLevel } from '../format';
  import { todosStore } from '../stores.svelte';

  let { usage }: { usage: SessionUsage } = $props();
  let ctx = $derived(usage.context);
  let ctxPct = $derived(ctx ? Math.min(ctx.tokens / ctx.limit, 1) : 0);
  let ctxLevel = $derived(ctx ? contextLevel(ctx.tokens / ctx.limit) : 'ok');

  let cache = $derived(usage.cache);
  let cacheTotal = $derived(cache ? cache.input + cache.read + cache.creation : 0);
  let cacheRate = $derived(cache && cacheTotal > 0 ? cache.read / cacheTotal : 0);
  let cacheLvl = $derived(cacheLevel(cacheRate));
  function pctOf(part: number): number {
    return cacheTotal > 0 ? Math.round((part / cacheTotal) * 100) : 0;
  }

  let byAgent = $state(false);

  function total(rows: ModelUsage[]): ModelUsage {
    return rows.reduce(
      (acc, r) => ({ model: '', input: acc.input + r.input, output: acc.output + r.output, cache: acc.cache + r.cache }),
      { model: '', input: 0, output: 0, cache: 0 },
    );
  }

  let modelTotal = $derived(total(usage.byModel));
</script>

{#if usage.byModel.length > 0}
  <section class="usage">
    <div class="head">
      <span class="label">{todosStore.t('usage.tokens')}{#if ctx}<span class="ctx-badge {ctxLevel}">{todosStore.t('usage.ctxBadge', { pct: Math.round(ctxPct * 100) })}</span>{/if}</span>
      <button class="toggle" onclick={() => byAgent = !byAgent} aria-pressed={byAgent}>
        {byAgent ? '◂ ' + todosStore.t('usage.byModel') : todosStore.t('usage.byAgent') + ' ▸'}
      </button>
    </div>

    {#if ctx}
      <div class="ctx-bar-row">
        <div class="ctx-bar" aria-hidden="true"><div class="ctx-fill {ctxLevel}" style="width: {Math.round(ctxPct * 100)}%"></div></div>
        <span class="ctx-count">{formatCompact(ctx.tokens)}/{formatCompact(ctx.limit)}</span>
      </div>
    {/if}

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
      <div class="cache-legend">
        <span><span class="cdot read"></span>{todosStore.t('usage.cacheRead')} {formatCompact(cache.read)}</span>
        <span><span class="cdot create"></span>{todosStore.t('usage.cacheCreated')} {formatCompact(cache.creation)}</span>
        <span><span class="cdot new"></span>{todosStore.t('usage.cacheNew')} {formatCompact(cache.input)}</span>
      </div>
    {/if}

    <table>
      <thead>
        <tr>
          <th class="name">{byAgent ? todosStore.t('usage.colAgent') : todosStore.t('usage.colModel')}</th>
          <th>{todosStore.t('usage.colInput')}</th>
          <th>{todosStore.t('usage.colOutput')}</th>
          <th>{todosStore.t('usage.cache')}</th>
        </tr>
      </thead>
      <tbody>
        {#if byAgent}
          {#each usage.byAgent as agent (agent.agentId)}
            {#each agent.models as m, i (m.model)}
              <tr>
                <td class="name" title={`${agent.name}\n${m.model}`}>
                  {i === 0 ? agent.name : ''}<span class="model">{shortModel(m.model)}</span>
                </td>
                <td title={String(m.input)}>{formatCompact(m.input)}</td>
                <td title={String(m.output)}>{formatCompact(m.output)}</td>
                <td title={String(m.cache)}>{formatCompact(m.cache)}</td>
              </tr>
            {/each}
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
  </section>
{/if}

<style>
  .usage {
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius);
    margin: 0 var(--sp-1) var(--sp-2);
    padding: 0.4rem var(--sp-2);
    font-size: 0.85em;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }
  .label {
    text-transform: uppercase;
    font-size: 0.8em;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
  }
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
  .ctx-badge {
    margin-left: 0.4rem;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.85em;
    font-weight: 600;
  }
  .ctx-badge.ok {
    color: var(--vscode-charts-green);
    background: color-mix(in srgb, var(--vscode-charts-green) 15%, transparent);
  }
  .ctx-badge.warn {
    color: var(--vscode-charts-yellow);
    background: color-mix(in srgb, var(--vscode-charts-yellow) 15%, transparent);
  }
  .ctx-badge.danger {
    color: var(--vscode-charts-red);
    background: color-mix(in srgb, var(--vscode-charts-red) 15%, transparent);
  }
  .ctx-bar-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
  }
  .ctx-bar {
    flex: 1;
    height: 4px;
    background: var(--vscode-panel-border);
    border-radius: 2px;
    overflow: hidden;
  }
  .ctx-fill { height: 100%; transition: width 200ms ease; }
  .ctx-fill.ok { background: var(--vscode-charts-green); }
  .ctx-fill.warn { background: var(--vscode-charts-yellow); }
  .ctx-fill.danger { background: var(--vscode-charts-red); }
  .ctx-count {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
  .model {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    margin-left: 0.3rem;
  }
  .cache-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.2rem;
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
    margin-bottom: 0.25rem;
  }
  .cache-stack .seg { height: 100%; }
  .cache-stack .seg.read { background: var(--vscode-charts-green); }
  .cache-stack .seg.create { background: var(--vscode-charts-blue); }
  .cache-stack .seg.new { background: var(--vscode-descriptionForeground); }
  .cache-legend {
    display: flex;
    gap: 0.6rem;
    font-size: 0.75em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 0.4rem;
    flex-wrap: wrap;
  }
  .cdot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 2px;
    margin-right: 3px;
    vertical-align: middle;
  }
  .cdot.read { background: var(--vscode-charts-green); }
  .cdot.create { background: var(--vscode-charts-blue); }
  .cdot.new { background: var(--vscode-descriptionForeground); }
</style>
