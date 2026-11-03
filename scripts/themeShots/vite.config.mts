import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import * as path from 'path';

export default defineConfig({
  plugins: [svelte()],
  root: __dirname,
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../../dist-shots'),
    emptyOutDir: true,
    target: 'es2022',
  },
});
