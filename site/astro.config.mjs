import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://carlosdealmeida.github.io',
  base: '/claude-todos-vscode',
  integrations: [svelte()],
  vite: {
    server: {
      // O site importa componentes de ../src/webview, fora da raiz do Astro.
      fs: { allow: ['..'] },
    },
  },
});
