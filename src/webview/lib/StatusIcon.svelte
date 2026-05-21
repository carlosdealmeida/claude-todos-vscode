<script lang="ts">
  import type { TodoStatus } from '../../types';

  let { status }: { status: TodoStatus } = $props();
</script>

{#if status === 'completed'}
  <svg class="icon completed" viewBox="0 0 16 16" aria-label="completed">
    <path d="M3.5 8.5L7 12l6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
{:else if status === 'in_progress'}
  <svg class="icon in-progress" viewBox="0 0 16 16" aria-label="in progress">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4">
      <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>
{:else}
  <svg class="icon pending" viewBox="0 0 16 16" aria-label="pending">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  </svg>
{/if}

<style>
  .icon { width: 1rem; height: 1rem; flex-shrink: 0; }
  .completed { color: var(--vscode-testing-iconPassed, #4caf50); }
  .in-progress { color: var(--vscode-progressBar-background, #0e70c0); }
  .pending { color: var(--vscode-foreground); }
</style>
