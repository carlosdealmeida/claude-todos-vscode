# Roadmap

Documento vivo. Rastreia ideias de funcionalidades para a extensão **Claude Todos**, derivadas
de issues abertas no repositório oficial do Claude Code (`anthropics/claude-code`) que se
alinham ao que a extensão faz: ler os transcripts em `~/.claude/projects` e mostrar, ao vivo e
restrito ao workspace, a lista `TodoWrite` (main agent + sub-agents) e o uso de tokens.

> **Status legenda:** 🔍 a investigar · 📐 a planejar · 🚧 em andamento · ✅ entregue · ⏸️ adiado (aguardando gatilho) · ❄️ descartado
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

**Achadas na varredura 2026-07-16 (ainda sem comentário nosso):**

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#18456](https://github.com/anthropics/claude-code/issues/18456) | aberta, **134 reações** | VSCode Extension: Display context usage percentage in UI | Exatamente o item 2 (entregue 0.4.0). ✅ Comentado 2026-07-17 com disclosure. |
| [#73963](https://github.com/anthropics/claude-code/issues/73963) | aberta | Task list sidebar panel for session task visibility | Pedido = nosso painel, recém-aberta (2026-07-03). |
| [#24537](https://github.com/anthropics/claude-code/issues/24537) | aberta, 16 reações | Agent Hierarchy Dashboard — unified real-time visualization for multi-agent workflows | = nossa árvore de agentes (0.9.0) + dashboard (0.11.0). |
| [#22625](https://github.com/anthropics/claude-code/issues/22625) | `NOT_PLANNED` | Per-Subagent Token Usage Tracking | = item 6a (entregue). |
| [#54355](https://github.com/anthropics/claude-code/issues/54355) | `NOT_PLANNED` | CLI task list (Ctrl+T) should allow viewing all tasks, not just the top 5 | Nosso painel mostra todas. |
| [#57230](https://github.com/anthropics/claude-code/issues/57230) / [#26581](https://github.com/anthropics/claude-code/issues/26581) / [#29928](https://github.com/anthropics/claude-code/issues/29928) / [#8985](https://github.com/anthropics/claude-code/issues/8985) | abertas, 20–63 reações | Cluster: notificações nativas no VS Code ("needs attention" / "completed") | = item 14 (0.10.0); #8985 mostra que o hook `Notification` nem funciona no modo nativo — nosso notifier independe de hooks. |
| [#58243](https://github.com/anthropics/claude-code/issues/58243) | aberta | Agent view: sort by most recently updated | Já ordenamos por mtime DESC. |

---

## Alta aderência (candidatas fortes)

Implementáveis 100% do nosso lado, reaproveitando a infra atual (parser de transcript + tabela
de tokens do 0.3.0).

### 1. Todos clicáveis → pular para a mensagem de origem ✅ ENTREGUE (0.12.0)
- **Issue:** [#61543](https://github.com/anthropics/claude-code/issues/61543) — labels oficiais `area:ide`, `platform:vscode`, `area:ui`
- **Status:** ✅ entregue na 0.12.0. Spec: [docs/specs/2026-07-14-clickable-todos-design.md](specs/2026-07-14-clickable-todos-design.md) · plano: [docs/plans/2026-07-14-clickable-todos.md](plans/2026-07-14-clickable-todos.md). `sourceLine` (última transição de status) nos dois schemas; clique abre o `.jsonl` na linha. Viewer legível: spec futuro sobre a mesma infra.
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

### 4. Ordenar/filtrar todos por recência (evitar tasks fantasma) ✅ JÁ IMUNE
- **Issue:** [#59900](https://github.com/anthropics/claude-code/issues/59900) — labels `bug`, `area:tui`, `area:tools`
- **Status:** ✅ investigado (2026-07-15) — **estruturalmente imunes**, nenhuma mudança necessária.
- **Por quê:** (1) a seleção de sessão já ordena por mtime do transcript DESC
  ([snapshotService.ts:31](../src/services/snapshotService.ts#L31)) — exatamente a correção
  que a issue propõe; (2) nunca há merge de listas entre sessões — exibimos só o último
  snapshot `TodoWrite` da sessão escolhida ([todosParser.ts:440-459](../src/services/todosParser.ts#L440)),
  e o TodoWrite reescreve a lista inteira, sem resíduo.
- **Gap residual (por design, fora da issue):** sessão **fixada** (pin) não expira — uma
  sessão morta pinada segue mostrando `in_progress` até o usuário voltar para "Auto". É UX
  intencional; endurecer só se houver pedido.

### 5. Seletor de sessão melhor: vivas/ativas, atalhos, sem corte — (d)+(b) ✅ (0.13.0)
- **Issues:** [#28147](https://github.com/anthropics/claude-code/issues/28147) (`NOT_PLANNED`, `keybindings`) indicadores de atividade + atalhos · [#24435](https://github.com/anthropics/claude-code/issues/24435) (`NOT_PLANNED`) picker corta em ~8 sessões mais recentes · [#23275](https://github.com/anthropics/claude-code/issues/23275) (`NOT_PLANNED`) nomear sessões
- **Status:** fatias (d)+(b) ✅ entregues na 0.13.0. Restam (a) sessões vivas e (c) apelidos —
  📐 a planejar (investigado 2026-07-15).
- **Achados:**
  - **(b) não cortar lista:** ✅ já não cortamos — `listSessions()` não tem limite
    ([snapshotService.ts:19-33](../src/services/snapshotService.ts#L19)); o corte em ~8 é do
    picker nativo do Claude Code. **Entregue junto:** `BridgeFile.prune(30d)` agora é chamado
    no `activate` (era órfão) e virou no-op quando não há nada a remover (encolhe a janela do
    lost-update R1a).
  - **(d) atalho/comando para alternar sessão:** ✅ implementado — comando
    `claudeTodos.pickSession` registrado (Paleta) + keybinding `Ctrl+Alt+S` / `Cmd+Alt+S`;
    antes o picker só existia no botão do webview.
  - **(a) marcar sessões vivas:** esforço **médio** — `terminalPid` já é gravado no bridge mas
    nada checa liveness (`process.kill(pid, 0)` + cruzar `startedAt` contra PID reuse); expor
    `alive` no `SessionSummary` e usar ícone/`detail` no picker.
  - **(c) nomear sessões:** esforço **médio/alto** — não existe storage de alias; exigiria
    `globalState['sessionAliases']`, comando de rename e precedência alias > título derivado.
- **Ordem sugerida:** (d)+(b) como quick win → (a) → (c). (a) e (c) mexem nos mesmos pontos
  (`SessionSummary`/`resolveTitle`/`showSessionPicker`), fazer em sequência.
- **🔓 Destravado (varredura 2026-07-16):** o CLI agora mantém um **registro vivo de sessões**
  em `~/.claude/sessions/{pid}.json` — `{pid, sessionId, cwd, startedAt, version, kind,
  entrypoint, name, nameSource}` (verificado em disco, v2.1.211). Isso resolve (a) **e** (c) de
  uma vez: liveness real (arquivo por PID do próprio CLI, melhor que nosso `terminalPid`
  heurístico do bridge) e **nome de sessão real** (`name` + `nameSource: derived|user` — o CLI
  ganhou `/session-name`, [#2112](https://github.com/anthropics/claude-code/issues/2112)
  `COMPLETED`). Investigar: ciclo de vida do arquivo (é removido no exit?), e se
  `nameSource: "user"` aparece ao usar `/session-name`. Pode até substituir parte do bridge.

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

### 6. Tokens por sub-agent (sessão + semanal) ✅ ENTREGUE (6a: 0.9.0 · 6b: 0.13.0)
- **Issue:** [#59412](https://github.com/anthropics/claude-code/issues/59412) — labels `area:cost`, `area:agent-view`
- **Status:** ✅ completo — 6a coberto pelas 0.9.0/0.11.0; 6b entregue na 0.13.0.
- **6a — por sub-agent na sessão: ✅ resolvido.** A árvore (0.9.0) mostra o total por nó
  ([AgentTree.svelte:25](../src/webview/lib/AgentTree.svelte#L25)) e a `UsageTable` tem o
  toggle "por agente" com breakdown input/output/cache por modelo
  ([UsageTable.svelte:74-86](../src/webview/lib/UsageTable.svelte#L74)). A atribuição é
  correta: o main pula entradas `isSidechain`; sub-agents vêm dos próprios `agent-*.jsonl`
  ([usageParser.ts:98-128](../src/services/usageParser.ts#L98)).
- **6b — agregado semanal por tipo de agente: ✅ entregue (0.13.0).**
  `ProjectUsage.byAgentType` (baldes `main` / `agentType` do meta.json / `subagent` quando o
  meta falta, ordenados por total) somado no mesmo scan do dashboard; `agentType` memoizado
  junto do parse por arquivo. Toggle "por tipo de agente" na `ProjectUsageSection`, no padrão
  da `UsageTable`. Eixo por `agentType` (não por `agentId`, efêmero por sessão), como
  planejado.

### 7. Deep linking `vscode://` para abrir uma sessão/todo ⏸️ adiado
- **Issue:** [#10366](https://github.com/anthropics/claude-code/issues/10366) (`NOT_PLANNED`) — labels `area:core`, `area:ide`
- **Status:** ⏸️ investigado (2026-07-15) — **adiar, não descartar**: esforço baixo, mas zero
  consumidor hoje.
- **Achados:** não há `onUri`/`registerUriHandler` no código. A infra de destino já existe
  inteira: pin de sessão (`setPinnedSession` + os 5 passos do `showSessionPicker`,
  [extension.ts:130-150](../src/extension.ts#L130)) e `openTodoSource` da 0.12.0
  ([extension.ts:223-252](../src/extension.ts#L223), já com validação `SAFE_SESSION_ID` contra
  path traversal). Um handler `vscode://CarlosJunior1992.claude-todos/session/{id}` ou
  `/todo?session=X&agent=Y&line=Z` seria só parse + fan-out para essas funções.
- **Por que adiar:** todo consumo interno já usa comando in-process (o toast de notificação
  abre o painel via `executeCommand('claudeTodos.openPanel')`); o valor é exclusivamente para
  integração externa, que ainda não existe. Adicionar superfície de URI externo (input
  não-confiável) sem usuário contraria o princípio de privacidade. Reabrir quando surgir um
  consumidor concreto; nessa hora, extrair `selectSession(id)` compartilhado com o picker.

### 8. Visão global de histórico entre todos os projetos
- **Issue:** [#49095](https://github.com/anthropics/claude-code/issues/49095) (`NOT_PLANNED`) — labels `platform:vscode`, `area:ide`
- **Status:** 🔍 a investigar / ⚠️ **conflito de posicionamento a decidir**
- **Ideia:** aba/comando "Todos os projetos" agregando `~/.claude/projects/*/*.jsonl` com
  título, nome do projeto, timestamp e contagem de mensagens; busca/filtro.
- **Tensão:** vai **contra o princípio de escopo-por-workspace** que é o nosso diferencial de
  privacidade (duas janelas nunca veem os todos uma da outra). Se entrar, tem que ser opt-in
  explícito e bem isolado. Decidir posicionamento antes de planejar.

### 9. Multi-root: escolher a pasta ativa ✅ ENTREGUE (0.13.0)
- **Issues:** [#58044](https://github.com/anthropics/claude-code/issues/58044) sem como selecionar a pasta ativa · [#36949](https://github.com/anthropics/claude-code/issues/36949) setting `workingDirectory` · [#12808](https://github.com/anthropics/claude-code/issues/12808) (20c) "sempre começa na primeira pasta" · [#18814](https://github.com/anthropics/claude-code/issues/18814) (`NOT_PLANNED`)
- **Status:** ✅ entregue na 0.13.0. Spec:
  [docs/specs/2026-07-15-multi-root-design.md](specs/2026-07-15-multi-root-design.md) · plano:
  [docs/plans/2026-07-15-multi-root.md](plans/2026-07-15-multi-root.md). O painel segue a
  sessão mais ativa (mtime) entre **todas** as pastas do workspace; setting
  `claudeTodos.activeFolder` fixa uma pasta; picker desambigua com o basename da pasta;
  `openTodoSource` e o dashboard 7 dias resolvem a cwd pela sessão exibida. READMEs
  atualizados (limitação nº 1 removida).
- **Achados:** só **3 pontos** de produção dependem de `workspaceFolders[0]`, todos em
  `extension.ts` (callback do `SessionResolver` [L63-66](../src/extension.ts#L63), handler do
  `projectUsage` [L159-160](../src/extension.ts#L159), `openTodoSource` [L228](../src/extension.ts#L228)).
  Todo o resto já recebe `cwd` como parâmetro, e o hook grava no bridge a `cwd` **real** de
  cada sessão (vinda do Claude Code) — ou seja, sessões em subpastas de multi-root já são
  registradas corretamente; só a extensão não olha para elas.
- **Estratégia recomendada:** (a) detecção automática — resolver contra **todas** as pastas e
  seguir a de sessão com mtime mais recente (generalizar o callback + `SessionResolver` para
  multi-cwd) — **combinada com** (c) QuickPick de pasta como override explícito (reusa o padrão
  `showSessionPicker` + `workspaceState`, igual ao `pinnedSessionId`). (b) setting
  `claudeTodos.activeFolder` só como conveniência opcional. (d) agregar todas as pastas foi
  descartada: mexe no modelo de dados/webview e as issues pedem a pasta *ativa*, não a soma.
- **Risco a tratar:** oscilação da "pasta ativa" quando há sessões vivas em duas pastas —
  desempate estável por mtime do transcript.
- **Ao entregar:** atualizar [README.md:79](../README.md#L79) (limitação nº 1) e ampliar
  `tests/services/sessionResolver.test.ts` (único teste acoplado à assinatura do resolver).

---

## Apostas de produto — observability multi-agent (garimpo interno, 2026-07-11)

Diferente das seções acima (derivadas de issues), estes itens vêm de análise de produto: o
ecossistema está migrando de "um agente com todos" para **orquestração** (sub-agents em
background, workflows, agent teams), e os dados disso **já estão no disco** no formato que o
parser lê. Posicionamento-alvo: **"observability para seus agentes Claude Code"**.

> **Fila de brainstorming (prioridade):** 1º item 13 (árvore de agentes) · 2º item 14
> (notificações) · 3º item 15 (Open VSX). Os demais aguardam.

### 13. Árvore de agentes ao vivo ("mission control") ✅ ENTREGUE (0.9.0)
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
- **Status:** ✅ entregue na 0.9.0 — spec: [docs/specs/2026-07-11-agent-tree-design.md](specs/2026-07-11-agent-tree-design.md) · plano: [docs/plans/2026-07-11-agent-tree.md](plans/2026-07-11-agent-tree.md). Matching por `toolUseId` com fallback por prompt; agentes aninhados (`spawnDepth ≥ 2`) exibidos sob quem os disparou; badge de tipo + tokens por nó.

### 14. Notificações — sessão terminou / aguardando input ✅ ENTREGUE (0.10.0)
- **Origem:** dor nº 1 de sessões longas — o agente termina (ou fica parado numa pergunta) e o
  usuário só percebe minutos depois. Demanda comprovada: usuários montam pontes externas de
  notificação (WhatsApp, push) por fora.
- **Ideia:** toast nativo do VS Code quando (a) a sessão fica ociosa após atividade longa,
  (b) todas as tasks completam. Já detectamos `mtime` do transcript + estado das tasks; falta
  só a regra de disparo e o `window.showInformationMessage`. Opt-in via setting.
- **Custo/benefício:** baixíssimo custo, retenção altíssima.
- **Status:** ✅ entregue na 0.10.0 — spec: [docs/specs/2026-07-14-session-notifications-design.md](specs/2026-07-14-session-notifications-design.md) · plano: [docs/plans/2026-07-14-session-notifications.md](plans/2026-07-14-session-notifications.md). `SessionNotifier` puro (idle após ≥60s de atividade + 45s de silêncio; allComplete na transição), timer de 10s armado só em atividade, gate de setting+foco no disparo, toast com "Abrir painel"/"Não notificar".

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

### 16. Dashboard de uso/custo agregado (projeto/semana) ✅ ENTREGUE (0.11.0)
- **Origem:** o sucesso do `ccusage` (CLI que lê os mesmos JSONL) prova a demanda por visão
  agregada de tokens/custo.
- **Ideia:** aba/comando "esta semana neste projeto": N sessões, tokens por modelo, % de cache
  reaproveitado. Reaproveita o `usageParser` inteiro; o novo é a agregação multi-sessão.
- **Tensão:** mesma do item 8 — manter o escopo-por-workspace como default; agregado além do
  projeto atual só se for opt-in.
- **Status:** ✅ entregue na 0.11.0 — spec: [docs/specs/2026-07-14-project-usage-dashboard-design.md](specs/2026-07-14-project-usage-dashboard-design.md) · plano: [docs/plans/2026-07-14-project-usage.md](plans/2026-07-14-project-usage.md). Bloco "Últimos 7 dias · este projeto" colapsável no painel (N sessões, tokens por modelo, cache agregado), agregação lazy com memo por arquivo, protocolo dedicado sem tocar o snapshot.

### 17. Agent teams: dono por task 📐 gatilho atingido (2026-07-16)
- **Origem:** o schema `TaskCreate`/`TaskUpdate` que já suportamos é a fundação do modo teams
  (tasks com **owner**, agentes trocando mensagens via SendMessage).
- **Ideia:** quando o campo de owner aparecer nos transcripts, exibi-lo por task (avatar/nome
  do teammate). Deixa a extensão pronta para o hype de swarms antes de todo mundo.
- **Depende de:** observar transcripts reais de teams para cravar o formato.
- **🔓 Gatilho atingido (varredura 2026-07-16):** o schema **estabilizou e está em disco**:
  `~/.claude/teams/{team}/config.json` com `{name, description, leadAgentId, leadSessionId,
  members[]}`, cada membro com `agentId, name, agentType, model, cwd, tmuxPaneId, joinedAt`
  (verificado localmente — temos teams reais gravados, ex. `farol`). Teams viraram tema
  gigante no repo (~848 issues citando "agent teams"; pedidos de backends
  [#24122](https://github.com/anthropics/claude-code/issues/24122) 94r,
  [#24189](https://github.com/anthropics/claude-code/issues/24189) 71r,
  [#24384](https://github.com/anthropics/claude-code/issues/24384) 50r; custom agents como
  teammates [#24316](https://github.com/anthropics/claude-code/issues/24316) 43r). O
  `leadSessionId` liga o team à sessão que o painel já exibe. Promover a planejamento.

### 18. Onboarding walkthrough + reposicionamento do README ✅ ENTREGUE (0.14.0)
- **Ideia:** (a) walkthrough nativo do VS Code (`contributes.walkthroughs`) guiando a
  instalação do hook — reduz abandono de quem instala e não configura; (b) README reposicionado
  de "veja seus todos" para "observability dos seus agentes Claude Code" (árvore + tempos +
  tokens + custo), o termo que as pessoas vão buscar.
- **Status:** ✅ entregue na 0.14.0. Spec:
  [docs/specs/2026-07-16-onboarding-repositioning-design.md](specs/2026-07-16-onboarding-repositioning-design.md).
  (a) Walkthrough "Get started" de 5 passos (hook → sessão → painel → picker → árvore/dashboard),
  botões via `command:` e auto-complete via `onCommand:`, i18n ×3. (b) READMEs ×3 reescritos:
  tagline observability, seção "O que você vê", badges dinâmicos dos **dois** marketplaces,
  instalação por editor (VS Code / Cursor·Windsurf·VSCodium / `.vsix`), tabelas de
  comandos/settings completas; keywords + `extension.description` novos no manifesto.
  Pendência: conferência manual do walkthrough num Extension Development Host (F5).

### 19. Hint de lista defasada (main parado + sub-agent rodando) ✅ ENTREGUE (0.14.0)
- **Origem:** caso real (2026-07-14) — orquestrador criou a lista de 8 tasks, nunca mais
  chamou `TodoWrite` e delegou tudo a sub-agents; o painel mostrava fielmente "0/8, Task 1
  in_progress há 17min" enquanto os cards de sub-agents avançavam (Task 2 concluída, Task 3
  rodando). Parece bug do painel, mas é vício do agente — verificado contra o transcript
  (último TodoWrite na linha 433 de 466).
- **Ideia:** hint sutil no cabeçalho do main quando a lista está parada há N minutos
  **enquanto** algum sub-agent está `running` — ex.: "lista não atualizada há 17min" —
  sinalizando a defasagem sem esconder nem "corrigir" o dado (o painel continua espelho fiel).
- **Dados já disponíveis:** timestamp do último evento TodoWrite (o parser já varre; é expor)
  + status `running` dos sub-agents no snapshot.
- **Cuidado:** limiar generoso (ex.: ≥5min) e só com sub-agent ativo, para não virar ruído em
  sessões normais de task longa.
- **Status:** ✅ entregue na 0.14.0. Spec:
  [docs/specs/2026-07-16-stale-list-hint-design.md](specs/2026-07-16-stale-list-hint-design.md).
  `todosUpdatedAt` extraído do transcript (timestamp do último TodoWrite / maior timestamp de
  TaskCreate·TaskUpdate); `listStaleness` pura (main + ≥1 não-completed + sub-agent running +
  ≥5min); faixa sutil "lista sem atualização há X" sob o cabeçalho do main, tooltip
  explicativo, i18n ×3. Validado visualmente (3 casos).

### 20. Badge de modelo por agente (main + nós da árvore) ✅ implementado — aguardando release
- **Issues (varredura 2026-07-16):** [#28986](https://github.com/anthropics/claude-code/issues/28986)
  (**58 reações**, `platform:vscode`) mostrar modelo ativo no painel do VS Code ·
  [#76018](https://github.com/anthropics/claude-code/issues/76018) /
  [#77367](https://github.com/anthropics/claude-code/issues/77367) mostrar o modelo de cada
  sub-agent no painel de tasks · [#76607](https://github.com/anthropics/claude-code/issues/76607)
  painel nativo mostra o modelo **errado** (o do pai) para sub-agents ·
  [#62199](https://github.com/anthropics/claude-code/issues/62199) troca silenciosa de modelo
  sem aviso.
- **Ideia:** o `usageParser` já sabe os modelos por agente (breakdown por modelo existe na
  `UsageTable`); falta só um badge compacto no cabeçalho do main e em cada nó da árvore
  (ex.: `opus-4-8`, com o sufixo `[1m]` quando for o caso). Custo baixo, dado já parseado.
- **Bônus:** cobre a dor de "modelo trocou sem eu ver" (#62199) — o badge muda na hora.
- **Status:** ✅ implementado — aguardando release. Spec:
  [docs/specs/2026-07-17-model-badge-design.md](specs/2026-07-17-model-badge-design.md). Plano:
  [docs/plans/2026-07-17-model-badge-and-awaiting-input.md](plans/2026-07-17-model-badge-and-awaiting-input.md).
  `lastModel` por transcript (`AgentUsage.currentModel`), `shortModel` compatível com dados
  legados e `modelBadge` no webview — badge sempre no main, e nos sub-agents só quando o
  modelo difere do main. Validado visualmente via `preview-webview`.

### 21. Fontes de dados novas em `~/.claude` (tasks persistentes + dependências) 🔍 a investigar
- **Origem:** varredura 2026-07-16 + inspeção local do disco.
- **Achado 1 — task store persistente:** `~/.claude/tasks/session-{id8}/N.json` com
  `{id, subject, description, status, blocks, blockedBy}` (verificado localmente). É o backing
  do schema `TaskCreate`/`TaskUpdate` que já parseamos do transcript — mas com **dependências
  entre tasks** (`blocks`/`blockedBy`) que hoje não exibimos, e com **listas persistentes
  entre sessões** (`CLAUDE_CODE_TASK_LIST_ID`,
  [#78147](https://github.com/anthropics/claude-code/issues/78147) `data-loss`,
  [#76218](https://github.com/anthropics/claude-code/issues/76218) task store dessincroniza
  após crash + `--resume`).
- **Investigar:** (a) o transcript sozinho continua fonte suficiente, ou listas persistentes
  mutadas por outra sessão nos escapam? (b) exibir `blockedBy` como ícone/tooltip de
  dependência na lista; (c) o painel nativo tem bugs de dessincronização — nós podemos acertar.
- **Cuidado:** `.lock` presente no diretório — ler sem travar, read-only como sempre.

### 22. Notificação "aguardando sua resposta" (AskUserQuestion) ✅ implementado — aguardando release
- **Issues (varredura 2026-07-16):** [#57230](https://github.com/anthropics/claude-code/issues/57230)
  (20r) toasts nativos quando "Claude needs attention" ·
  [#26581](https://github.com/anthropics/claude-code/issues/26581) (27r) idem ·
  [#8985](https://github.com/anthropics/claude-code/issues/8985) (**63 reações**) hook
  `Notification` não dispara no modo nativo do VS Code.
- **Ideia:** estender o `SessionNotifier` (item 14) com um terceiro gatilho: `tool_use` de
  `AskUserQuestion` (e afins) **sem** `tool_result` subsequente no transcript ⇒ "Claude está
  esperando sua resposta". Hoje o idle-notifier cobre isso indiretamente (45s de silêncio);
  o gatilho explícito é mais rápido e com mensagem mais útil.
- **Custo:** baixo — parser já varre `tool_use`; é uma regra a mais no notifier + i18n.
- **Status:** ✅ implementado — aguardando release. Spec:
  [docs/specs/2026-07-17-awaiting-input-notification-design.md](specs/2026-07-17-awaiting-input-notification-design.md).
  Plano: [docs/plans/2026-07-17-model-badge-and-awaiting-input.md](plans/2026-07-17-model-badge-and-awaiting-input.md).
  `detectAwaitingInput(lines, skipSidechain)` no parser (tool_use sem tool_result subsequente),
  novo kind `awaitingInput` no `SessionNotifier` (transição imediata, idle suprimido com
  pendência), toast + i18n ×3. Verificado com transcript real do próprio repo: sobre o arquivo
  completo retorna `null`; truncado antes do `tool_result` do `AskUserQuestion`, retorna
  `'question'`.

### 23. Background tasks (shells) no painel 🔍 a investigar / posicionamento
- **Issues (varredura 2026-07-16):** [#75863](https://github.com/anthropics/claude-code/issues/75863)
  (`platform:vscode`, `area:agent-view`) pede painel de "Background Tasks" no VS Code (paridade
  com o desktop) · cluster grande de bugs do painel nativo travado em "Running"
  ([#67895](https://github.com/anthropics/claude-code/issues/67895),
  [#74950](https://github.com/anthropics/claude-code/issues/74950),
  [#66955](https://github.com/anthropics/claude-code/issues/66955),
  [#67293](https://github.com/anthropics/claude-code/issues/67293),
  [#74219](https://github.com/anthropics/claude-code/issues/74219) …) ·
  [#33310](https://github.com/anthropics/claude-code/issues/33310) contagem de bg tasks no
  statusline.
- **Ideia:** cards de shells em background (`run_in_background`) derivados do transcript
  (tool_use Bash + task-notifications), ao lado dos sub-agents na árvore. O painel nativo
  erra o estado com frequência; nosso modelo derivado-do-transcript tende a acertar.
- **Tensão:** amplia o escopo de "todos + agentes" para "tudo que roda" — avaliar se reforça
  ou dilui o posicionamento observability. Decidir antes de planejar.

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

### Varredura 2026-07-16 (ampla, por reações)

Segunda passada, exaustiva: 24 consultas temáticas via API de busca (aberto **e** fechado,
ordenado por reações — pega dores históricas que busca por palavra-chave perdeu), 624
candidatos únicos fora do ROADMAP, ~90 relevantes analisados. Script:
[docs/sweep_issues.py](sweep_issues.py) (reproduzível; queries por label `platform:vscode`/`area:agent-view`/
`area:cost`/`area:statusline` + títulos todo/task/subagent/teammate/session/transcript/
notification/sidebar/dashboard/workflow/observability/usage).

**Resultados:** 8 issues novas de validação (tabela no topo, destaque #18456 com 134 reações),
itens novos **20–23**, item 17 promovido (gatilho atingido), item 5(a)+(c) destravados por
`~/.claude/sessions/*.json`. Contexto do repo: ~2.000 issues novas/semana — próxima varredura
pode filtrar `created:>2026-07-16`.

**Temas varridos sem nada aplicável:** split-pane backends de teams (tmux/zellij/wezterm —
harness), billing/quota (sem dado local), MCP per-agent, diff review UI (#33932, fora do
nosso escopo de leitura de transcript), statusline JSON (não dependemos).

Anotar novos achados abaixo:

- [ ] _(adicionar aqui novas issues encontradas)_
