<script lang="ts">
  import type { AgentTodos } from '../../types';
  import { ringDash } from '../format';
  import { todosStore } from '../stores.svelte';
  import { isHistory } from '../tree';

  let { agents }: { agents: AgentTodos[] } = $props();
  const R = 18;
  const C = 2 * Math.PI * R;

  // So os agentes vivos: o historico continua na arvore, mais abaixo.
  let items = $derived(
    agents.filter((a) => !isHistory(a)).map((a) => {
      const done = a.todos.filter((t) => t.status === 'completed').length;
      const running = a.status === 'running' || a.todos.some((t) => t.status === 'in_progress');
      return { a, done, total: a.todos.length, running };
    }),
  );
</script>

{#if items.length > 1}
  <nav class="strip" aria-label={todosStore.t('app.agents')}>
    {#each items as it (it.a.agentId)}
      <button
        class="ring-btn"
        class:running={it.running}
        onclick={() => todosStore.focusAgent(it.a.agentId)}
        aria-label={todosStore.t('agentStrip.label', { name: it.a.name, done: it.done, total: it.total })}
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r={R} class="track" />
          <circle cx="22" cy="22" r={R} class="arc" stroke-dasharray="{ringDash(it.done, it.total, C)} {C}" />
        </svg>
        {#if it.running}<span class="live" aria-hidden="true"></span>{/if}
        <span class="name">{it.a.name}</span>
        <span class="frac">{it.done}/{it.total}</span>
      </button>
    {/each}
  </nav>
{/if}

<style>
  .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr)); gap: var(--sp-1); padding: 0 var(--sp-1) var(--sp-2); }
  .ring-btn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--sp-2) 2px; min-height: 44px; min-width: 0; border: 1px solid transparent; border-radius: var(--radius); background: none; color: var(--ct-muted); font: inherit; font-size: 0.85em; cursor: pointer; }
  .ring-btn:hover { background: var(--ct-hover); }
  .ring-btn:focus-visible { outline: 1px solid var(--ct-accent); }
  .ring-btn.running { color: var(--ct-fg); }
  svg { width: 2.6rem; height: 2.6rem; transform: rotate(-90deg); }
  .track { fill: none; stroke: var(--ct-track); stroke-width: 3; }
  .arc { fill: none; stroke: var(--ct-run); stroke-width: 3; stroke-linecap: round; }
  .live { position: absolute; top: calc(var(--sp-2) + 1.9rem); left: calc(50% + 0.75rem); width: 9px; height: 9px; border-radius: 50%; background: var(--ct-run); box-shadow: 0 0 0 2px var(--ct-surface); }
  .name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .frac { font-variant-numeric: tabular-nums; font-size: 0.85em; }
</style>
