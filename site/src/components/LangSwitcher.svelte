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
  /* Chrome da pagina (topbar), nao do painel: usa tokens --brand-*, nunca
     --vscode-* — o fundo da landing e sempre --brand-bg (nao clareia com o
     tema), mas --vscode-foreground/--vscode-descriptionForeground escurecem
     quando ThemeToggle alterna para claro. Isso fazia este seletor de idioma
     cair para ~1.53:1 (ativo) / ~3.17:1 (inativo) contra --brand-bg no tema
     claro. --brand-dim/--brand-bone contra --brand-bg tem piso >= 4.5:1
     travado em tests/site/landingContrast.test.ts. */
  .langs { display: flex; gap: 12px; }
  a { color: var(--brand-dim); text-decoration: none; }
  a[aria-current='page'] { color: var(--brand-bone); font-weight: 600; }
</style>
