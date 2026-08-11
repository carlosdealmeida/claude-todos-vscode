import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tests/site/*.test.ts importam modulos de site/src/demo/. Ao transformar
  // esses arquivos, o Vite procura o tsconfig.json mais proximo — encontra
  // site/tsconfig.json, que faz `extends: "astro/tsconfigs/strict"`. O job
  // de teste da extensao roda `npm ci` so na raiz (site/node_modules nao
  // existe), entao esse preset do Astro nunca resolve e a coleta desses
  // arquivos falha inteira (veja o job "Test & build" do ci.yml).
  //
  // esbuild.tsconfigRaw, quando e uma STRING, faz o Vite pular de vez a
  // busca por tsconfig.json (vite/dist/node/chunks/config.js, checagem
  // `typeof tsconfigRaw !== 'string'` em transformWithEsbuild) — os testes
  // param de depender de qualquer tsconfig.json em disco. O unico campo
  // "significativo" (dos que o esbuild realmente le do tsconfig) que a raiz
  // definia era `target`; replicamos aqui para manter o comportamento atual.
  esbuild: {
    tsconfigRaw: JSON.stringify({ compilerOptions: { target: 'ES2022' } }),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
