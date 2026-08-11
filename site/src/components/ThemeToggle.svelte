<script lang="ts">
  import { onMount } from 'svelte';
  import type { Locale } from '../../../src/i18n/locale';
  import { SITE_STRINGS } from '../i18n/site';

  let { locale = 'en' as Locale }: { locale?: Locale } = $props();

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

  const strings = $derived(SITE_STRINGS[locale]);
  // O icone ja mostra o alvo do clique (sol = vai para claro, lua = vai para
  // escuro); o aria-label segue a mesma logica em vez de descrever o tema
  // atual.
  const label = $derived(theme === 'dark' ? strings.themeToggleToLight : strings.themeToggleToDark);
</script>

<button onclick={toggle} aria-label={label}>
  <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
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
