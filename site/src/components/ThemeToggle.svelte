<script lang="ts">
  import { onMount } from 'svelte';

  const KEY = 'claude-todos-theme';
  let theme = $state<'dark' | 'light'>('dark');

  onMount(() => {
    // O script inline no <head> do layout ja aplicou data-theme antes da
    // primeira pintura (evita flash de tema errado); aqui so sincronizamos
    // o estado local do botao com o que foi aplicado.
    const applied = document.documentElement.dataset.theme;
    if (applied === 'light' || applied === 'dark') theme = applied;
  });

  function apply(): void {
    document.documentElement.dataset.theme = theme;
  }

  function toggle(): void {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, theme);
    apply();
  }
</script>

<button onclick={toggle} aria-label="Toggle color theme">
  {theme === 'dark' ? '☀' : '☾'}
</button>

<style>
  button {
    background: none;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    color: var(--vscode-foreground);
    cursor: pointer;
    font: inherit;
    padding: 4px 10px;
  }
</style>
