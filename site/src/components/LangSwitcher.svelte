<script lang="ts">
  import type { Locale } from '../../../src/i18n/locale';

  let { current }: { current: Locale } = $props();

  // `pt-br` vira `/pt/` na URL; os demais usam o proprio codigo.
  const ROUTES: Record<Locale, string> = {
    en: '',
    'pt-br': 'pt',
    es: 'es',
    'zh-cn': 'zh-cn',
    'zh-tw': 'zh-tw',
  };

  const LABELS: Record<Locale, string> = {
    en: 'English',
    'pt-br': 'Português',
    es: 'Español',
    'zh-cn': '简体中文',
    'zh-tw': '繁體中文',
  };

  // import.meta.env.BASE_URL vem do astro.config (base: '/claude-todos-vscode')
  // sempre com barra final ('/claude-todos-vscode/'); removemos a barra final
  // aqui para montar os hrefs sem duplicar barra.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  function hrefFor(segment: string): string {
    return segment ? `${base}/${segment}/` : `${base}/`;
  }
</script>

<nav class="langs">
  {#each Object.entries(ROUTES) as [locale, segment] (locale)}
    <a href={hrefFor(segment)} aria-current={locale === current ? 'page' : undefined}>
      {LABELS[locale as Locale]}
    </a>
  {/each}
</nav>

<style>
  .langs { display: flex; gap: 12px; }
  a { color: var(--vscode-descriptionForeground); text-decoration: none; }
  a[aria-current='page'] { color: var(--vscode-foreground); font-weight: 600; }
</style>
