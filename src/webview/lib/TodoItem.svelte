<script lang="ts">
  import type { Todo } from '../../types';
  import StatusIcon from './StatusIcon.svelte';
  import Icon from './Icon.svelte';
  import { formatDuration } from '../format';
  import { clock } from '../clock.svelte';
  import { todosStore } from '../stores.svelte';

  let { todo, completedMs, sessionId, agentId }:
    { todo: Todo; completedMs?: number; sessionId: string; agentId: string } = $props();

  let label = $derived(todo.status === 'in_progress' ? todo.activeForm : todo.content);
  let clickable = $derived(todo.sourceLine !== undefined);

  let duration = $derived.by(() => {
    if (todo.status === 'in_progress' && todo.startedAt !== undefined) {
      return { live: true, text: formatDuration(clock.now - todo.startedAt) };
    }
    if (todo.status === 'completed' && completedMs !== undefined) {
      return { live: false, text: completedMs < 1000 ? '<1s' : formatDuration(completedMs) };
    }
    return null;
  });

  function open(): void {
    if (todo.sourceLine !== undefined) {
      todosStore.openTodoSource(sessionId, agentId, todo.sourceLine);
    }
  }
</script>

{#snippet inner()}
  <StatusIcon status={todo.status} />
  <span class="label">{label}</span>
  {#if duration}
    <span class="duration" class:live={duration.live}>
      {#if duration.live}<Icon name="clock" size={12} />{/if}
      {duration.text}
    </span>
  {/if}
{/snippet}

<li class="todo" class:completed={todo.status === 'completed'} class:in-progress={todo.status === 'in_progress'}>
  {#if clickable}
    <button class="hit" onclick={open} title={todosStore.t('todo.openSource')}>
      {@render inner()}
    </button>
  {:else}
    {@render inner()}
  {/if}
</li>

<style>
  .todo {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    padding: 0.35rem var(--sp-2);
    border-radius: 5px;
    line-height: 1.4;
    transition: background 120ms ease;
  }
  .todo:hover { background: var(--vscode-list-hoverBackground); }
  /* Botão invisível que envolve o conteúdo quando a task é clicável — herda o
     layout do li e só acrescenta o cursor. */
  .hit {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .todo.in-progress {
    background: color-mix(in srgb, var(--run) 15%, transparent);
  }
  /* Faixa de destaque pulsante no item ativo (desligada por reduced-motion). */
  .todo.in-progress::before {
    content: '';
    position: absolute;
    left: 0;
    top: 3px;
    bottom: 3px;
    width: 3px;
    border-radius: 3px;
    background: var(--run);
    animation: pulse-bar 1.8s ease-in-out infinite;
  }
  @keyframes pulse-bar {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  .label { word-break: break-word; flex: 1; }
  .duration {
    flex: none;
    align-self: flex-start;
    margin-left: var(--sp-2);
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.82em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--muted);
  }
  .duration.live {
    color: var(--run);
    font-weight: 600;
  }
  .completed .label {
    text-decoration: line-through;
    opacity: 0.55;
  }
  .in-progress .label {
    font-weight: 600;
    color: var(--run, var(--vscode-foreground));
  }
</style>
