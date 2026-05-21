<script lang="ts">
  let ready = $state(false);
  $effect(() => { ready = true; });
</script>

<main>
  <h1>Claude Todos</h1>
  <p>{ready ? 'ready' : 'loading'}</p>
</main>

<style>
  main { padding: 1rem; color: var(--vscode-foreground); }
</style>
