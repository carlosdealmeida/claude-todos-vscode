# Temas do painel — design

**Data:** 2026-11-02
**Status:** aprovado para planejamento
**Plano:** [docs/plans/2026-11-02-temas.md](../plans/2026-11-02-temas.md)
**Prévia visual:** canvas "Claude Todos — Temas" (5 temas, dark e light lado a lado)

## Problema

O painel herda 100% das cores do tema do editor. Isso é o que a maioria quer e continua sendo o padrão, mas não dá
nenhuma personalidade a quem quer outra. Hoje também não existe uma camada de tokens de verdade: `src/webview/app.css`
define 5 tokens de cor (`--accent`, `--ok`, `--run`, `--muted`, `--card-accent`), e os componentes usam
`var(--vscode-*)` diretamente em 94 referências (`App.svelte` e os 8 componentes de `lib/`). Qualquer tema, hoje, teria
que mexer em cada componente.

## Objetivo

Cinco temas selecionáveis, cada um com variante light e dark, nos três hosts que carregam a webview (VS Code, JetBrains
via JCEF, demo do site):

| Id | Nome | Paleta | Personalidade |
|---|---|---|---|
| `classic` | Clássico | herda do editor | o painel de hoje, **padrão**, pixel a pixel igual |
| `papel` | Papel | própria (creme / sépia) | calmo, espaçado, um único destaque, concluído perde cor em vez de ficar verde |
| `painel` | Painel | **derivada do editor** | azul por função (forte = consumo, vivo = rodando agora); verde/laranja/vermelho reservados a sucesso/alerta/erro; faixa de agentes em anéis, com o ícone do tipo do agente no centro |
| `terminal` | Terminal | própria (fósforo âmbar / formulário contínuo) | monoespaçado, status em texto `[x] [~] [ ]`, barras ASCII |
| `mission` | Mission Control | própria (azul-noite / cinza painel técnico) | denso, medidores no topo, agentes como linhas com LED e barra segmentada |

## Fora do escopo

- Trocar o tema padrão. `classic` continua o default, e nenhuma atualização muda o visual de quem não escolheu outro.
- Temas criados pelo usuário (cores livres em settings). Se houver demanda, os tokens `--ct-*` já são a API.
- Variante high contrast por tema (decisão 4).
- Mudar o modelo de interação do painel. Nenhum tema esconde informação que o Clássico mostra (decisão 6).

## Decisões

1. **Camada de tokens semânticos `--ct-*`.** Os componentes só usam `var(--ct-*)` (mais `--sp-*` e `--radius`, que
   não são cor). Os `--vscode-*` aparecem só em `src/webview/themes/tokens.css` (o mapeamento do Clássico, que é o
   `:root` padrão) e em `src/webview/themes/painel.css`. Um teste trava isso.
2. **A troca de tema é um atributo, não um rebuild.** `<html data-ct-theme="papel" data-ct-mode="light">`. Cada tema é
   um arquivo CSS com blocos `:root[data-ct-theme="x"][data-ct-mode="y"]` que redefinem os tokens. Todos os temas vão
   no mesmo bundle (o CSS dos quatro juntos fica abaixo de 15 KB).
3. **O modo (light/dark/hc) é detectado na webview, igual nos três hosts.** Ordem: classe do `body` que o VS Code
   injeta (`vscode-high-contrast*` → `hc`, `vscode-light` → `light`, `vscode-dark` → `dark`); senão
   `<html data-theme>` (demo do site); senão a luminância de `--vscode-foreground` (JetBrains: o `ThemeShim` injeta as
   vars, mas não a classe). O limiar da luminância é 0,18, o ponto em que o contraste com branco e com preto se iguala:
   o `#bbbbbb` do Darcula tem luminância 0,497, então um limiar de 0,5 o classificaria como claro. Luminância não
   revela alto contraste, então o plugin JetBrains põe a mesma classe `vscode-high-contrast` do VS Code no `body` quando
   o tema do IDE é de alto contraste. Um
   `MutationObserver` reavalia quando o editor troca de tema em tempo de execução. A mensagem `{ type: 'theme' }` que
   existe em `src/types.ts` nunca foi usada por nenhum host e sai.
4. **High contrast sempre usa o Clássico.** Quem usa HC precisa do contraste que o editor garante; os temas com
   paleta própria não oferecem isso. `effectiveTheme(choice, 'hc')` devolve `classic`. A escolha salva não muda; vale
   de novo quando o editor sair do HC.
5. **A escolha é do host, não da webview.** VS Code: setting `claudeTodos.theme` (enum, escopo de aplicação, como no
   JetBrains: um valor de workspace venceria o que o comando grava, e a escolha pareceria não funcionar) e comando
   `Claude Todos: Choose Theme` com prévia ao vivo (QuickPick; cancelar volta ao tema salvo). JetBrains: valor em
   `PropertiesComponent` (nível de aplicação) e ação "Tema…" no título do tool window; a troca avisa todas as janelas
   de projeto abertas pelo message bus. O host manda `{ type: 'appearance', theme }` no `ready` e a cada mudança. Valor
   desconhecido (por exemplo, um tema que uma versão futura removeu) vira `classic`. No VS Code, o HTML da webview já
   nasce com `data-ct-theme` e é regravado ao esconder a sidebar, para ela não piscar outro tema a cada reabertura.
6. **Os temas mudam a aparência, não o que é mostrado.** Painel e Mission Control ganham elementos *adicionais* (a
   faixa de agentes e os medidores), mas a árvore de agentes, os todos, a tabela de uso, as perguntas pendentes e o
   uso do projeto continuam todos lá. Clicar num anel/LED rola até o card do agente e o expande; não esconde os
   outros. No print original do Painel, o card mostrava só o agente selecionado. Decidido em 2026-11-02: esse comportamento
   fica fora, porque é uma feature, não um tema; vira uma task separada se for pedido.
7. **Traços por tema (`ThemeTraits`), só os que CSS não resolve.** Quatro: `glyphs` (`svg` | `text`), `meter`
   (`bar` | `ascii`), `agentStrip` (`none` | `rings` | `leds`), `usageSummary` (`none` | `gauges`). Cada traço entra
   na fase do primeiro tema que precisa dele, não antes.
8. **O Painel deriva as cores do editor.** "Azul vivo" em texto = `--vscode-textLink-foreground`, porque a cor de
   "rodando agora" também pinta texto e o `focusBorder` de alguns temas não foi feito para isso. A reserva é
   `--vscode-charts-blue`: o `ThemeShim` não define `textLink`, e o `focusBorder` dele é a cor de foco do IDE, com 1,64:1
   sobre o fundo no Darcula e no IntelliJ Light. Em tintas de fundo, `--vscode-focusBorder`; a faixa do agente ativo e o
   `--ct-accent`, que pinta o contorno de foco, usam o azul vivo, porque alguns temas zeram o `focusBorder` e eles
   sumiriam. "Azul forte" =
   `--vscode-button-background`, que pinta as barras de uso em nível normal por `--ct-meter-ok`; trilhas = `color-mix` do
   foreground com o fundo. Assim ele funciona com qualquer tema do editor (Dracula, One Dark, Light Modern) sem paleta
   própria, e o light não precisa de hex à parte.
9. **Contraste é testado, não julgado no olho.** Para os temas com paleta própria, um teste lê os tokens de cada bloco
   e exige WCAG 2.x: texto principal ≥ 7:1, texto secundário ≥ 4.5:1, cores de status sobre o fundo ≥ 3:1. Se um par
   falha, quem muda é a cor, nunca o piso (a mesma regra de `tests/site/landingContrast.test.ts`). Outro teste exige
   que esses temas redefinam todo token que, no Clássico, vem direto de `--vscode-*`: nenhuma cor do editor vaza para
   uma paleta própria.
10. **Regressão visual é provada por imagem, em todos os temas.** Antes de migrar qualquer token, um script gera
    screenshots do painel (Playwright + Chromium, dados fixos, dark e light) em vários estados: o frame real da demo e
    casos sintéticos com perguntas pendentes, limites de uso, rodapé da ponte, níveis de alerta, uso do projeto aberto e
    estados vazios. Depois da migração, as imagens do Clássico precisam ser idênticas byte a byte. Elas só mudam por
    correção explícita e revista pixel a pixel, como o singular de "1 ativa" na v0.23.0, que regravou 8 imagens.
    Cada outro tema grava o próprio baseline na task que o cria e, a partir daí, também é comparado a cada mudança, com
    8 estados × 2 modos × 5 temas = 80 imagens no fim. Outro tema só muda de propósito, regravando o baseline dele. Hover
    e foco ficam fora da prova: para eles, a garantia é a migração mecânica da tabela de tokens.
11. **Três versões.** v0.21.0: fundação, Clássico, Papel e seleção nos dois hosts. v0.22.0: Painel e Terminal (traços
    `glyphs`, `meter`, `agentStrip: rings`). v0.23.0: Mission Control (`usageSummary`, `agentStrip: leds`) e o seletor
    de tema na demo do site.
12. **Fundo, cor de texto e fonte do tema são aplicados em `.ct-root`, a classe do `<main>` do painel.** Nunca só em
    `:root` ou `body`. O VS Code injeta `body { color: var(--vscode-editor-foreground); font-family: … }` em toda
    webview, e o site tem `.landing` com cor e tipografia próprias: em ambos, o que está no `:root` não chega ao texto
    herdado. A mesma camada do VS Code pinta a barra de rolagem e o `<code>`, então a regra também cobre os dois. Ela
    exclui o Clássico, cujo texto herdado hoje é o `editor-foreground` e precisa continuar sendo. O
    `<main>` é também quem rola, então as faixas do Terminal rolam junto com o conteúdo (`background-attachment: local`).

## Riscos

- **Regressão visual silenciosa do Clássico** na migração das 94 referências: coberta pela decisão 10.
- **Clássico fora do harness:** o `ThemeShim` não define `--vscode-textLink-foreground`, e o tema do site define. Um
  fallback perdido na migração só apareceria no JetBrains. Por isso `--ct-link` mantém o fallback em `--ct-accent`, e a
  migração confere todos os fallbacks antes de rodar.
- **Site perde tokens:** o site monta `App.svelte` direto e carrega `app.css`; os temas entram por `@import` no topo de
  `app.css`, e `tests/site/cssTokens.test.ts` já varre `src/webview/**/*.css`.
- **JetBrains sem classe de modo:** coberto pela luminância (decisão 3); `ThemeShim` já garante que
  `--vscode-foreground` nunca sai vazia.
- **Fonte monoespaçada no Terminal:** a CSP da webview não permite fontes externas. O tema usa
  `--vscode-editor-font-family` (a fonte de código do próprio usuário), o que é até melhor.
- **Lista de temas duplicada no Kotlin:** como `LocaleResolver.kt`, é cópia manual. Um teste Kotlin compara a lista
  com `package.json` (`contributes.configuration…claudeTodos.theme.enum`).
