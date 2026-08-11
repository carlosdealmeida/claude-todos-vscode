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
    // apply() nao pode depender de conseguir persistir: em Safari modo
    // privado (ou storage bloqueado por politica), setItem lanca, e sem
    // isso o icone trocaria sem o tema real acompanhar.
    apply();
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Falha em salvar degrada para "tema muda mas nao persiste" — nunca
      // para "botao mente sobre o tema aplicado".
    }
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
