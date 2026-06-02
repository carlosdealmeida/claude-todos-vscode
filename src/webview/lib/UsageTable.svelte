<script lang="ts">
  import type { SessionUsage, ModelUsage } from '../../types';
  import { formatCompact, shortModel } from '../format';

  let { usage }: { usage: SessionUsage } = $props();
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
      <span class="label">Tokens</span>
      <button class="toggle" onclick={() => byAgent = !byAgent} aria-pressed={byAgent}>
        {byAgent ? '◂ por modelo' : 'por agente ▸'}
      </button>
    </div>

    <table>
      <thead>
        <tr>
          <th class="name">{byAgent ? 'Agente' : 'Modelo'}</th>
          <th>Input</th>
          <th>Output</th>
          <th>Cache</th>
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
          <td class="name">Total</td>
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
    border-radius: 6px;
    margin: 0 0.5rem 0.5rem;
    padding: 0.4rem 0.5rem;
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
  .model {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    margin-left: 0.3rem;
  }
</style>
