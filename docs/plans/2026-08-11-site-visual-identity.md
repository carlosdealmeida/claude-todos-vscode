# Identidade visual da landing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à landing do site a identidade visual que a extensão já tem no marketplace, e acrescentar uma faixa de lojas com versão e avaliação lidas das APIs em tempo de build.

**Architecture:** A landing hoje não tem CSS próprio — herda `theme.css`, que existe para o painel *parecer um editor*. O redesign veste a página com a paleta da própria extensão (o `galleryBanner` e o coral do ícone), mantendo o painel embutido intocado, em 340px, com o tema de editor. Uma segunda task acrescenta a faixa de lojas, alimentada por três APIs públicas no build, com fallback versionado e refresh diário por cron.

**Tech Stack:** Astro 5, Svelte 5, Google Fonts (Newsreader, Inter, IBM Plex Mono), GitHub Actions.

**Design aprovado:** direção "mission control" com a paleta real da extensão, validada com o dono do projeto no companion visual em 2026-08-11.

## Global Constraints

- **A identidade sai da extensão, não é inventada:** fundo `#1F1B16` (o `galleryBanner` de `package.json`), coral `#E8622C` (o laranja de `media/icon.png`), coral suave `#D97757`. Verde `#89D185` e azul `#4DAAFC` só aparecem como estado (task concluída / agente rodando), como no painel.
- **O painel embutido não muda:** continua em **340px**, com o tema de editor de `site/src/demo/theme.css`. Ele precisa parecer um editor — é o produto. O redesign é da página em volta.
- **Não tocar em `src/webview/`.**
- **O texto continua vindo dos READMEs** (`site/scripts/extractLanding.mjs`). Nenhum copy novo mantido à mão em cinco idiomas.
- **Contraste WCAG AA obrigatório:** 4,5:1 para texto, 3:1 para elementos não-textuais. Medir, não estimar.
- `prefers-reduced-motion` respeitado em qualquer animação introduzida.
- Commits com prefixo convencional e escopo. Node 20+.
- **Verificação sem abrir navegador.** O dono da máquina usa o Chrome enquanto trabalhamos: não abrir, dirigir nem encerrar processos de navegador. Verificar por inspeção do HTML/CSS gerado e por medição programática.

---

## Task 1: Sistema visual da landing

**Files:**
- Create: `site/src/styles/landing.css`
- Modify: `site/src/layouts/LandingLayout.astro`, `site/scripts/extractLanding.mjs`
- Test: `tests/site/landingContrast.test.ts`, `tests/site/extractLanding.test.ts`

**Interfaces:**
- Consumes: `landing.json`, `Explorer.svelte`, `LangSwitcher.svelte`, `ThemeToggle.svelte`.
- Produces: tokens `--brand-*`, isolados dos tokens `--vscode-*` do painel.

- [ ] **Step 1: Escrever o teste de contraste que falha**

`tests/site/landingContrast.test.ts` lê os tokens de `site/src/styles/landing.css` e calcula a razão de contraste WCAG 2.x (luminância relativa com linearização sRGB correta). Pares obrigatórios:

| Par | Piso |
|---|---|
| `--brand-bone` sobre `--brand-bg` | 4,5:1 |
| `--brand-dim` sobre `--brand-bg` | 4,5:1 |
| `--brand-coral` sobre `--brand-bg` (eyebrow, links) | 4,5:1 |
| texto do botão sobre `--brand-coral` de fundo | 4,5:1 |
| `--brand-line` sobre `--brand-bg` | 3:1 |

Escreva-o antes de os valores finais existirem — é ele que valida a paleta.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/site/landingContrast.test.ts`
Expected: FAIL — o arquivo de estilos ainda não existe.

- [ ] **Step 3: Criar o sistema de tokens e o layout**

`site/src/styles/landing.css` define os tokens sob um seletor de escopo da página — **nunca `:root`**, para não vazar nos tokens do painel:

```
--brand-bg: #1F1B16;
--brand-bg-2: #17140F;
--brand-coral: #E8622C;
--brand-coral-soft: #D97757;
--brand-bone: #F2EDE4;
--brand-dim: (ajustar ate passar 4,5:1)
--brand-line: rgba(242,237,228,.11);
```

Se algum valor não passar no teste do Step 1, **ajuste o valor, não o teste**. O `--brand-dim` do mockup (`#9A9086`) é o candidato mais provável a precisar de ajuste.

Tipografia, via Google Fonts com stack de fallback declarada:
- Display: **Newsreader** 300, itálico no destaque.
- Corpo: **Inter** 400/500/600.
- Dados e rótulos: **IBM Plex Mono** 500, caixa alta com tracking `.19em` nos eyebrows.

Estrutura no `LandingLayout.astro`: topbar (marca com o SVG de `media/icon.svg` herdando coral por `currentColor`, seletor de idioma, toggle de tema, CTA) → hero em duas colunas (texto à esquerda, painel de 340px à direita) → swimlanes → features → privacidade → rodapé.

O H1 é o trecho em negrito da tagline e o lede é o resto — ver Step 4.

**Responsivo:** abaixo de ~900px o hero vira uma coluna e o painel desce. O painel **mantém 340px** e sua coluna rola horizontalmente se necessário; encolher distorce o produto.

- [ ] **Step 4: Separar tagline em título e lede no extrator**

`site/scripts/extractLanding.mjs` passa a devolver, além de `tagline`, os campos `title` (conteúdo do primeiro `**…**`) e `lede` (o restante, sem o travessão inicial). Mantenha `tagline` para não quebrar consumo existente. Acrescente testes cobrindo os cinco idiomas, inclusive que `title` nunca sai vazio.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/site/landingContrast.test.ts tests/site/extractLanding.test.ts` e `npm test`
Expected: PASS. Baseline anterior: 501 testes.

Run: `cd site && npm run prebuild && npm run build`

Confirme **sem abrir navegador**, inspecionando `site/dist/**/index.html`:
- os tokens `--brand-*` aparecem no CSS gerado e não colidem com `--vscode-*`;
- o painel continua com `width:340px`;
- as cinco rotas continuam gerando;
- `prefers-reduced-motion` continua presente.

- [ ] **Step 6: Commit**

```bash
git add site/src/styles/landing.css site/src/layouts/LandingLayout.astro site/scripts/extractLanding.mjs tests/site/
git commit -m "feat(site): identidade visual da landing a partir da marca da extensao"
```

---

## Task 2: Faixa de lojas com versão lida no build

**Files:**
- Create: `site/scripts/fetchStores.mjs`, `site/src/generated/stores.json`, `site/src/components/StoreRow.astro`, `.github/workflows/refresh-stores.yml`
- Modify: `site/package.json`, `site/src/layouts/LandingLayout.astro`, `site/src/i18n/site.ts`
- Test: `tests/site/stores.test.ts`

**Atenção:** `site/src/generated/` está hoje no `.gitignore` do site. O `stores.json` é o **fallback versionado** e precisa ser rastreado — ajuste o ignore para essa exceção, ou coloque o arquivo noutro diretório rastreado e documente a escolha.

**Endpoints verificados em 2026-08-11** (públicos, sem chave):

| Loja | Endpoint | Campos |
|---|---|---|
| VS Code | `POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`, header `Accept: application/json;api-version=7.2-preview.1`, body com `filterType:7`, `value:"CarlosJunior1992.claude-todos"`, `flags:914` | `versions[0].version`; `statistics[]` → `averagerating`, `ratingcount` |
| Open VSX | `GET https://open-vsx.org/api/CarlosJunior1992/claude-todos` | `version` |
| JetBrains | `GET https://plugins.jetbrains.com/api/plugins/33074/updates?size=1` | `[0].version` |

Valores observados: as três em `v0.17.0`; VS Code com rating `5` e `1` avaliação.

**Decisão do dono do projeto (2026-08-11): não exibir contadores de download.** As três lojas medem coisas diferentes (instalação única vs download bruto) e os números atuais não ajudam a página. A faixa mostra versão e avaliação.

- [ ] **Step 1: Escrever os testes que falham**

`tests/site/stores.test.ts`:
- `stores.json` conforma ao formato `{ fetchedAt, stores: { vscode, openvsx, jetbrains } }`;
- toda `version` casa `/^\d+\.\d+\.\d+$/`;
- `rating`, quando presente, entre 0 e 5, e `ratingCount` inteiro ≥ 0;
- **o fallback existe e é válido** — é o teste que garante que o build não depende da rede.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/site/stores.test.ts`
Expected: FAIL — `stores.json` ainda não existe.

- [ ] **Step 3: Escrever o buscador**

`site/scripts/fetchStores.mjs`, chamado no `prebuild`:
- consulta os três endpoints em paralelo, com timeout de 8s cada;
- **qualquer falha é não-fatal:** mantém o valor anterior daquela loja e imprime aviso nomeando loja e motivo;
- se as três falharem, mantém o arquivo inteiro e sai com código 0 — o build **nunca** quebra por indisponibilidade de terceiro;
- grava `fetchedAt`;
- **valida o formato antes de gravar:** resposta inesperada é tratada como falha, não escrita no arquivo. É o que impede uma mudança de contrato da API publicar lixo no site.

- [ ] **Step 4: Renderizar a faixa**

`site/src/components/StoreRow.astro` — três cartões: editores atendidos, nome da loja, versão em pílula coral, avaliação quando houver, seta de link. Quando as três versões coincidirem, exibir a linha "as três lojas na mesma versão"; quando divergirem, mostrar cada versão **sem** essa linha — divergência é informação legítima, não erro a esconder.

Os nomes de editores por loja saem de `site/src/i18n/site.ts`, nos cinco idiomas. Chinês segue `docs/i18n/glossary-zh.md`.

- [ ] **Step 5: Refresh diário**

`.github/workflows/refresh-stores.yml`: `schedule` diário (horário fora de pico, com a escolha comentada) mais `workflow_dispatch`. O job roda o buscador e **só commita se `stores.json` mudou** — nada de commit vazio diário. Um commit em `master` dispara o `pages.yml` existente, que republica. Permissões mínimas: `contents: write`.

- [ ] **Step 6: Verificar**

Run: `npx vitest run tests/site/stores.test.ts` e `npm test`

Run: `cd site && npm run prebuild` — confirme que busca e grava.

**Teste do caminho de falha — o mais importante desta task:** rode o `prebuild` com os três hosts inalcançáveis (por exemplo, um override de host que o script respeite, ou rede desligada) e confirme que o build conclui, que o aviso nomeia as lojas, e que `stores.json` mantém os valores anteriores. Registre a saída.

Valide o YAML objetivamente.

- [ ] **Step 7: Commit**

```bash
git add site/scripts/fetchStores.mjs site/src/generated/stores.json site/src/components/StoreRow.astro site/src/i18n/site.ts site/package.json .github/workflows/refresh-stores.yml tests/site/stores.test.ts
git commit -m "feat(site): faixa de lojas com versao lida das APIs no build"
```

---

## Verificação final

- [ ] `npm test` na raiz passa (baseline 501 mais os testes novos).
- [ ] `npm run typecheck` e `npm run check:svelte` limpos.
- [ ] `cd site && npm run prebuild && npm run build` gera as 5 rotas.
- [ ] Contraste medido e registrado para todos os pares da Task 1.
- [ ] O painel continua em 340px, com o tema de editor, em todas as rotas.
- [ ] `npx vsce ls` não lista nada de `site/` nem de `scripts/`.
- [ ] O build conclui com as três APIs fora do ar.
