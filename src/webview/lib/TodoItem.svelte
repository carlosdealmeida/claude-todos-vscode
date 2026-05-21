<script lang="ts">
  import type { Todo } from '../../types';
  import StatusIcon from './StatusIcon.svelte';

  let { todo }: { todo: Todo } = $props();

  let label = $derived(todo.status === 'in_progress' ? todo.activeForm : todo.content);
</script>

<li class="todo" class:completed={todo.status === 'completed'} class:in-progress={todo.status === 'in_progress'}>
  <StatusIcon status={todo.status} />
  <span class="label">{label}</span>
</li>

<style>
  .todo {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
    line-height: 1.4;
    transition: background 120ms ease;
  }
  .todo:hover { background: var(--vscode-list-hoverBackground); }
  .label { word-break: break-word; }
  .completed .label {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .in-progress .label {
    font-weight: 600;
    color: var(--vscode-progressBar-background, var(--vscode-foreground));
  }
</style>
