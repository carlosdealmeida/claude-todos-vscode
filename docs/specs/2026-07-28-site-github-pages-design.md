# Site do projeto no GitHub Pages, com demo interativo do painel — design

**Origem:** ideia de produto 2026-07-28. Objetivo declarado, em ordem: (1) deixar qualquer
pessoa **explorar as funcionalidades do painel sem instalar nada**, (2) servir de vitrine para
os três marketplaces, (3) hospedar a documentação já existente de forma navegável.

## Problema

A extensão é um produto **visual** — árvore de agentes, tasks transicionando ao vivo, semáforo
de contexto, barra de cache, dashboard — e hoje ela é apresentada por texto. O material visual
existente é de três arquivos em `screenshots/`, e o principal, `claude-todos-demo.gif`, é de
**2026-06-23**: anterior à árvore de agentes (0.9.0), ao dashboard de 7 dias (0.11.0), ao badge
de modelo (0.15.0) e ao chinês (0.17.0). A primeira impressão da extensão nos três marketplaces
é, portanto, uma versão que não existe mais.

O problema de fundo é estrutural: **mídia estática apodrece a cada release**. Screenshot e GIF
não são regerados, então o custo de mantê-los atualizados recai sobre disciplina humana e o
resultado previsível é o atual.

## Decisões

### 1. O demo é o produto real rodando, não uma gravação

O site executa o **mesmo bundle Svelte da extensão** (`src/webview/App.svelte`), alimentado por
fixtures. Não é vídeo, não é iframe do marketplace, não é reimplementação.

Consequência que motiva a decisão inteira: o demo **não pode apodrecer com o release**, porque
é compilado do mesmo código-fonte que a extensão publica. Uma mudança de UI aparece no site na
próxima build, sem ninguém regravar nada.

Alternativa descartada: montar componentes soltos com props, como faz a skill
`preview-webview` (`.claude/skills/preview-webview/`). Evitaria tocar em código de produção,
mas descarta o `App.svelte` — header, picker de sessão, dashboard, estados vazios — e criaria
um **segundo App para manter em paralelo**. O custo permanente supera o benefício pontual.

### 2. O site mora no mesmo repositório, em `site/`

Decorre de (1): o demo importa `App.svelte` de `src/webview/`. Repositório separado exigiria
publicar a webview como pacote npm versionado, criando um passo de release novo e uma janela de
defasagem entre extensão e site — exatamente o problema que (1) resolve.

```
claude-todos-vscode/
  src/webview/                    ← fonte única dos componentes (só bridge.ts muda)
  site/
    astro.config.mjs              ← base: '/claude-todos-vscode/'
    src/
      pages/
        index.astro               ← landing + demo (en, sem prefixo)
        [lang]/index.astro        ← pt · es · zh-cn · zh-tw
        [lang]/docs.astro
        changelog.astro           ← rota única, não localizada (ver decisão 9)
      components/
        Demo.svelte               ← island: monta App + controles do player
        FeatureList.svelte        ← bullets ↔ marcadores do roteiro
      demo/
        demoBridge.ts
        player.ts
        theme.css                 ← as 20 vars --vscode-*, dark + light
        scripts/*.json            ← fixtures gravadas
    scripts/
      importDocs.mjs              ← copia markdown da raiz + reescreve links
```

**Stack: Astro.** Svelte roda como island (o painel real vira componente da página, sem
iframe), markdown vira página nativamente e o i18n por rota é first-class — cobre as quatro
fatias sem gambiarra. VitePress foi descartado porque é Vue por baixo e o demo, que é a
prioridade nº 1, entraria por iframe ou mount manual. Vite + Svelte puro foi descartado porque
roteamento, i18n de páginas, markdown e sidebar sairiam todos na mão.

### 3. Terceiro caminho no `createBridge()` — a única mudança em produção

Hoje [`bridge.ts:44-46`](../../src/webview/bridge.ts#L44) tem dois caminhos e, num browser puro,
cai no JCEF. `createJcefBridge()` não falha ao ser criado, mas o `TodosStore` posta `ready` no
construtor ([`stores.svelte.ts:19`](../../src/webview/stores.svelte.ts#L19)) e
`window.__jcefPost` não existe fora do JetBrains → **TypeError no carregamento do módulo**.

```ts
interface DemoWindow { __claudeTodosDemo?: WebviewBridge }

export function createBridge(win: Window = window): WebviewBridge {
  const demo = (win as unknown as DemoWindow).__claudeTodosDemo;
  if (demo) return demo;                                   // site
  return typeof acquireVsCodeApi !== 'undefined'
    ? createVscodeBridge()
    : createJcefBridge();
}
```

O site injeta `window.__claudeTodosDemo` antes de montar o App. A variável nunca existe no VS
Code nem no JCEF, então os dois hosts reais seguem com comportamento idêntico ao atual. Coberto
por teste unitário nos três caminhos.

### 4. As fixtures são geradas pelo parser de produção

Script `npm run demo:record`, rodando em Node (onde `fs` existe): trunca progressivamente um
`.jsonl` real e chama [`SnapshotService.build()`](../../src/services/snapshotService.ts#L35) a
cada corte. Cada resultado vira um frame do roteiro.

Consequência: **as fixtures são, por construção, saídas legítimas do parser real.** O demo não
tem como mostrar um estado que a extensão não produziria.

```ts
interface DemoScript {
  id: 'smoke-test' | 'contexto-critico' | 'lista-defasada';
  recordedAt: number;
  durationMs: number;
  markers: { feature: FeatureId; atMs: number }[];
  frames:  { atMs: number; snapshot: SessionSnapshot }[];
  projectUsage: ProjectUsage;
}
```

**Origem dos dados: uma execução do `/smoke-test`** (`.claude/commands/smoke-test.md`) — main
mais `explorador-a`/`-b`/`-c` inspecionando o próprio repositório público. Cenário controlado,
reproduzível a cada release e **sem dado sensível por construção**: os paths, nomes de projeto
e conteúdo de tasks são todos deste repositório aberto. Nenhum scrub de anonimização é
necessário, e portanto nenhum scrub pode falhar.

Dois roteiros complementares são **encenados à mão**, para estados que uma sessão comum não
produz: `contexto-critico` (semáforo vermelho em 92% de janela, eficiência de cache) e
`lista-defasada` (o hint de lista parada da 0.14.0). Ambos são escritos como `SessionSnapshot`
válidos e passam pela mesma validação de tipos.

Capturar uma sessão de trabalho real com script de scrub foi descartado: seria mais rico, mas
um scrub incompleto vaza dado do autor num site público, e o ganho não justifica o risco.

### 5. O player reancora timestamps por frame

Cada `snapshot` é **estado completo**, não delta. Logo, exibir o instante `t` é achar o último
frame com `atMs <= t`; seek para trás é gratuito e idempotente. O player mantém
`{ playing, tMs, scriptId }` e expõe play/pause/seek/marcador.

**Reancoragem — sem ela o demo quebra sozinho com o tempo.**
[`clock.svelte.ts:4`](../../src/webview/clock.svelte.ts#L4) usa `Date.now()` real, e as durações
ao vivo comparam contra o `startedAt` do snapshot. Uma fixture gravada em julho, aberta em
setembro, exibiria "task em andamento há 47 dias".

Regra: ao entregar o frame do instante `t`, deslocar todo `startedAt`, `completedAt`,
`updatedAt` e `todosUpdatedAt` por `Date.now() − (recordedAt + t)`. Tocando a 1×, o relógio do
painel avança em sincronia naturalmente. **Com o player pausado**, o mesmo frame é re-emitido a
cada segundo com o deslocamento recalculado, o que congela os cronômetros em vez de deixá-los
correndo sobre uma cena parada.

A reancoragem é função pura (`reanchor(snapshot, deltaMs)`), testada isoladamente.

### 6. O demo responde ao painel — os botões reais funcionam

O `demoBridge` implementa `WebviewBridge` completo, tratando o que o painel envia:

| Mensagem do painel | Resposta do site |
|---|---|
| `ready` | inicia o roteiro selecionado |
| `refresh` | re-entrega o frame atual |
| `projectUsage` | devolve `script.projectUsage` → o dashboard de 7 dias abre de verdade |
| `openTodoSource` | abre painel lateral com o trecho do transcript de exemplo, linha destacada |
| `pickSession` | abre o seletor de cenário do site |
| `openPanel` | no-op (já está visível) |

As ações do painel viram, assim, a própria navegação do demo.

### 7. Navegação por feature, nos dois sentidos

A landing lista as sete features que o README já enumera em "O que você vê". Cada uma tem um
marcador no roteiro: clicar dá seek para o momento que a demonstra; enquanto o roteiro toca, a
feature correspondente fica destacada na lista.

### 8. Tema simulado, dark e light

Os componentes usam **20 variáveis `--vscode-*` distintas** em 9 arquivos, que não existem fora
do editor. `theme.css` as declara nas duas variantes. Quatorze delas já estão levantadas em
`.claude/skills/preview-webview/preview.html` (dark) e são o ponto de partida; o toggle
claro/escuro do site sai como subproduto.

### 9. O markdown do repositório é fonte única; o site apenas renderiza

Nenhum conteúdo textual novo é criado. `importDocs.mjs` copia os arquivos da raiz para dentro
do site em tempo de build e **reescreve os links relativos**:

| Link no markdown | Vira |
|---|---|
| `README.md`, `README.en.md`, `README.es.md`, `README.zh-cn.md`, `README.zh-tw.md` (28 ocorrências) | rota do site: `/pt/`, `/`, `/es/`, `/zh-cn/`, `/zh-tw/` |
| `screenshots/*` (10) | asset copiado para `public/` |
| `LICENSE` (10), `CONTRIBUTING*.md` (5), `docs/**` (2) | URL absoluta em `github.com/carlosdealmeida/claude-todos-vscode/blob/master/…` |

Cada README vira **uma página por idioma**, com sidebar gerada dos próprios cabeçalhos `##`.
Não há fragmentação em múltiplas páginas: exigiria anotar o markdown com marcadores de quebra,
e o README deixaria de ser fonte única limpa.

`CONTRIBUTING` e `SECURITY` apenas linkam para o GitHub — são documentos de contribuidor, não de
usuário.

`CHANGELOG.md` (187 linhas, formato Keep a Changelog) vira `/changelog`, **em inglês nos cinco
locales**: ele não é traduzido no repositório, e traduzi-lo criaria conteúdo novo para manter.

### 10. Cinco idiomas, com o demo incluído

Rotas: `/` (inglês, padrão), `/pt/`, `/es/`, `/zh-cn/`, `/zh-tw/`. Inglês é o padrão pelo
alcance — o público de Claude Code com VS Code é majoritariamente internacional e os três
marketplaces indexam em inglês. Detecção por `Accept-Language` foi descartada: prejudica SEO e,
como o GitHub Pages é estático, exigiria redirect client-side.

O painel já aceita a mensagem `locale`, então **o seletor de idioma do site troca o idioma do
demo junto**. Os cinco idiomas da UI deixam de ser uma bullet e passam a ser uma feature
demonstrável.

### 11. Deploy

Workflow `pages.yml`, disparado no push para `master`, publicando em
`carlosdealmeida.github.io/claude-todos-vscode/`. O `base` do Astro precisa refletir esse
subpath. As fixtures são versionadas no repositório — a build do site **não** depende de
`~/.claude` nem de nenhum estado da máquina.

## Fora de escopo

- **Roadmap público.** Pedido na conversa inicial e **cortado deliberadamente**:
  [`docs/ROADMAP.md`](../ROADMAP.md) é documento interno de estratégia, não de comunicação.
  Contém decisões sobre onde comentar e onde não comentar em issues da Anthropic (a linha 44
  registra literalmente um *"não comentar"*), análise de posicionamento competitivo e leitura
  de bugs de produtos de terceiros. Publicá-lo cru é constrangedor; publicá-lo curado quebra a
  fonte única e vira manutenção perpétua. Se um roadmap público for desejado depois, deve ser
  um documento escrito para leitor externo desde o início.
- **Upload de transcript do visitante.** Efeito alto, mas colide com o posicionamento de
  privacidade do README ("nada é enviado") mesmo sendo client-side puro, e depende de rodar os
  parsers no browser.
- **Rodar os parsers no browser.** Exigiria abstrair o I/O de seis serviços que hoje importam
  `fs` direto, mexendo no coração testado da extensão. A decisão 4 entrega o mesmo realismo
  gerando as fixtures com o parser real, offline.
- Busca nas docs (uma página por idioma — `Ctrl+F` basta), domínio próprio, blog.

## Riscos aceitos

1. **Traduções zh geradas por IA** (sem revisão nativa, item 12 do ROADMAP) ganham vitrine
   pública, onde antes estavam apenas no marketplace. Glossário em
   [`docs/i18n/glossary-zh.md`](../i18n/glossary-zh.md).
2. **Fixtures inchando o bundle** — sessões longas geram muitos frames. Mitigação: teto de
   **120 frames por roteiro**, com a gravação amostrando o `.jsonl` em intervalos uniformes
   quando o transcript excede isso. A 1 frame/s, cobre os ~2 min de roteiro previstos.
3. **`base` path** `/claude-todos-vscode/` quebra links absolutos escritos à mão.
4. **Reescrita de links** é a parte frágil da fatia 3; coberta por teste sobre as regras da
   tabela da decisão 9.

## Proteção contra apodrecimento

Teste no `vitest` validando cada fixture contra os tipos de `src/types.ts`. Se o schema do
snapshot mudar, **o CI quebra — não o site em produção**. É o que impede a fixture de virar a
nova versão do GIF de junho.

## Fatias de implementação

| # | Entrega | Depende de |
|---|---|---|
| 1 | Infra: esqueleto Astro, build, `pages.yml`, deploy funcionando | — |
| 2 | Demo: `createBridge` de 3 caminhos, `theme.css`, `demo:record`, player, navegação por feature | 1 |
| 3 | Docs: `importDocs.mjs`, reescrita de links, 5 idiomas, sidebar | 1 |
| 4 | Changelog renderizado | 3 |

## Oportunidade adjacente (não faz parte deste spec)

Com o player determinístico rodando o produto real, um passo de Playwright pode **gerar o GIF do
README automaticamente a cada release** — eliminando a causa-raiz descrita no Problema, e não só
o sintoma. Avaliar depois da fatia 2.
