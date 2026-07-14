# Roadmap

Documento vivo. Rastreia ideias de funcionalidades para a extensão **Claude Todos**, derivadas
de issues abertas no repositório oficial do Claude Code (`anthropics/claude-code`) que se
alinham ao que a extensão faz: ler os transcripts em `~/.claude/projects` e mostrar, ao vivo e
restrito ao workspace, a lista `TodoWrite` (main agent + sub-agents) e o uso de tokens.

> **Status legenda:** 🔍 a investigar · 📐 a planejar · 🚧 em andamento · ✅ entregue · ❄️ descartado
>
> Aderência = quão diretamente a extensão pode resolver a issue **do nosso lado**, sem depender
> de mudança no harness do Claude Code.

---

## Validação de mercado (já entregue pela extensão)

Issues que pedem exatamente o que a extensão já faz. Não são trabalho — servem de validação e
material para README/divulgação. Comentários já postados com disclosure de autoria.

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#59195](https://github.com/anthropics/claude-code/issues/59195) | aberta | Persistent Todo List panel in sidebar | Pedido = nosso painel. Comentado. |
| [#57019](https://github.com/anthropics/claude-code/issues/57019) | aberta | Show TodoWrite task list in Tasks panel | É sobre o desktop app; extensão é VSCode-only. Comentado com ressalva. |
| [#8723](https://github.com/anthropics/claude-code/issues/8723) | `NOT_PLANNED` | Persistent Task List / Plan View in VS Code Extension | Autor marcou **"Critical - Blocking"**; Anthropic fechou sem fazer. Forte validação do nicho. |
| [#31243](https://github.com/anthropics/claude-code/issues/31243) | `DUPLICATE` | Display TodoWrite task progress in the left sidebar panel | Mesma dor; cita "clicar no todo → rolar até a mensagem" (= #61543). |
| [#48741](https://github.com/anthropics/claude-code/issues/48741) | `DUPLICATE` | TodoWrite Todos Not Appearing in the Task Panel | Usuário esperava ver os todos num painel; pede equivalente ao `Ctrl+T`. |

---

## Alta aderência (candidatas fortes)

Implementáveis 100% do nosso lado, reaproveitando a infra atual (parser de transcript + tabela
de tokens do 0.3.0).

### 1. Todos clicáveis → pular para a mensagem de origem
- **Issue:** [#61543](https://github.com/anthropics/claude-code/issues/61543) — labels oficiais `area:ide`, `platform:vscode`, `area:ui`
- **Status:** 🚧 implementado — aguardando release 0.12.0. Spec: [docs/specs/2026-07-14-clickable-todos-design.md](specs/2026-07-14-clickable-todos-design.md) · plano: [docs/plans/2026-07-14-clickable-todos.md](plans/2026-07-14-clickable-todos.md). `sourceLine` (última transição de status) nos dois schemas; clique abre o `.jsonl` na linha. Viewer legível: spec futuro sobre a mesma infra.
- **Ideia:** ao percorrer o transcript buscando o último `TodoWrite`, guardar o `uuid`/índice da
  mensagem onde cada item apareceu ou mudou de status; tornar o item clicável → abre o `.jsonl`
  naquela posição.
- **Depende de:** entender como o parser hoje localiza e ordena os itens.
- **Extensão da ideia (2026-07-11):** combinar com um viewer simples de transcript (renderizar
  o `.jsonl` legível em vez de abrir o JSON cru) — transforma o painel de *monitor* em
  *navegador* da sessão.

### 2. Indicador de uso de contexto/token na barra ✅ ENTREGUE
- **Issue:** [#58159](https://github.com/anthropics/claude-code/issues/58159) — labels `platform:vscode`, `area:statusline`
- **Reforçada por:** [#516](https://github.com/anthropics/claude-code/issues/516) (`NOT_PLANNED`) "Always show available context percentage" — pedido antigo, nunca atendido.
- **Status:** ✅ entregue — badge "{pct}% ctx" + barra fina com semáforo (verde <60% / amarelo 60–85% / vermelho ≥85%) na `UsageTable`. Spec: [docs/specs/2026-06-03-context-usage-indicator-design.md](specs/2026-06-03-context-usage-indicator-design.md). Plano: [docs/plans/2026-06-03-context-usage-indicator.md](plans/2026-06-03-context-usage-indicator.md).
- **Como:** o parser extrai o tamanho do contexto da última mensagem do transcript principal (`input + cache`); limite 200k/1M detectado pelo modelo. Lógica de nível em `format.contextLevel`.
- **Melhoria futura (R-perf):** `usageParser` lê o transcript principal duas vezes (`modelsForFile` + `contextForFile`). Para transcripts grandes vale unificar numa passagem única. Conecta com o tema "performance de transcripts grandes" do backlog. 🔍 a avaliar.
- **Bug + melhoria futura (detecção de janela):** o limite 200k/1M é detectado por heurística (família `opus`/`sonnet` 4+ ou evidência observada), porque a janela exata **não** está no transcript nem nos hooks. A **única** fonte de verdade local é o `context_window.context_window_size` do **statusline JSON**, mas captá-lo exige registrar um statusline (barra visível na TUI + conflito com statusline existente). Registrado como **"statusline bridge (opt-in)"** — um comando explícito tipo *"Enable precise context"* — se algum usuário pedir precisão exata. 🔍 a avaliar.

### 3. Visibilidade de custo: cached vs uncached ✅ ENTREGUE (0.5.0)
- **Issue:** [#44779](https://github.com/anthropics/claude-code/issues/44779) — labels `area:cost`, `area:tui`, `area:statusline`
- **Status:** ✅ entregue como **indicador de eficiência de cache** — badge `{pct}% reaproveitado` + barra empilhada (read/creation/novo) + legenda + semáforo. Spec: [docs/specs/2026-06-04-cache-efficiency-and-window-detection-design.md](specs/2026-06-04-cache-efficiency-and-window-detection-design.md).
- **Escopo ajustado:** a parte "aviso por valor absoluto" do #44779 já ficou coberta pelo indicador de contexto (item 2, 0.4.0), que mostra a contagem absoluta + semáforo. O que entrou na 0.5.0 foi a separação cached/uncached como **eficiência de cache** (read reaproveitado vs creation vs input novo).
- **Junto (bugfix 0.5.0):** corrigida a detecção da janela 1M no indicador de contexto (o `100%/200k` falso para `opus-4-8` etc.) — ver nota no item 2.
- **Custo em $:** continua fora de escopo (tabela de preços envelhece). 🔍 só se pedirem.

### 4. Ordenar/filtrar todos por recência (evitar tasks fantasma)
- **Issue:** [#59900](https://github.com/anthropics/claude-code/issues/59900) — labels `bug`, `area:tui`, `area:tools`
- **Status:** 🔍 a investigar (verificar se já estamos imunes)
- **Ideia:** a sugestão (c) da issue — ordenar por `updatedAt DESC` em vez de `createdAt` — para
  não exibir `in_progress` fantasma de sessões antigas. Precisa checar como nosso parser escolhe
  e ordena os itens antes de cravar se é necessário.

### 5. Seletor de sessão melhor: vivas/ativas, atalhos, sem corte
- **Issues:** [#28147](https://github.com/anthropics/claude-code/issues/28147) (`NOT_PLANNED`, `keybindings`) indicadores de atividade + atalhos · [#24435](https://github.com/anthropics/claude-code/issues/24435) (`NOT_PLANNED`) picker corta em ~8 sessões mais recentes · [#23275](https://github.com/anthropics/claude-code/issues/23275) (`NOT_PLANNED`) nomear sessões
- **Status:** 🔍 a investigar
- **Ideia:** no nosso seletor de sessão (`pickSession`): marcar quais sessões estão **vivas/ativas**
  vs antigas (temos `bridgeFile` com `terminalPid`/`startedAt`); não cortar a lista; permitir
  nomear/apelidar sessões; atalho de teclado para alternar.
- **Sinergia:** o `bridgeFile` já sabe quais sessões pertencem à janela.

### 10. Mostrar o uso da sessão mesmo sem todos (painel "early") ✅ ENTREGUE (0.6.0)
- **Origem:** observação de uso — antes o painel só aparecia quando havia `TodoWrite`; sem todos, caía no `EmptyState`. Mas agora temos tokens/contexto/cache, que existem assim que a sessão tem qualquer atividade.
- **Status:** ✅ entregue — o bloco de uso (tabela de tokens + indicador de contexto + eficiência de cache) aparece assim que a sessão tem `usage`, independente de haver todos. No lugar da lista, um estado leve **"Sessão ativa — aguardando tasks"**. Desacopla "tem sessão" de "tem todo".
- **Como foi feito:**
  - [snapshotService.build()](../src/services/snapshotService.ts#L35) — quando `TodosParser.listForSession` retorna vazio, sintetiza o agente **main** (`agentId = sessionId`, `isMain: true`) só para alimentar o `usageParser`; a lista visível (`snapshot.agents`) continua vazia.
  - [App.svelte](../src/webview/App.svelte) — removida a condição `snapshot.agents.length === 0 → EmptyState`; agora o header + `UsageTable` aparecem sempre que há sessão, e a lista de agentes é trocada pelo bloco "aguardando tasks" quando vazia.
- **Sinergia:** reaproveitou 100% o que já foi entregue (0.3.0–0.5.0); foi só desacoplar a condição de exibição.

### 11. Tempo de execução nas tasks ✅ ENTREGUE (0.7.0)
- **Origem:** pedido de uso — ver o progresso/tempo de cada task no painel. O pedido inicial (barra de **%** por task) esbarrou numa restrição de dados: o transcript só tem `pending`/`in_progress`/`completed`, sem sub-progresso, então **% real por task é impossível**. Optou-se pela versão honesta: **tempo decorrido real** + estimativa do restante **rotulada**.
- **Status:** ✅ entregue — cada task `completed` mostra a duração; a `in_progress` mostra o tempo **ao vivo** (`⏱`, atualiza a cada 1s); o cabeçalho do agente mostra o **tempo total real** + `~{estimativa} restante (estimativa)`. Acompanhou um refinamento visual do painel (ícones SVG, status coloridos, cartões de métrica, theme-aware). Spec: [docs/specs/2026-06-12-task-timing-design.md](specs/2026-06-12-task-timing-design.md). Plano: [docs/plans/2026-06-12-task-timing.md](plans/2026-06-12-task-timing.md).
- **Como foi feito:**
  - [todosParser](../src/services/todosParser.ts) — `timestamp` no entry; deriva `startedAt`/`completedAt` por task nos dois schemas (TaskUpdate direto por `taskId`; TodoWrite varrendo a sequência de snapshots, casando por `content`), first-write-wins. Campos novos opcionais em `Todo`.
  - [format.ts](../src/webview/format.ts) — `formatDuration` e `summarizeTiming` (puros, testados); [clock.svelte.ts](../src/webview/clock.svelte.ts) — relógio compartilhado para o tempo ao vivo.
  - [TodoItem](../src/webview/lib/TodoItem.svelte) / [AgentSection](../src/webview/lib/AgentSection.svelte) — UI.
- **Sinergia:** reaproveita os `timestamp` que já existiam no transcript; degrada graciosamente quando ausentes.

### 12. i18n da UI da extensão ✅ ENTREGUE (0.8.0)
- **Origem:** inconsistência entre README trilíngue (pt/en/es) e UI monolíngue em português; demanda crescente por localização no ecossistema Claude Code ([#60914](https://github.com/anthropics/claude-code/issues/60914), [#64472](https://github.com/anthropics/claude-code/issues/64472), [#58688](https://github.com/anthropics/claude-code/issues/58688), [#35600](https://github.com/anthropics/claude-code/issues/35600) etc.).
- **Status:** ✅ entregue — idiomas **en** (base/fallback), **pt-br** e **es**. Segue o idioma de exibição do VS Code (`display language`) com override opcional via setting `claudeTodos.language`. Corrige a inconsistência pt/en anterior da UI.
- **Superfícies cobertas:**
  - **Webview** — todos os textos visíveis no painel (labels, estados vazios, mensagens de erro, unidades de tempo, legenda de cache).
  - **Runtime da extensão** — notificações, mensagens de quick pick, títulos de sessão e demais strings do processo da extensão.
  - **Manifesto** — títulos de comando e descrições de configuração via `package.nls.json` / `package.nls.pt-br.json` / `package.nls.es.json`.
- **Como foi feito:**
  - Catálogo de mensagens tipado compartilhado (sem dependência de `vscode`) com `createT` e fallback automático para `en`.
  - `resolveLocaleFrom` / `localeResolver` — normaliza o locale do VS Code e aplica o override do setting.
  - Listener de mudança de `display language` propaga o locale ao webview via `pushLocale`; store derivado no Svelte reage sem reload.
- **Caveat — Paleta de Comandos:** os títulos de comando exibidos na Paleta (`Ctrl+Shift+P`) seguem **exclusivamente** o idioma de exibição do VS Code; o override `claudeTodos.language` não os afeta. É uma limitação do VS Code: os `package.nls.*` são resolvidos na inicialização pelo host, sem acesso a settings da extensão.

### 6. Tokens por sub-agent (sessão + semanal)
- **Issue:** [#59412](https://github.com/anthropics/claude-code/issues/59412) — labels `area:cost`, `area:agent-view`
- **Status:** 🔍 a investigar
- **Ideia:** já mostramos tokens por modelo; estender para **por sub-agent** é natural. O
  "semanal" exigiria agregar várias sessões do mesmo projeto — escopo bem maior, possível fase 2.

### 7. Deep linking `vscode://` para abrir uma sessão/todo
- **Issue:** [#10366](https://github.com/anthropics/claude-code/issues/10366) (`NOT_PLANNED`) — labels `area:core`, `area:ide`
- **Status:** 🔍 a investigar
- **Ideia:** registrar um handler de URI (`vscode://CarlosJunior1992.claude-todos/session/{id}`)
  para abrir nosso painel já apontando para uma sessão específica. Sinergia forte com #61543
  (todos clicáveis): um todo poderia virar um link compartilhável/abrível.
- **Risco:** util principalmente para integração com ferramentas externas; valor isolado é menor.

### 8. Visão global de histórico entre todos os projetos
- **Issue:** [#49095](https://github.com/anthropics/claude-code/issues/49095) (`NOT_PLANNED`) — labels `platform:vscode`, `area:ide`
- **Status:** 🔍 a investigar / ⚠️ **conflito de posicionamento a decidir**
- **Ideia:** aba/comando "Todos os projetos" agregando `~/.claude/projects/*/*.jsonl` com
  título, nome do projeto, timestamp e contagem de mensagens; busca/filtro.
- **Tensão:** vai **contra o princípio de escopo-por-workspace** que é o nosso diferencial de
  privacidade (duas janelas nunca veem os todos uma da outra). Se entrar, tem que ser opt-in
  explícito e bem isolado. Decidir posicionamento antes de planejar.

### 9. Multi-root: escolher a pasta ativa
- **Issues:** [#58044](https://github.com/anthropics/claude-code/issues/58044) sem como selecionar a pasta ativa · [#36949](https://github.com/anthropics/claude-code/issues/36949) setting `workingDirectory` · [#12808](https://github.com/anthropics/claude-code/issues/12808) (20c) "sempre começa na primeira pasta" · [#18814](https://github.com/anthropics/claude-code/issues/18814) (`NOT_PLANNED`)
- **Status:** 🔍 a investigar
- **Ideia:** hoje, em workspace multi-root, usamos só a **primeira pasta** (limitação no README).
  Poderíamos detectar qual pasta tem sessão ativa e/ou oferecer um seletor/setting de pasta ativa.
  Endereça uma limitação real e ecoa um pedido popular (#12808 com 20 comentários).
- **Sinergia:** resolve a nossa "Limitação conhecida" nº 1.

---

## Apostas de produto — observability multi-agent (garimpo interno, 2026-07-11)

Diferente das seções acima (derivadas de issues), estes itens vêm de análise de produto: o
ecossistema está migrando de "um agente com todos" para **orquestração** (sub-agents em
background, workflows, agent teams), e os dados disso **já estão no disco** no formato que o
parser lê. Posicionamento-alvo: **"observability para seus agentes Claude Code"**.

> **Fila de brainstorming (prioridade):** 1º item 13 (árvore de agentes) · 2º item 14
> (notificações) · 3º item 15 (Open VSX). Os demais aguardam.

### 13. Árvore de agentes ao vivo ("mission control") 🚧 implementado — aguardando release 0.9.0
- **Origem:** descoberta de 2026-07-10 durante o debug do 0.8.2 — cada sub-agent agora tem um
  `agent-*.meta.json` ao lado do `.jsonl`, com `toolUseId`, `agentType` e `spawnDepth`.
- **Ideia:** exibir a sessão como árvore expansível — main → sub-agents → agentes aninhados
  (`spawnDepth` 2+) — com tipo do agente (Explore, Plan, general-purpose…), status, tasks e
  tokens por nó. Nenhuma outra extensão mostra isso; é a feature de GIF no README.
- **Passo 0 (ganho imediato):** migrar o matching invocação↔arquivo do heurístico por prompt
  exato para o vínculo **exato** via `toolUseId` do meta.json, com fallback pro matching atual
  em transcripts antigos. Elimina a heurística e ganha os agentes aninhados de graça (hoje
  `spawnDepth: 2` é descartado por design).
- **Sinergia:** resolve parcialmente o item 6 (tokens por sub-agent); fundação para workflows
  e agent teams (item 17).
- **Status (2026-07):** implementado — spec: [docs/specs/2026-07-11-agent-tree-design.md](specs/2026-07-11-agent-tree-design.md) · plano: [docs/plans/2026-07-11-agent-tree.md](plans/2026-07-11-agent-tree.md). Matching por `toolUseId` com fallback por prompt; agentes aninhados (`spawnDepth ≥ 2`) exibidos sob quem os disparou; badge de tipo + tokens por nó. Falta: release 0.9.0.

### 14. Notificações — sessão terminou / aguardando input 🚧 implementado — aguardando release 0.10.0
- **Origem:** dor nº 1 de sessões longas — o agente termina (ou fica parado numa pergunta) e o
  usuário só percebe minutos depois. Demanda comprovada: usuários montam pontes externas de
  notificação (WhatsApp, push) por fora.
- **Ideia:** toast nativo do VS Code quando (a) a sessão fica ociosa após atividade longa,
  (b) todas as tasks completam. Já detectamos `mtime` do transcript + estado das tasks; falta
  só a regra de disparo e o `window.showInformationMessage`. Opt-in via setting.
- **Custo/benefício:** baixíssimo custo, retenção altíssima.
- **Status (2026-07):** implementado — spec: [docs/specs/2026-07-14-session-notifications-design.md](specs/2026-07-14-session-notifications-design.md) · plano: [docs/plans/2026-07-14-session-notifications.md](plans/2026-07-14-session-notifications.md). `SessionNotifier` puro (idle após ≥60s de atividade + 45s de silêncio; allComplete na transição), timer de 10s armado só em atividade, gate de setting+foco no disparo, toast com "Abrir painel"/"Não notificar". Falta: release 0.10.0.

### 15. Publicar no Open VSX ✅ ENTREGUE (2026-07-14)
- **Origem:** Cursor, Windsurf e VSCodium não acessam o marketplace da Microsoft — e são
  exatamente o público que mais roda Claude Code no editor.
- **Status:** ✅ entregue — 0.10.0 publicada em
  [open-vsx.org/extension/CarlosJunior1992/claude-todos](https://open-vsx.org/extension/CarlosJunior1992/claude-todos).
  Passo "Publish to Open VSX" no `release.yml`, gated no secret `OVSX_PAT` (skip silencioso
  sem ele) — releases futuros publicam sozinhos. Badge + link de instalação nos 3 READMEs.
- **Pendência (cosmética):** o Open VSX mostra "unverified publisher" porque a conta
  `carlosdealmeida` publicou no namespace `CarlosJunior1992` sem ownership verificado.
  Resolver com uma issue de *namespace ownership* em
  [EclipseFdn/open-vsx.org](https://github.com/EclipseFdn/open-vsx.org/issues) — não afeta a
  instalação.

### 16. Dashboard de uso/custo agregado (projeto/semana) 🚧 implementado — aguardando release 0.11.0
- **Origem:** o sucesso do `ccusage` (CLI que lê os mesmos JSONL) prova a demanda por visão
  agregada de tokens/custo.
- **Ideia:** aba/comando "esta semana neste projeto": N sessões, tokens por modelo, % de cache
  reaproveitado. Reaproveita o `usageParser` inteiro; o novo é a agregação multi-sessão.
- **Tensão:** mesma do item 8 — manter o escopo-por-workspace como default; agregado além do
  projeto atual só se for opt-in.
- **Status (2026-07):** implementado — spec: [docs/specs/2026-07-14-project-usage-dashboard-design.md](specs/2026-07-14-project-usage-dashboard-design.md) · plano: [docs/plans/2026-07-14-project-usage.md](plans/2026-07-14-project-usage.md). Bloco "Últimos 7 dias · este projeto" colapsável no painel (N sessões, tokens por modelo, cache agregado), agregação lazy com memo por arquivo, protocolo dedicado sem tocar o snapshot. Falta: release 0.11.0.

### 17. Agent teams: dono por task 🔍 aguardar schema estabilizar
- **Origem:** o schema `TaskCreate`/`TaskUpdate` que já suportamos é a fundação do modo teams
  (tasks com **owner**, agentes trocando mensagens via SendMessage).
- **Ideia:** quando o campo de owner aparecer nos transcripts, exibi-lo por task (avatar/nome
  do teammate). Deixa a extensão pronta para o hype de swarms antes de todo mundo.
- **Depende de:** observar transcripts reais de teams para cravar o formato.

### 18. Onboarding walkthrough + reposicionamento do README 🔍 a investigar
- **Ideia:** (a) walkthrough nativo do VS Code (`contributes.walkthroughs`) guiando a
  instalação do hook — reduz abandono de quem instala e não configura; (b) README reposicionado
  de "veja seus todos" para "observability dos seus agentes Claude Code" (árvore + tempos +
  tokens + custo), o termo que as pessoas vão buscar.

---

## Robustez (riscos do nosso lado, não features)

### R1. Hooks no Windows — instalação e execução frágeis
- **Issues:** [#34457](https://github.com/anthropics/claude-code/issues/34457) (`NOT_PLANNED`) hooks com shell travam 5+ min no Windows · [#59622](https://github.com/anthropics/claude-code/issues/59622) `EEXIST` em `mkdir` não-idempotente de session-env · [#59072](https://github.com/anthropics/claude-code/issues/59072) hooks do `settings.json` silenciosamente não invocados no Windows
- **Status:** ✅ auditado e corrigido (parcial) — ver veredito abaixo.

**Veredito da auditoria** (`hookInstaller`, `sessionStart`, `bridgeFile`, `extension`):

| Bug | Nosso estado |
|---|---|
| #59622 `EEXIST` no `mkdir` | ✅ Já protegidos — todos os `mkdirSync` usam `{ recursive: true }` (idempotente). |
| #59072 path quebra no Windows | ✅ Baixo risco — comando é `node "${path}"` com aspas; espaços OK. Depende de `node` no `PATH` (documentado). |
| #34457 hook trava 5+ min | ⚠️→✅ **Corrigido** — `readStdin` não tinha timeout e penduraria se o stdin não fechasse. |

**Corrigido nesta passagem (TDD, +5 testes):**
- `readStream(stream, timeoutMs)` ([src/services/readStream.ts](../src/services/readStream.ts)) — lê o stdin com timeout de 2s; o hook nunca pendura. Usado no `sessionStart`.
- `atomicWriteFileSync` ([src/services/atomicWrite.ts](../src/services/atomicWrite.ts)) — escrita `tmp`+`rename`, atômica. Plugada em `hookInstaller.write` (protege o `settings.json` do usuário de corrupção), `bridgeFile.append`/`prune` e `sessionStart` (protegem o `sessions.json`).

**Pendência (fora do escopo desta passagem):**
- **R1a — lost-update concorrente no `sessions.json`.** A escrita atômica elimina *corrupção* (escrita parcial), mas não o *lost-update*: duas sessões iniciando quase ao mesmo tempo fazem read-modify-write e uma sobrescreve a outra → perde **uma detecção** de sessão (não corrompe). Exigiria file-lock ou append-only. Raro, impacto baixo. 🔍 a avaliar.

---

## Descartadas (não implementáveis na extensão)

São comportamentos do harness/CLI, fora do nosso alcance (lemos do transcript, não do hook).

| Issue | Motivo |
|---|---|
| [#56415](https://github.com/anthropics/claude-code/issues/56415) | Frequência do `system-reminder` do `TodoWrite` — comportamento do harness. |
| [#46465](https://github.com/anthropics/claude-code/issues/46465) | Fraseado do `system-reminder` — harness. |
| [#11008](https://github.com/anthropics/claude-code/issues/11008) | Expor tokens no payload do hook — não dependemos disso, lemos do transcript. |
| [#47045](https://github.com/anthropics/claude-code/issues/47045) | Tokens no payload do `SubagentStop` — idem. |
| [#64430](https://github.com/anthropics/claude-code/issues/64430) | Renomear sessão no painel **nativo** do VS Code — não é o nosso painel. |

---

## Backlog de investigação

Temas já varridos (aberto **e** fechado) em `anthropics/claude-code`:
`TodoWrite`, todo/task panel, token usage, cost/session, context indicator, vscode extension,
transcript viewer, subagent view, SessionStart hook, sidechain, multi-root, `/resume`/picker,
session naming, i18n, statusline quota.

### Varredura concluída

Garimpo inicial de `anthropics/claude-code` (aberto + fechado) **completo**. Resultados:

- **plan mode / ExitPlanMode** — varrido; só há issues sobre o *comportamento* do plan mode
  (enforcement, edits sem sair), tudo harness. **Nada aplicável** ao nosso painel.
- **performance de transcripts grandes** — varrido; nenhuma issue clara da comunidade. Mantemos
  como preocupação interna de engenharia, não derivada de issue. A varredura levou ao item **R1**
  (hooks no Windows), que é o risco concreto que apareceu.

Reabrir a varredura só quando surgir tema novo. Anotar novos achados abaixo:

- [ ] _(adicionar aqui novas issues encontradas)_
