<script lang="ts">
  import type { TodoStatus } from '../../types';
  import { statusGlyph } from '../format';
  import { todosStore } from '../stores.svelte';

  let { status }: { status: TodoStatus } = $props();
</script>

{#if todosStore.traits.glyphs === 'text'}
  <span class="glyph {status === 'in_progress' ? 'in-progress' : status}" aria-label={todosStore.t(status === 'completed' ? 'status.completed' : status === 'in_progress' ? 'status.inProgress' : 'status.pending')}>{statusGlyph(status)}</span>
{:else if status === 'completed'}
  <svg class="icon completed" viewBox="0 0 16 16" aria-label={todosStore.t('status.completed')}>
    <path d="M3.5 8.5L7 12l6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
{:else if status === 'in_progress'}
  <svg class="icon in-progress" viewBox="0 0 16 16" aria-label={todosStore.t('status.inProgress')}>
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4">
      <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>
{:else}
  <svg class="icon pending" viewBox="0 0 16 16" aria-label={todosStore.t('status.pending')}>
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2.5" opacity="0.55"/>
  </svg>
{/if}

<style>
  .icon { width: 1rem; height: 1rem; flex-shrink: 0; }
  .completed { color: var(--ct-done); }
  .in-progress { color: var(--ct-run); }
  .pending { color: var(--ct-muted); }
  .glyph { flex-shrink: 0; font-family: var(--ct-mono); white-space: pre; font-size: 0.95em; }
  .glyph.in-progress { font-weight: 700; }
</style>
