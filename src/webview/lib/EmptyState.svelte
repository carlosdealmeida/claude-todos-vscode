<script lang="ts">
  let { reason }: { reason: 'no-workspace' | 'no-session' | 'hook-missing' } = $props();
</script>

<div class="empty">
  {#if reason === 'no-workspace'}
    <h3>No workspace open</h3>
    <p>Open a folder to track Claude Code sessions in this workspace.</p>
  {:else if reason === 'hook-missing'}
    <h3>Session hook not installed</h3>
    <p>Run the command <code>Claude Todos: Install Session Hook</code> to enable tracking.</p>
  {:else}
    <h3>Waiting for a Claude Code session</h3>
    <p>Run <code>claude</code> in this workspace and your todos will appear here.</p>
  {/if}
</div>

<style>
  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
  h3 { font-size: 1rem; margin-bottom: 0.5rem; }
  code {
    background: var(--vscode-textBlockQuote-background);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
  }
</style>
