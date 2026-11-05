<script lang="ts">
  import type { AgentTodos } from '../../types';
  import { agentIcon, ringDash, todoSegments } from '../format';
  import { todosStore } from '../stores.svelte';
  import { isHistory } from '../tree';
  import Icon from './Icon.svelte';

  let { agents, variant }: { agents: AgentTodos[]; variant: 'rings' | 'leds' } = $props();
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

<!-- Um anel sozinho nao acrescenta nada ao card logo abaixo; LEDs sao o placar do
     Mission Control e aparecem mesmo com um agente so. -->
{#if variant === 'leds' || items.length > 1}
  <nav class="strip" class:leds={variant === 'leds'} aria-label={todosStore.t('app.agents')}>
    {#each items as it (it.a.agentId)}
      {#if variant === 'leds'}
      <button class="led-row" class:running={it.running} onclick={() => todosStore.focusAgent(it.a.agentId)}
        title={it.a.name}
        aria-label={todosStore.t('agentStrip.label', { name: it.a.name, done: it.done, total: it.total })}>
        <span class="led" class:on={it.running} aria-hidden="true"></span>
        <span class="name">{it.a.name}</span>
        <span class="segs" aria-hidden="true">{#each todoSegments(it.a.todos) as s, i (i)}<i class={s}></i>{/each}</span>
        <span class="frac">{it.done}/{it.total}</span>
      </button>
      {:else}
      <button
        class="ring-btn"
        class:running={it.running}
        onclick={() => todosStore.focusAgent(it.a.agentId)}
        title={it.a.name}
        aria-label={todosStore.t('agentStrip.label', { name: it.a.name, done: it.done, total: it.total })}
      >
        <span class="ring">
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r={R} class="track" />
            <circle cx="22" cy="22" r={R} class="arc" stroke-dasharray="{ringDash(it.done, it.total, C)} {C}" />
          </svg>
          <span class="type" data-agent-icon={agentIcon(it.a)}><Icon name={agentIcon(it.a)} size={16} /></span>
        </span>
        {#if it.running}<span class="live" aria-hidden="true"></span>{/if}
        <span class="name">{it.a.name}</span>
        <span class="frac">{it.done}/{it.total}</span>
      </button>
      {/if}
    {/each}
  </nav>
{/if}

<style>
  .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr)); gap: var(--sp-1); padding: 0 var(--sp-1) var(--sp-2); }
  .ring-btn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--sp-2) 2px; min-height: 44px; min-width: 0; border: 1px solid transparent; border-radius: var(--radius); background: none; color: var(--ct-muted); font: inherit; font-size: 0.85em; cursor: pointer; }
  .ring-btn:hover { background: var(--ct-hover); }
  .ring-btn:focus-visible { outline: 1px solid var(--ct-accent); }
  .ring-btn.running { color: var(--ct-fg); }
  .ring { position: relative; display: block; width: 2.6rem; height: 2.6rem; }
  svg { display: block; width: 100%; height: 100%; transform: rotate(-90deg); }
  .type { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .track { fill: none; stroke: var(--ct-track); stroke-width: 3; }
  .arc { fill: none; stroke: var(--ct-muted); stroke-width: 3; stroke-linecap: round; }
  /* Vivo = rodando agora: um anel parado nao pode ser o elemento mais chamativo. */
  .ring-btn.running .arc { stroke: var(--ct-run); }
  .live { position: absolute; top: calc(var(--sp-2) + 1.9rem); left: calc(50% + 0.75rem); width: 9px; height: 9px; border-radius: 50%; background: var(--ct-run); box-shadow: 0 0 0 2px var(--ct-surface); }
  /* Duas linhas: nomes com o mesmo comeco (explorador-a, explorador-b) truncados
     numa so ficariam iguais, e o anel e o unico jeito de achar o agente aqui. */
  .name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; max-width: 100%; overflow: hidden; overflow-wrap: anywhere; line-height: 1.2; text-align: center; }
  .frac { font-variant-numeric: tabular-nums; font-size: 0.85em; }
  .strip.leds { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--ct-border); border-radius: var(--radius); overflow: hidden; padding: 0; margin-bottom: var(--sp-2); }
  .led-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) 4.5rem 2.5rem; gap: var(--sp-2); align-items: center; min-height: 32px; padding: 0 var(--sp-2); border: none; border-top: 1px solid var(--ct-border); background: none; color: var(--ct-fg); font: inherit; font-size: 0.9em; text-align: left; cursor: pointer; }
  .led-row:first-child { border-top: none; }
  .led-row:hover { background: var(--ct-hover); }
  .led-row:focus-visible { outline: 1px solid var(--ct-accent); outline-offset: -1px; }
  .led-row .name { display: block; text-align: left; white-space: nowrap; text-overflow: ellipsis; }
  .led { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--ct-muted); }
  .led.on { background: var(--ct-run); box-shadow: 0 0 6px var(--ct-run); }
  .segs { display: flex; gap: 2px; }
  .segs i { flex: 1; height: 8px; background: var(--ct-track); }
  .segs i.done { background: var(--ct-ok); }
  .segs i.run { background: var(--ct-run); }
  .led-row .frac { font-family: var(--ct-mono); text-align: right; }
</style>
