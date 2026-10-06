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

> ## 🔥 Mudança de cenário — Claude Code 2.1.233 (publicada 2026-08-14)
>
> **`TodoWrite` e `TaskCreate/Get/Update/List` foram desligadas por padrão** para Opus 4.8,
> Sonnet 5, Fable 5, Mythos 5 e modelos mais novos
> ([CHANGELOG 2.1.233](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)); só
> voltam com `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. O mantenedor confirmou em [#86929](https://github.com/anthropics/claude-code/issues/86929) que é
> **intencional** (*"intended today, not a bug"*). Verificado no disco local em 2026-09-05: nos
> últimos 30 dias `TodoWrite` aparece em transcripts gravados até a **2.1.232** e em **nenhum** a
> partir da 2.1.233. A matéria-prima da lista de tasks **sumiu do fluxo padrão**; árvore de
> agentes, tokens/contexto, notificações, perguntas pendentes e badge de modelo **não** são
> afetados. Evidência, mitigação e plano em **R2** (promovido de ⚠️ monitorar para 🔥
> **prioridade máxima**).

> ## 🧭 Mudança de cenário — "agent map" na extensão VS Code oficial (2.1.269 → 2.1.287)
>
> Entre 2026-09-11 e 2026-10-01 a extensão oficial ganhou, em sequência: **agent map** (pill
> "N agents" no rodapé → cards por sub-agent, Stop, transcript read-only — 2.1.269), linhas de
> progresso de sub-agent no Focus view (2.1.269), shells e tarefas em background no mapa com
> `/tasks` (2.1.278), timestamps por mensagem (2.1.284, opt-in), rótulo de modelo do sub-agent
> corrigido no mapa (2.1.285), Stop por agente e linha **Questions** com as perguntas já
> respondidas (2.1.286) e a saída de shells/Monitors nos cards (2.1.287). Isso sobrepõe boa
> parte dos itens **13** (árvore), **23** (background), **1** (viewer) e, em parte, **22-ext**
> (perguntas). O que segue só nosso, com evidência da varredura 2026-10-04: contexto **sempre
> visível** com semáforo (o oficial fica escondido até 50%, [#93036](https://github.com/anthropics/claude-code/issues/93036)), modelo **por nó** (o
> oficial ainda erra ou esconde, [#97634](https://github.com/anthropics/claude-code/issues/97634)/[#97588](https://github.com/anthropics/claude-code/issues/97588)), árvore aninhada correta ([#98118](https://github.com/anthropics/claude-code/issues/98118)), lista
> `Task*` ([#95227](https://github.com/anthropics/claude-code/issues/95227)), sessões abertas no terminal, JetBrains, dashboard 7 dias e contabilidade
> deduplicada (R5). Torna o **passo 3 do R2** (posicionamento) a decisão mais urgente da fila.
> Detalhes na varredura 2026-10-04, no fim do documento.

## Validação de mercado (já entregue pela extensão)

Issues que pedem exatamente o que a extensão já faz. Não são trabalho — servem de validação e
material para README/divulgação. Comentários já postados com disclosure de autoria.

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#59195](https://github.com/anthropics/claude-code/issues/59195) | `NOT_PLANNED` 2026-07-07 (travada) | Persistent Todo List panel in sidebar | Pedido = nosso painel. Comentado. Estado corrigido na varredura 2026-10-04 (constava como aberta). |
| [#57019](https://github.com/anthropics/claude-code/issues/57019) | aberta | Show TodoWrite task list in Tasks panel | É sobre o desktop app; extensão é VSCode-only. Comentado com ressalva. |
| [#8723](https://github.com/anthropics/claude-code/issues/8723) | `NOT_PLANNED` | Persistent Task List / Plan View in VS Code Extension | Autor marcou **"Critical - Blocking"**; Anthropic fechou sem fazer. Forte validação do nicho. |
| [#31243](https://github.com/anthropics/claude-code/issues/31243) | `DUPLICATE` | Display TodoWrite task progress in the left sidebar panel | Mesma dor; cita "clicar no todo → rolar até a mensagem" (= #61543). |
| [#48741](https://github.com/anthropics/claude-code/issues/48741) | `DUPLICATE` | TodoWrite Todos Not Appearing in the Task Panel | Usuário esperava ver os todos num painel; pede equivalente ao `Ctrl+T`. |

**Achadas na varredura 2026-07-16 (ainda sem comentário nosso):**

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#18456](https://github.com/anthropics/claude-code/issues/18456) | `COMPLETED` 2026-08-17, **160 reações** | VSCode Extension: Display context usage percentage in UI | Exatamente o item 2 (entregue 0.4.0). ✅ Comentado 2026-07-17 com disclosure. **Fechada como entregue** pela Anthropic: a extensão oficial ganhou indicador de contexto no prompt box — sem semáforo/threshold (o próprio comentário oficial admite que ainda não existem), e usuários ainda reportavam não ver em 18/08. O semáforo 60/85 + barra seguem nosso diferencial. |
| [#73963](https://github.com/anthropics/claude-code/issues/73963) | `NOT_PLANNED` 2026-08-26 | Task list sidebar panel for session task visibility | Pedido = nosso painel, aberta em 2026-07-03; fechada sem fazer. |
| [#24537](https://github.com/anthropics/claude-code/issues/24537) | aberta, 16 reações | Agent Hierarchy Dashboard — unified real-time visualization for multi-agent workflows | = nossa árvore de agentes (0.9.0) + dashboard (0.11.0). |
| [#22625](https://github.com/anthropics/claude-code/issues/22625) | `NOT_PLANNED` | Per-Subagent Token Usage Tracking | = item 6a (entregue). |
| [#54355](https://github.com/anthropics/claude-code/issues/54355) | `NOT_PLANNED` | CLI task list (Ctrl+T) should allow viewing all tasks, not just the top 5 | Nosso painel mostra todas. |
| [#57230](https://github.com/anthropics/claude-code/issues/57230) / [#26581](https://github.com/anthropics/claude-code/issues/26581) / [#29928](https://github.com/anthropics/claude-code/issues/29928) / [#8985](https://github.com/anthropics/claude-code/issues/8985) | abertas, 20–63 reações | Cluster: notificações nativas no VS Code ("needs attention" / "completed") | = item 14 (0.10.0); #8985 mostra que o hook `Notification` nem funciona no modo nativo — nosso notifier independe de hooks. |
| [#58243](https://github.com/anthropics/claude-code/issues/58243) | aberta | Agent view: sort by most recently updated | Já ordenamos por mtime DESC. |

**Achadas na varredura 2026-07-25 (ainda sem comentário nosso):**

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#78327](https://github.com/anthropics/claude-code/issues/78327) / [#78324](https://github.com/anthropics/claude-code/issues/78324) / [#78555](https://github.com/anthropics/claude-code/issues/78555) | 2 `COMPLETED`, 1 aberta | Localização (l10n) da UI da extensão VS Code | = item 12, entregue na 0.8.0 (en/pt-br/es). Três pedidos independentes em 2 dias. **Não comentar:** pedem l10n da extensão *da Anthropic* (diálogos de permissão dela) — a nossa ser trilíngue não resolve a dor. |
| [#79881](https://github.com/anthropics/claude-code/issues/79881) / [#80110](https://github.com/anthropics/claude-code/issues/80110) / [#79362](https://github.com/anthropics/claude-code/issues/79362) | #79881 `COMPLETED` 2026-08-20 · 2 abertas | Hook `Notification` não dispara na extensão VS Code (permission_prompt / idle_prompt) | Reforçam #8985 (63 reações). Nosso notifier (itens 14 e 22) **não depende de hook**. ⚠️ Cobrimos só a metade `idle_prompt` — prompts de permissão não chegam ao transcript. ✅ #79881 comentado 2026-07-27 (com a limitação explícita) — **fechada pela Anthropic em 2026-08-20: hook corrigido na 2.1.233** para Desktop e VS Code (o argumento "nosso notifier independe de hook" perde força; ver item 22); #80110 e #79362 são **exclusivamente** permission prompt → **não comentar**. |
| [#79155](https://github.com/anthropics/claude-code/issues/79155) | fechada 2026-08-17 ("já disponível") | Indicador **persistente** de uso de contexto (não só o aviso perto do limite) | = item 2, entregue na 0.4.0. ✅ Comentado 2026-07-27. **Fechada por bcherny**: "já dá via statusline (`context_window.used_percentage`)" — resposta oficial ao pedido; nosso diferencial passa a ser o semáforo + barra **no painel**, não a existência do indicador. |
| [#81039](https://github.com/anthropics/claude-code/issues/81039) | aberta | Desktop sub-reporta a janela de contexto — `/context` mostra denominador de 200.0K em sessão que passa disso | Valida que a detecção de janela é dor real, e não só nossa (ver item 2). |
| [#78745](https://github.com/anthropics/claude-code/issues/78745) / [#78747](https://github.com/anthropics/claude-code/issues/78747) | abertas | Expor tokens restantes como env var pro statusline | Nós já mostramos sem depender do harness. |
| [#78595](https://github.com/anthropics/claude-code/issues/78595) | aberta | Extensão VS Code: indicadores de status na lista de sessões + notificação quando sessão em background termina | = item 14 (entregue) + 5(a) (**não** entregue: seguimos uma sessão por vez). ✅ Comentado 2026-07-27 com os dois limites. |
| [#78960](https://github.com/anthropics/claude-code/issues/78960) | `COMPLETED` | Sidebar mostra "Running" para sessão já concluída | Cluster de estado errado no painel nativo; nosso modelo é derivado do transcript. |
| [#79281](https://github.com/anthropics/claude-code/issues/79281) | aberta | Agents view: marcar a sessão main e usar cor para manter o paralelo legível | = nossa árvore (0.9.0) com badge de tipo colorido. **Não comentar:** é a agents view do **TUI**, outra superfície. |
| [#78692](https://github.com/anthropics/claude-code/issues/78692) | aberta | Sidebar do desktop deveria mostrar **todas** as sessões de `~/.claude/projects/` | Munição para a decisão de posicionamento do item 8. |

**Achadas na varredura 2026-08-10 (ainda sem comentário nosso):**

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#83289](https://github.com/anthropics/claude-code/issues/83289) / [#83512](https://github.com/anthropics/claude-code/issues/83512) | abertas | statusLine ignora o sub-agent focado — sempre reporta a sessão main | = nossa `UsageTable` por agente (item 6a): mostramos contexto/tokens de cada nó da árvore. |
| [#82215](https://github.com/anthropics/claude-code/issues/82215) | aberta | Desktop: painel de uso mostra só tokens absolutos, sem % nem limite | = item 2 (0.4.0): %, limite e semáforo. |
| [#83181](https://github.com/anthropics/claude-code/issues/83181) / [#84705](https://github.com/anthropics/claude-code/issues/84705) | abertas | Tokens/custo de **todos** os agentes do workflow, não só o orquestrador; notificação de conclusão com split de tokens + modelo resolvido | = itens 6a e 20, entregues. |
| [#82766](https://github.com/anthropics/claude-code/issues/82766) | aberta | Badge de modelo do sidebar VS Code mostra Haiku com `/model` em Sonnet 5 | **Quarto** caso de modelo errado no painel nativo (ver item 20). |
| [#84028](https://github.com/anthropics/claude-code/issues/84028) | aberta | CLI e mobile reportam modelos **diferentes** para a mesma sessão viva | Idem item 20 — nosso badge lê o transcript do agente. |
| [#81801](https://github.com/anthropics/claude-code/issues/81801) | aberta | Expor usage/rate-limit nas extensões de IDE (VS Code / JetBrains) | Metade usage já entregue nas **duas** superfícies (0.16.0); rate-limit não tem dado local (fora de escopo, como billing). |
| [#84368](https://github.com/anthropics/claude-code/issues/84368) | aberta | Pin de sessões no sidebar de histórico | Temos pin desde o início. Superfície = desktop → **não comentar**. |
| [#82603](https://github.com/anthropics/claude-code/issues/82603) | aberta | Título auto-gerado sai em russo para sessão ucraniana | Valida a decisão do item 5(c) de **ignorar** `nameSource: "derived"` e manter nosso título semântico. |

**Achadas na varredura 2026-09-05 (ainda sem comentário nosso):**

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#87081](https://github.com/anthropics/claude-code/issues/87081) | `COMPLETED` | Dashboard de tasks do modo Auto mostra a **mesma lista** em projetos diferentes (não escopado ao cwd) | Nosso painel é **escopado ao workspace** por design — validação do princípio de privacidade. |
| [#90708](https://github.com/anthropics/claude-code/issues/90708) / [#91075](https://github.com/anthropics/claude-code/issues/91075) / [#91232](https://github.com/anthropics/claude-code/issues/91232) | abertas, 5/3/2 reações | Desktop: indicador de contexto **removido** do rodapé (virou anel de uso do plano), troca silenciosa de significado, sem aviso antes do auto-compact | = item 2 (0.4.0): %, barra e semáforo 60/85. Superfície = desktop → **não comentar**; material de divulgação. |
| [#86834](https://github.com/anthropics/claude-code/issues/86834) / [#87605](https://github.com/anthropics/claude-code/issues/87605) / [#89133](https://github.com/anthropics/claude-code/issues/89133) / [#90246](https://github.com/anthropics/claude-code/issues/90246) | 3 abertas, 1 `DUPLICATE` | Modelo do sub-agent errado ou ausente nas task rows, notificações e agent view | 7º a 10º casos (item 20). Nosso badge lê o transcript do agente. |
| [#87053](https://github.com/anthropics/claude-code/issues/87053) | aberta, **52 relatos consolidados**, `area:ide` | Prompts não-intrusivos — parar de roubar o foco durante a digitação | Toast e faixa de pergunta pendente (itens 14/22) **não roubam foco**. |
| [#86082](https://github.com/anthropics/claude-code/issues/86082) | aberta | Agent view sem indicador "needs input, sleeping" | = `awaitingInput` do item 22, por nó da árvore. |
| [#88621](https://github.com/anthropics/claude-code/issues/88621) / [#88622](https://github.com/anthropics/claude-code/issues/88622) | abertas | Desktop: sub-agent concluído mostra "No output captured" **com o transcript no disco**; pede a atividade do sub-agent no painel | = árvore (13) + clique-para-transcript (1). Superfície desktop → **não comentar**. |
| [#87716](https://github.com/anthropics/claude-code/issues/87716) | aberta | `subagentStatusLine` nunca recebe teammates in-process | = item 6a (tokens por nó, sem depender do statusline). |
| [#88510](https://github.com/anthropics/claude-code/issues/88510) | `COMPLETED` | Cache hit rate no JSON do statusline | = item 3 (0.5.0). |
| [#88199](https://github.com/anthropics/claude-code/issues/88199) | aberta | Seção de pins do sidebar enche e não pode ser limpa | **Nosso gap residual** (pin não expira, item 4) é a mesma dor — rever a UX de despin. |
| [#88224](https://github.com/anthropics/claude-code/issues/88224) / [#87840](https://github.com/anthropics/claude-code/issues/87840) | abertas, 1/4 reações | Ordenação manual da lista de sessões | Nosso picker ordena por mtime — ver o risco #87900 em R3. |
| [#85726](https://github.com/anthropics/claude-code/issues/85726) | aberta, `platform:vscode` | Deep link `/open?session=…&target=sidebar` na extensão oficial | Segundo sinal para o item 7 (adiado por falta de consumidor). |
| [#86259](https://github.com/anthropics/claude-code/issues/86259) | aberta | Mostrar o cwd de cada sessão no sidebar | O escopo por workspace resolve por construção. |
| [#89049](https://github.com/anthropics/claude-code/issues/89049) | aberta | Expor o registry de ferramentas para detectar mudança de disponibilidade — cita a **2.1.233** como exemplo | Pede exatamente a detecção que o R2 precisa fazer do lado de fora. |

**Achadas na varredura 2026-10-04 (ainda sem comentário nosso):**

| Issue | Estado | Título | Nota |
|---|---|---|---|
| [#93036](https://github.com/anthropics/claude-code/issues/93036) | aberta, 3 reações, 4 comentários, `platform:vscode` | Indicador de contexto da extensão VS Code fica **escondido até 50%**; pede threshold configurável | = item 2 (0.4.0): o nosso é sempre visível, com semáforo 60/85. Os comentários de 09-20 a 10-01 em [#18456](https://github.com/anthropics/claude-code/issues/18456) dizem o mesmo (um relata que o indicador parou de atualizar no meio da sessão). Candidata a comentário com disclosure — superfície = extensão VS Code. |
| [#95227](https://github.com/anthropics/claude-code/issues/95227) | aberta | Webview VS Code não renderiza a família `Task*` (painel de progresso vazio; só as linhas cruas de `TaskCreate`/`TaskUpdate`) | = nosso painel (lista de tasks nos dois schemas). Candidata a comentário com disclosure. |
| [#97634](https://github.com/anthropics/claude-code/issues/97634) / [#97588](https://github.com/anthropics/claude-code/issues/97588) / [#97473](https://github.com/anthropics/claude-code/issues/97473) / [#95823](https://github.com/anthropics/claude-code/issues/95823) / [#94575](https://github.com/anthropics/claude-code/issues/94575) / [#93324](https://github.com/anthropics/claude-code/issues/93324) | abertas | Modelo do sub-agent errado ou invisível (`/tasks`, transcript view, extensão VS Code, agent view) | 11º a 16º casos (item 20). #97634: na 2.1.283 **nenhum** lugar da UI do terminal mostra o modelo do sub-agent. |
| [#98118](https://github.com/anthropics/claude-code/issues/98118) | aberta, `platform:vscode` | Agent map oficial: sub-agents aninhados com "Tool calls (0)" e pendurados no main em vez do pai real | Nossa árvore (13) liga pelo `toolUseId` do meta.json e acerta o pai. |
| [#96382](https://github.com/anthropics/claude-code/issues/96382) / [#95379](https://github.com/anthropics/claude-code/issues/95379) | abertas, `platform:vscode` | Desde a 2.1.268 a extensão oficial não mostra quais sessões estão **ativas**; a lista não reflete a recência sem reload | = item 5(a) (sessões vivas no picker) e a ordenação por atividade (#87900, 0.19.0). |
| [#94620](https://github.com/anthropics/claude-code/issues/94620) | aberta, 5 reações, 7 comentários | Forma oficial de listar as sessões rodando e o estado de cada uma (trabalhando / ociosa / esperando) | = 5(a) + notifier; lemos o mesmo `~/.claude/sessions/{pid}.json`. |
| [#97258](https://github.com/anthropics/claude-code/issues/97258) | aberta | Gráfico de uso do desktop soma linhas duplicadas do transcript e pula agentes de workflow | Exatamente o bug que o R5 corrigiu do nosso lado em 2026-08-11. |
| [#97819](https://github.com/anthropics/claude-code/issues/97819) | aberta | Lead não tem visão ao vivo do custo dos sub-agents | = item 6a. |
| [#93812](https://github.com/anthropics/claude-code/issues/93812) / [#92950](https://github.com/anthropics/claude-code/issues/92950) | abertas | Separar o transcript por agente (VS Code) / inspetor persistente de sub-agent (TUI) | = árvore (13) + clique-para-transcript (1). |
| [#99018](https://github.com/anthropics/claude-code/issues/99018) | aberta | Publicar a janela de contexto de cada modelo no handshake (hosts SDK não conseguem obtê-la) | Mesma lacuna da heurística de janela do item 2 — ver o bug do Fable lá. |
| [#94435](https://github.com/anthropics/claude-code/issues/94435) / [#92475](https://github.com/anthropics/claude-code/issues/92475) / [#99208](https://github.com/anthropics/claude-code/issues/99208) | abertas | Desktop: indicador persistente de contexto; o anel não reflete mais o contexto; visualizador da janela | Item 2. Superfície = desktop/TUI → **não comentar**; material de divulgação. |
| [#93299](https://github.com/anthropics/claude-code/issues/93299) / [#95642](https://github.com/anthropics/claude-code/issues/95642) | abertas | Plugin JetBrains oficial: sidebar de sessões passadas / i18n zh-CN da extensão oficial | Itens 24 e 12 já entregam o equivalente do nosso lado. **Não comentar:** pedem mudança no produto da Anthropic. |


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
- **Sinal para o viewer (varredura 2026-08-10):** [#81549](https://github.com/anthropics/claude-code/issues/81549)
  pede timestamps por mensagem na UI de transcript — dado que o `.jsonl` já tem e um viewer
  nosso mostraria de graça.
- **Atualização (varredura 2026-10-04):** a extensão oficial ganhou timestamps por mensagem
  (setting *Show Message Timestamps*, 2.1.284, desligado por padrão), o que atende #81549 do lado
  deles, e o agent map (2.1.269) abre o transcript read-only de cada sub-agent. O viewer próprio
  perde força como diferencial no VS Code; segue útil no JetBrains e para sessões do terminal.

### 2. Indicador de uso de contexto/token na barra ✅ ENTREGUE
- **Issue:** [#58159](https://github.com/anthropics/claude-code/issues/58159) — labels `platform:vscode`, `area:statusline`
- **Reforçada por:** [#516](https://github.com/anthropics/claude-code/issues/516) (`NOT_PLANNED`) "Always show available context percentage" — pedido antigo, nunca atendido.
- **Status:** ✅ entregue — badge "{pct}% ctx" + barra fina com semáforo (verde <60% / amarelo 60–85% / vermelho ≥85%) na `UsageTable`. Spec: [docs/specs/2026-06-03-context-usage-indicator-design.md](specs/2026-06-03-context-usage-indicator-design.md). Plano: [docs/plans/2026-06-03-context-usage-indicator.md](plans/2026-06-03-context-usage-indicator.md).
- **Como:** o parser extrai o tamanho do contexto da última mensagem do transcript principal (`input + cache`); limite 200k/1M detectado pelo modelo. Lógica de nível em `format.contextLevel`.
- **R-perf: ✅ entregue junto com o R5 (2026-08-11)** — o transcript principal passou a ser lido uma única vez por refresh (tokens e contexto na mesma passada de `readFileUsage`; `contextForFile` removido).
- **Bug + melhoria futura (detecção de janela):** o limite 200k/1M é detectado por heurística (família `opus`/`sonnet` 4+ ou evidência observada), porque a janela exata **não** está no transcript nem nos hooks. A **única** fonte de verdade local é o `context_window.context_window_size` do **statusline JSON**, mas captá-lo exige registrar um statusline (barra visível na TUI + conflito com statusline existente). Registrado como **"statusline bridge (opt-in)"** — um comando explícito tipo *"Enable precise context"* — se algum usuário pedir precisão exata. 🔍 a avaliar.
  **Reforço (varredura 2026-07-25):** [#81039](https://github.com/anthropics/claude-code/issues/81039)
  mostra o **próprio app desktop** errando isso — `/context` exibindo denominador de 200.0K em
  sessões que passam disso. Ou seja, a heurística de janela é dor do ecossistema inteiro, não
  limitação nossa; e [#79155](https://github.com/anthropics/claude-code/issues/79155) pede
  exatamente o indicador **persistente** de contexto que já entregamos na 0.4.0.
- **⚠️ Bug novo a corrigir (varredura 2026-08-10):** o rollup de `usage.iterations` em turnos
  com `advisor` infla o top-level (~2×) que o `contextForFile` lê — corrigido — ver **R5** (✅ 2026-08-11). Relacionados do período:
  [#81702](https://github.com/anthropics/claude-code/issues/81702) contexto inflado ~4× no
  resume e [#83419](https://github.com/anthropics/claude-code/issues/83419) modelo alegando
  limite com 43–72% livres.
- **Reforço (varredura 2026-09-05) — o desktop andou para trás:** [#90708](https://github.com/anthropics/claude-code/issues/90708) (**5 reações**)
  pede de volta o indicador de contexto que o rodapé do app desktop trocou pelo anel de uso do
  plano; [#91075](https://github.com/anthropics/claude-code/issues/91075) documenta a troca silenciosa de significado; [#91232](https://github.com/anthropics/claude-code/issues/91232) o anel não avisa
  antes do auto-compact (antes ficava amarelo aos ~60% — exatamente o nosso semáforo 60/85).
  [#88211](https://github.com/anthropics/claude-code/issues/88211) e [#90018](https://github.com/anthropics/claude-code/issues/90018): o `totalTokensReminder` injetado no modelo mostra um número sem
  relação com o contexto e ainda derruba o prompt-cache — o modelo diz "sobra bastante" e morre
  no limite. Contagem própria a partir do transcript (a nossa) segue sendo a única fonte que não
  depende de widget nem de lembrete. Superfície = desktop → não comentar; usar na divulgação.
- **✅ Corrigido em 2026-10-05 (aguardando release): Fable = 1M, como Opus e Sonnet** (decisão
  do brainstorm, com a ressalva do Pro/Team abaixo). **Bug (varredura 2026-10-04) — janela do
  Fable detectada como 200k.** O `ONE_M_FAMILY`
  ([usageParser.ts:12](../src/services/usageParser.ts#L12)) só reconhece `opus|sonnet`, e o
  transcript grava `claude-fable-5-1` (e `claude-fable-5`) **sem** o sufixo `[1m]`. Medido no
  disco (30 dias): 45 arquivos com Fable 5.1, contexto máximo de 962k, 6.071 records acima de
  200k. Efeito: com 150k o painel mostra 75% (amarelo) quando o real é 15%, e ao passar de 200k o
  limite pula para 1M (cai para ~20%). O CHANGELOG lista o Fable entre os modelos com janela de
  1M (2.1.285: *"Opus 4.7+, Sonnet 5+, Fable"*; 2.1.287: 1M por padrão em Bedrock/Vertex/Foundry).
  **Ressalva:** no Pro/Team sem usage credits o Fable roda em 200k (2.1.268: *"Usage credits
  required for 1M context"*). Tratar o Fable como 1M **sub-reporta** nesses usuários, que é o
  lado perigoso para um aviso. Sinal extra disponível: um auto-compact com
  `compactMetadata.preTokens` acima de 200k prova a janela de 1M (visto no disco: 967k).
  Decidir a regra antes de corrigir. Opus 5/5.5 e Sonnet 5/5.5 já casam a regex (verificado).
- **Reforço (varredura 2026-10-04):** [#93036](https://github.com/anthropics/claude-code/issues/93036) — o indicador oficial do VS Code fica
  **escondido até 50%**; os comentários em [#18456](https://github.com/anthropics/claude-code/issues/18456) (09-20 a 10-01) pedem um "sempre mostrar" e
  relatam que o indicador parou de atualizar no meio da sessão. A 2.1.273 corrigiu do lado deles
  o contexto ~2× em turnos com advisor (o nosso achado 2 do R5, corrigido em 08-11).
  [#99018](https://github.com/anthropics/claude-code/issues/99018) pede a janela de cada modelo no handshake do SDK — a mesma informação que nos falta.
- **Janela exata para quem ativa a ponte (item 25, v1):** o `window` que o Claude Code informa
  substitui a estimativa por nome de modelo; a heurística segue como reserva para quem não ativa.

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

### 5. Seletor de sessão melhor: vivas/ativas, atalhos, sem corte — (a)+(b)+(c)+(d) ✅ ENTREGUE (0.13.0 · (a)+(c) 0.18.0, 2026-07-27)
- **Issues:** [#28147](https://github.com/anthropics/claude-code/issues/28147) (`NOT_PLANNED`, `keybindings`) indicadores de atividade + atalhos · [#24435](https://github.com/anthropics/claude-code/issues/24435) (`NOT_PLANNED`) picker corta em ~8 sessões mais recentes · [#23275](https://github.com/anthropics/claude-code/issues/23275) (`NOT_PLANNED`) nomear sessões
- **Status:** fatias (d)+(b) ✅ entregues na 0.13.0; (a) sessões vivas e (c) nomes reais ✅
  entregues em 2026-07-27, publicados na **0.18.0** (2026-09-05). Spec:
  [docs/specs/2026-07-27-sessoes-vivas-e-nomes-design.md](specs/2026-07-27-sessoes-vivas-e-nomes-design.md)
  · plano: [docs/plans/2026-07-27-perguntas-pendentes-e-sessoes-vivas.md](plans/2026-07-27-perguntas-pendentes-e-sessoes-vivas.md).
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
  - **(c) nomear sessões:** esforço **médio/alto**, estimativa anterior ao CLI ganhar
    `/session-name`. A ideia original previa `globalState['sessionAliases']`, comando de rename
    próprio na extensão e precedência alias > título derivado. Esse desenho foi **descartado**
    na fase de design (ver spec, seção "Fora de escopo"): `globalState` é API do VS Code e o
    sidecar do JetBrains não a alcança, e duplicar rename ao lado de `/session-name` só criaria
    a pergunta de qual nome vence. O que foi entregue é mais simples — cache read-only em
    `SessionNames` (arquivo, não `globalState`) só pra o nome escolhido via `/session-name`
    sobreviver ao fim do processo; nenhum comando de rename na extensão.
- **Ordem sugerida (planejamento pré-entrega, superado pelo que aconteceu):** a ideia original
  era (d)+(b) como quick win → (a) → (c) em sequência, por mexerem nos mesmos pontos
  (`SessionSummary`/`resolveTitle`/`showSessionPicker`). Na prática (d)+(b) saíram na 0.13.0 e
  (a)+(c) foram implementados e entregues **juntos**, no mesmo plano, em 2026-07-27 — mexer nos
  mesmos pontos acabou tornando fazer os dois de uma vez mais simples que sequenciar.
- **✅ (a)+(c) entregues (2026-07-27):** `liveSessions.ts` lê
  `~/.claude/sessions/{pid}.json` e devolve um `Map<sessionId, LiveSession>`; `SessionSummary`
  ganhou `alive?: boolean`, refletido no picker do VS Code (`● {picker.alive}`) **e** no picker
  nativo do JetBrains (mesmo campo, mesma regra — paridade sem mudança de protocolo, o
  `SessionSummary` inteiro já viajava para lá). O modo Auto passa a preferir pin > sessão viva
  de maior mtime > sessão de maior mtime — corrige o caso de fechar a sessão que acabou de
  rodar e o painel continuar preso na morta. Nomes: `name` do registro só quando
  `nameSource === 'user'` (o valor `'derived'` do CLI é pior que o título semântico que já
  usávamos e é ignorado), com cache próprio em `sessionNames.ts` para o nome sobreviver ao fim
  do processo. **Limitação aceita conscientemente:** um PID reciclado pelo SO pode marcar uma
  sessão morta como viva; o `procStart` do registro resolveria isso, mas exigiria comparação
  fora do Node (`wmic`/PowerShell) a cada refresh — caro demais para um efeito puramente
  cosmético (o pin resolve na hora). Documentado no spec, não mitigado.
- **🔓 Destravado (varredura 2026-07-16):** o CLI agora mantém um **registro vivo de sessões**
  em `~/.claude/sessions/{pid}.json` — `{pid, sessionId, cwd, startedAt, version, kind,
  entrypoint, name, nameSource}` (verificado em disco, v2.1.211). Isso resolve (a) **e** (c) de
  uma vez: liveness real (arquivo por PID do próprio CLI, melhor que nosso `terminalPid`
  heurístico do bridge) e **nome de sessão real** (`name` + `nameSource: derived|user` — o CLI
  ganhou `/session-name`, [#2112](https://github.com/anthropics/claude-code/issues/2112)
  `COMPLETED`). **Perguntas respondidas na entrega (a)+(c):** `nameSource: "user"` de fato
  aparece assim que o usuário roda `/session-name`, confirmado ao implementar a decisão 4 do
  spec. O ciclo de vida do arquivo no exit acabou **irrelevante** pro design — `liveSessions.ts`
  decide vivo/morto checando o PID (`process.kill(pid, 0)`), não a existência do arquivo, então
  um órfão que sobreviva a um crash é simplesmente filtrado como morto, sem tratamento especial.
  Não substituiu o bridge: o registro de sessões só contribui liveness e nome; `cwd`/candidatos
  por workspace continuam vindo do bridge.
- **Reforço (varredura 2026-07-25):** [#80099](https://github.com/anthropics/claude-code/issues/80099)
  é um **guarda-chuva** pedindo ciclo de vida de sessão no VS Code — *pin* + estado
  ativo/concluído + agrupamento (consolidando #63842, #66202, #64468); nós já temos o pin e o
  estado deriva do transcript. [#79571](https://github.com/anthropics/claude-code/issues/79571)
  enuncia bem o buraco de (a): *"não existe primitivo de liveness para agentes despachados —
  silêncio é ambíguo"*, causando redispatch duplicado. E
  [#78454](https://github.com/anthropics/claude-code/issues/78454) expõe uma terceira fonte
  possível, `~/.claude/daemon/roster.json` (ver item 21). Confirma (a) como o próximo passo
  natural depois do item 17.
- **✅ Fonte reconfirmada em disco (2026-07-27, CLI 2.1.220):** `~/.claude/sessions/{pid}.json`
  existe e está vivo — um arquivo por processo, com
  `{pid, sessionId, cwd, startedAt, procStart?, version, peerProtocol, kind, entrypoint, name,
  nameSource}`. Confirmações que importam para o design: `entrypoint` distingue
  `claude-vscode` de terminal; `name` vem preenchido com `nameSource: "derived"` (resolve (c)
  sem storage próprio); e `procStart` — presente em parte dos arquivos — é exatamente o
  carimbo que defende contra reuso de PID. **A conferir no design:** o arquivo é removido no
  exit ou fica órfão? (havia 3 arquivos para 3 sessões vivas, o que sugere limpeza correta,
  mas um crash não passa pelo caminho feliz).
- **Risco a checar antes:** [#78466](https://github.com/anthropics/claude-code/issues/78466) —
  lista de sessões vazia no Windows quando o workspace está em drive `subst`. Nós resolvemos o
  project dir a partir da cwd (o `encodeCwdToProjectDir`); vale um teste em drive `subst`, já
  que a 0.16.0 mexeu justamente na normalização de separadores. 🔍
- **Reforço (varredura 2026-10-04):** [#96382](https://github.com/anthropics/claude-code/issues/96382) — desde a 2.1.268 a extensão oficial trocou as abas
  de sessões por uma lista de histórico e **não mostra mais quais sessões estão ativas**;
  [#95379](https://github.com/anthropics/claude-code/issues/95379) a lista não reflete a recência sem reload; [#94620](https://github.com/anthropics/claude-code/issues/94620) (5 reações, 7 comentários) pede
  uma forma oficial de listar as sessões rodando e o estado de cada uma (o autor monta isso com
  hooks e `pgrep`; nós lemos `~/.claude/sessions/{pid}.json`). A 2.1.271 corrigiu do lado deles
  a lista vazia em drive `subst`/mapeado; o risco #78466 acima segue sem teste do nosso lado.

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

### 12. i18n da UI da extensão ✅ ENTREGUE (0.8.0 · chinês na 0.17.0)
- **Origem:** inconsistência entre README trilíngue (pt/en/es) e UI monolíngue em português; demanda crescente por localização no ecossistema Claude Code ([#60914](https://github.com/anthropics/claude-code/issues/60914), [#64472](https://github.com/anthropics/claude-code/issues/64472), [#58688](https://github.com/anthropics/claude-code/issues/58688), [#35600](https://github.com/anthropics/claude-code/issues/35600) etc.).
- **Status:** ✅ entregue — idiomas **en** (base/fallback), **pt-br**, **es** (0.8.0), **zh-cn** e **zh-tw** (0.17.0). Segue o idioma de exibição do VS Code (`display language`) com override opcional via setting `claudeTodos.language`. Corrige a inconsistência pt/en anterior da UI.
- **Chinês (0.17.0, 2026-07-27):** simplificado e tradicional nas duas superfícies — extensão VS Code **e** plugin JetBrains (mesmos catálogos, mesma cobertura de `package.nls.*` e de toasts nativos), mais READMEs [zh-cn](../README.zh-cn.md) / [zh-tw](../README.zh-tw.md). A resolução de locale passou a considerar **script e região**: `zh-TW`/`zh-HK`/`zh-MO` → tradicional; `zh-CN`/`zh-SG`/`zh` sem região → simplificado (`LocaleResolver` extraído no lado JetBrains para virar testável). **Pendência:** as traduções foram geradas por IA e aguardam revisão de falante nativo — glossário de terminologia em [docs/i18n/glossary-zh.md](i18n/glossary-zh.md). 🔍
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
- **Sinal a acompanhar (2026-07-25):** [#81202](https://github.com/anthropics/claude-code/issues/81202)
  pede `claude://cowork/{session-id}` para retomar uma sessão — é outro produto (Cowork no
  desktop), mas mostra o ecossistema caminhando para deep links de sessão. Não muda a decisão
  hoje; muda o que observar antes de reabrir.
- **Sinal novo (varredura 2026-09-05):** [#85726](https://github.com/anthropics/claude-code/issues/85726) (`platform:vscode`) pede deep link
  `/open?session=…&target=sidebar` na extensão oficial. Segundo sinal; ainda sem consumidor
  externo para o nosso. Mantido ⏸️.

### 8. Visão global de histórico entre todos os projetos
- **Issue:** [#49095](https://github.com/anthropics/claude-code/issues/49095) (`NOT_PLANNED`) — labels `platform:vscode`, `area:ide`
- **Status:** 🔍 a investigar / ⚠️ **conflito de posicionamento a decidir**
- **Ideia:** aba/comando "Todos os projetos" agregando `~/.claude/projects/*/*.jsonl` com
  título, nome do projeto, timestamp e contagem de mensagens; busca/filtro.
- **Tensão:** vai **contra o princípio de escopo-por-workspace** que é o nosso diferencial de
  privacidade (duas janelas nunca veem os todos uma da outra). Se entrar, tem que ser opt-in
  explícito e bem isolado. Decidir posicionamento antes de planejar.
- **Reforço (varredura 2026-08-10):** a demanda por organização multi-projeto segue —
  [#82641](https://github.com/anthropics/claude-code/issues/82641) grouping/labels de sessão
  no painel, mais um cluster grande de grouping no sidebar do desktop
  ([#84040](https://github.com/anthropics/claude-code/issues/84040),
  [#84540](https://github.com/anthropics/claude-code/issues/84540),
  [#84556](https://github.com/anthropics/claude-code/issues/84556) etc. — outra superfície,
  não comentar). E a nota de retenção em R3 vale aqui: histórico "entre todos os projetos"
  teria horizonte máximo de 30 dias.
- **Reforço (varredura 2026-09-05):** [#90030](https://github.com/anthropics/claude-code/issues/90030) pede agrupar sessões por projeto na lista do
  Code web/mobile; [#86259](https://github.com/anthropics/claude-code/issues/86259) mostrar o cwd de cada sessão no sidebar do desktop. A dor continua
  sendo "em qual projeto está isto?" — que o escopo por workspace resolve por construção. A
  decisão de posicionamento segue pendente (agora com o gatilho do R2).

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

> **Fila de brainstorming — zerada em 2026-07-27.** Os dois itens que estavam no topo da fila
> decidida em 2026-07-27 foram entregues no mesmo dia: 1º **22-ext** (perguntas pendentes **no
> painel**, não só no toast) e 2º **5(a)+(c)** (sessões vivas + nomes reais, destravados por
> `~/.claude/sessions/*.json`) — ver os itens para spec/plano. O item **17** (agent teams)
> segue **arquivado**: a inspeção de 2026-07-27 revogou o gatilho — não existe owner por task em
> dado nenhum, e 61 dos 63 configs de team são auto-criados sem membros reais (detalhes no
> item); não reabrir sem um dos dois sinais listados lá. O que **sobra** fora da fila é só o
> item **23** (background tasks no painel), que continua bloqueado por depender de uma decisão
> de posicionamento (junto com o item 8) ainda não tomada — não reabrir sem essa decisão. Itens
> 13, 14 e 15 saíram da fila por entrega (0.9.0, 0.10.0, 0.10.0).
>
> **Atualização 2026-08-10:** a varredura desta data promoveu o **R5** (contabilidade de
> tokens — inflação ~2× medida no disco) a 📐 **prioridade**; é correção de exatidão do que já
> está entregue, então passa na frente de qualquer feature nova da fila.
>
> **Atualização 2026-09-05:** a varredura desta data confirmou que o **R2 materializou** — a
> 2.1.233 desligou `TodoWrite`/`TaskCreate` por padrão nos modelos novos (decisão intencional,
> confirmada pelo mantenedor). R2 vira 🔥 **prioridade máxima**, acima do que sobrava na fila:
> estado vazio que explica e corrige (flag via `settings.json`), onboarding, e a decisão de
> posicionamento que os itens 8 e 23 já esperavam — agora com gatilho externo. Ver R2.
>
> **0.18.0 publicada em 2026-09-05** com 22-ext, 5(a)+(c), R5 e os READMEs da 2.1.233 — VS Code
> Marketplace e Open VSX já listam; JetBrains em revisão leve. Passo 0 do R2 ✅ verificado no
> mesmo dia (ver R2); próximo: passo 1 (estado vazio inteligente).
>
> **0.19.0 publicada em 2026-09-07** com R2 passos 1 e 2 (estado vazio inteligente + passo do
> walkthrough), `settings.json` inválido protegido contra sobrescrita e a correção do sinal de
> atividade (#87900, R3). Passo 4 (comentário em #80015) sai logo após a publicação.
>
> **Atualização 2026-10-04:** a varredura desta data achou **três bugs nossos** e uma mudança de
> cenário. Fila: 1º **R6** (sub-agents em background marcados como concluídos — confirmado no
> disco — e o toast de ociosa que isso provavelmente dispara); 2º o bug da janela do **Fable**
> (item 2), que pede uma decisão antes do código; 3º a decisão de **posicionamento** (R2 passo
> 3), agora pressionada pelo agent map da extensão oficial (ver o aviso no topo). Latentes, sem
> pressa: achado 4 do R5 (fork duplica `requestId`) e o gate do R2 ainda como lista de bloqueio.
> **2026-10-05:** R6 (achados 1 e 2) e o bug do Fable corrigidos; o próximo é o spike do mod
> (item 25) e depois o posicionamento.
> **2026-10-06:** spike feito e ponte de dados v1 entregue (item 25); o próximo é o
> posicionamento.
>
> Filas anteriores, para histórico: 2026-07-25 → 1º 17 · 2º 5(a)+(c) · 3º 23. Manhã de
> 2026-07-27 → 1º 17 · 2º 22-ext · 3º 5(a)+(c) (17 caiu na verificação de disco da mesma tarde).
> Tarde de 2026-07-27 → 1º 22-ext · 2º 5(a)+(c) (ambos entregues no mesmo dia; fila zerada).

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
- **⚠️ Bug (varredura 2026-10-04):** sub-agents lançados em background aparecem como concluídos
  enquanto ainda rodam — ver **R6**. **Concorrência:** a extensão oficial lançou o agent map
  (2.1.269; ver o aviso no topo), mas erra a hierarquia aninhada ([#98118](https://github.com/anthropics/claude-code/issues/98118): nós de nível 2+
  pendurados no main, "Tool calls (0)"); a nossa ligação por `toolUseId` acerta.

### 14. Notificações — sessão terminou / aguardando input ✅ ENTREGUE (0.10.0)
- **Origem:** dor nº 1 de sessões longas — o agente termina (ou fica parado numa pergunta) e o
  usuário só percebe minutos depois. Demanda comprovada: usuários montam pontes externas de
  notificação (WhatsApp, push) por fora.
- **Ideia:** toast nativo do VS Code quando (a) a sessão fica ociosa após atividade longa,
  (b) todas as tasks completam. Já detectamos `mtime` do transcript + estado das tasks; falta
  só a regra de disparo e o `window.showInformationMessage`. Opt-in via setting.
- **Custo/benefício:** baixíssimo custo, retenção altíssima.
- **Status:** ✅ entregue na 0.10.0 — spec: [docs/specs/2026-07-14-session-notifications-design.md](specs/2026-07-14-session-notifications-design.md) · plano: [docs/plans/2026-07-14-session-notifications.md](plans/2026-07-14-session-notifications.md). `SessionNotifier` puro (idle após ≥60s de atividade + 45s de silêncio; allComplete na transição), timer de 10s armado só em atividade, gate de setting+foco no disparo, toast com "Abrir painel"/"Não notificar".

### 24. Porta JetBrains — plugin publicado ✅ ENTREGUE (0.16.0, 2026-07-26)
- **Origem:** decisão de produto 2026-07-17 (alcançar o público JetBrains que roda Claude Code).
- **Status:** ✅ **publicado** —
  [JetBrains Marketplace #33074](https://plugins.jetbrains.com/plugin/33074-claude-todos).
  Overview: [docs/specs/2026-07-17-jetbrains-port-overview.md](specs/2026-07-17-jetbrains-port-overview.md)
  (SP0 core compartilhado + sidecar · SP1 esqueleto Kotlin/JCEF · SP2 pontes nativas ·
  SP3 CI/empacotamento/publicação).
- **Arquitetura:** um parser só (TS, `SessionCore` + sidecar Node falando JSON-lines) e uma
  webview só (Svelte, ponte plugável `acquireVsCodeApi`/`__jcefPost`) servindo os dois IDEs —
  zero divergência de schema por construção. Plugin Kotlin fino (JCEF + `MessageRouter`).
- **Paridade entregue:** árvore de agentes, tempos, tokens/contexto/cache, dashboard 7 dias,
  toasts nativos com os mesmos gates, clique na task → transcript na linha, picker de sessão,
  e instalação de hook **idempotente entre os dois IDEs** (mesmo script, mesmo path).
- **Validado em IDE real** (smoke humano 2026-07-22): achou e corrigiu 3 bugs que teste
  automatizado nenhum pegaria (separadores de path do `basePath`, factory sem `DumbAware`,
  shortId duplicado no picker).
- **Divergências aceitas:** onboarding (JetBrains não tem walkthrough nativo — coberto pelo
  prompt de hook + estados vazios); sem UI de settings dedicada (PropertiesComponent).
- **Follow-ups no ledger:** `resolveClaudeDir` do VS Code consultar `CLAUDE_CONFIG_DIR`;
  persistência do pin no JetBrains; erro real no toast de falha de hook; Configurable de
  settings; limpar `pending` no `onDead`.

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

### 17. Agent teams: dono por task ⏸️ adiado — gatilho **não** atingido (reverificado 2026-07-27)
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
- **❌ Gatilho revogado (inspeção de disco, 2026-07-27).** O item foi promovido em 07-16 com
  base no config de teams existir — mas o que ele pede é **owner por task**, e isso não existe
  em lugar nenhum. Três achados, todos verificados localmente:
  1. **Nenhum campo de dono nos transcripts.** Varrendo todo o `~/.claude/projects`, os únicos
     campos que as ferramentas carregam são `TaskCreate.{subject,description,activeForm}` e
     `TaskUpdate.{taskId,status}` — zero ocorrências de `"owner"` (nem no task store do item 21).
     A premissa original (*"quando o campo de owner aparecer nos transcripts"*) **segue não
     realizada**.
  2. **97% dos configs de team são ruído.** Dos 63 diretórios em `~/.claude/teams/`, **61** são
     `session-{id8}` auto-criados para sessões comuns, com um único membro (o próprio
     `team-lead`, `backendType: "in-process"`). Só **2** são teams de verdade (`farol` e
     `chat-webhook`, 3 membros cada) — e ambos foram criados em **fevereiro de 2026**. Qualquer
     UI que reagir à mera existência do config vai disparar em toda sessão.
  3. **Membro não tem `sessionId`.** O config lista `{agentId, name, agentType, model, cwd,
     joinedAt, tmuxPaneId}` — nada que ligue um membro ao transcript dele. E o config
     **sobrevive** ao transcript (o do `farol` já foi apagado pela retenção de 30 dias), então
     um painel derivado do config mostraria membros sem dado nenhum por trás.
- **Como reverificar** (barato, roda em segundos) — se listar algo além de `subject`,
  `description`, `activeForm`, `taskId` e `status`, o gatilho voltou:
  ```bash
  node -e "const fs=require('fs'),p=require('path');function*w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())yield*w(f);else if(e.name.endsWith('.jsonl'))yield f}}const k=new Set();for(const f of w(require('os').homedir()+'/.claude/projects')){const t=fs.readFileSync(f,'utf8');if(!t.includes('TaskCreate')&&!t.includes('TaskUpdate'))continue;for(const l of t.split('\n')){let e;try{e=JSON.parse(l)}catch{continue}const c=e.message?.content;if(!Array.isArray(c))continue;for(const b of c)if(b?.type==='tool_use'&&/^Task(Create|Update)$/.test(b.name||''))Object.keys(b.input||{}).forEach(x=>k.add(b.name+'.'+x))}}console.log([...k].sort().join(' '))"
  ```
- **Condição para reabrir:** campo de dono presente no `TaskCreate`/`TaskUpdate` **ou** um team
  real (`members.length > 1`) ativo com transcript vivo. Sem um dos dois, qualquer coisa aqui é
  UI sem dado.
- **Reverificado em 2026-10-04:** o comando acima lista só `TaskCreate.description
  TaskCreate.subject` (nenhum dono); `~/.claude/teams/` segue com 63 diretórios. Gatilho **não**
  atingido. A observar: a 2.1.289 levou `agent.spawn` e os estados idle/waiting de teammates à API
  de Mods (item 25). Se um dia surgir dono por task, deve aparecer por lá antes do transcript.

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

### 20. Badge de modelo por agente (main + nós da árvore) ✅ ENTREGUE (0.15.0)
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
- **Status:** ✅ entregue na 0.15.0. Spec:
  [docs/specs/2026-07-17-model-badge-design.md](specs/2026-07-17-model-badge-design.md). Plano:
  [docs/plans/2026-07-17-model-badge-and-awaiting-input.md](plans/2026-07-17-model-badge-and-awaiting-input.md).
  `lastModel` por transcript (`AgentUsage.currentModel`), `shortModel` compatível com dados
  legados e `modelBadge` no webview — badge sempre no main, e nos sub-agents só quando o
  modelo difere do main. Validado visualmente via `preview-webview`.
- **Reforço pós-entrega (varredura 2026-07-25):** o problema do modelo errado por sub-agent
  continua ativo no lado nativo — [#78867](https://github.com/anthropics/claude-code/issues/78867)
  (`NOT_PLANNED`) o agent viewer re-renderiza o banner da sessão e **rotula o sub-agent com o
  modelo errado**; [#81198](https://github.com/anthropics/claude-code/issues/81198) override de
  modelo do sub-agent ignorado e a TUI mostra um **terceiro modelo, stale**;
  [#79109](https://github.com/anthropics/claude-code/issues/79109) pede o nome do modelo em cada
  entrada da lista de background tasks. Nosso badge lê o modelo da **última mensagem do
  transcript daquele agente**, então acerta exatamente onde os três erram — vale citar isso no
  README/divulgação.
- **Reforço (varredura 2026-08-10):** o cluster não seca —
  [#82766](https://github.com/anthropics/claude-code/issues/82766) badge do sidebar VS Code
  mostra Haiku com `/model` em Sonnet 5 (e **bloqueia** o modo Auto);
  [#84028](https://github.com/anthropics/claude-code/issues/84028) CLI e mobile reportam
  modelos diferentes para a mesma sessão, 60s de intervalo;
  [#84705](https://github.com/anthropics/claude-code/issues/84705) pede o modelo **resolvido**
  (não o alias) nas notificações de conclusão de sub-agent. Quarto, quinto e sexto casos.
- **Reforço (varredura 2026-09-05):** sétimo a décimo casos — [#86834](https://github.com/anthropics/claude-code/issues/86834) pede o modelo
  **resolvido** por sub-agent nas task rows e notificações; [#87605](https://github.com/anthropics/claude-code/issues/87605) (`DUPLICATE`) task rows
  mostram modelo/effort do **pai**; [#89133](https://github.com/anthropics/claude-code/issues/89133) o modelo do sub-agent não aparece quando vários
  lançam em paralelo; [#90246](https://github.com/anthropics/claude-code/issues/90246) pede o nome do modelo na agent status view inline. Um ano de
  cluster; o badge por nó continua a resposta.
- **Reforço (varredura 2026-10-04):** 11º a 16º casos — [#97634](https://github.com/anthropics/claude-code/issues/97634) (na 2.1.283 **nenhum** lugar
  da UI do terminal mostra o modelo do sub-agent: `/tasks` perdeu a coluna e o transcript view
  mostra o do pai), [#97588](https://github.com/anthropics/claude-code/issues/97588) (extensão VS Code mostra sub-agents com o modelo da sessão apesar de
  `CLAUDE_CODE_SUBAGENT_MODEL`), [#97473](https://github.com/anthropics/claude-code/issues/97473), [#95823](https://github.com/anthropics/claude-code/issues/95823), [#94575](https://github.com/anthropics/claude-code/issues/94575), [#93324](https://github.com/anthropics/claude-code/issues/93324). A 2.1.285 corrigiu um
  caso no agent map oficial (*"labeling a sub-agent with the session's model"*), mas #97588 é de
  09-27. **Fonte nova e exata:** o `toolUseResult` do disparo traz `resolvedModel` (verificado no
  disco), útil para o badge de um sub-agent que ainda não respondeu nenhuma mensagem.

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
- **⚠️ Achado novo (2026-07-27):** o task store **está vazio aqui agora** — `~/.claude/tasks/`
  tem 63 diretórios de sessão, mas o único conteúdo restante é um par `.lock` /
  `.highwatermark`; nenhum `N.json`. Ou os arquivos de task são efêmeros (apagados no fim da
  sessão), ou o formato mudou desde a observação de 07-16. Isso **derruba a premissa** de (b)
  exibir `blockedBy`: não há de onde ler. Reconfirmar em disco antes de investir neste item —
  e preferir o transcript como fonte, que é o que já fazemos.
- **Achado 2 (varredura 2026-07-25) — IDs de task não sobrevivem ao resume:**
  [#80871](https://github.com/anthropics/claude-code/issues/80871) reporta que os ids de
  `TaskUpdate`/`TaskList` mudam depois de um `--resume`. Isso importa para nós porque o schema
  `TaskUpdate` é casado **por `taskId`** no `todosParser` (o `TodoWrite` casa por `content`) —
  vale um teste com transcript retomado para confirmar se a derivação de `startedAt`/`completedAt`
  se perde no resume. Relacionado: [#80315](https://github.com/anthropics/claude-code/issues/80315)
  (sessões pós-crash com `--resume` dão ACK morto em novos spawns de Agent/Task).
- **Achado 3 (varredura 2026-07-25) — roster do daemon:**
  [#78454](https://github.com/anthropics/claude-code/issues/78454) revela
  `~/.claude/daemon/roster.json` com entradas `workers.*` por processo — e o próprio relato pede
  "prune por PID morto + validar `procStart` contra reuso de PID", que é **exatamente** a
  heurística de liveness do item 5(a). Terceira fonte candidata de liveness (junto com
  `~/.claude/sessions/{pid}.json` e nosso `terminalPid` do bridge); avaliar qual é a mais
  confiável antes de implementar.
- **Achado 4 (varredura 2026-08-10) — MCP `ccd_*` não documentado:**
  [#82141](https://github.com/anthropics/claude-code/issues/82141) descreve servers MCP
  internos (`ccd_*`) com mensageria sessão-a-sessão e um `list_sessions` com escopo próprio —
  quarta fonte candidata de lista/liveness de sessões. Complementam:
  [#82581](https://github.com/anthropics/claude-code/issues/82581) pin de sessão invisível em
  `agents --json` e [#85160](https://github.com/anthropics/claude-code/issues/85160) pedindo
  sessionIds no `ListAgents`. Só observar — nossa leitura do registro de sessões (item 5a)
  continua suficiente.
- **Achado 5 (varredura 2026-09-05) — o task store perdeu o cliente padrão:** com a 2.1.233
  (ver **R2**) `TaskCreate`/`TaskUpdate` só existem com `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, então
  `~/.claude/tasks/` deixa de ser fonte candidata para a maioria dos usuários — aqui o diretório
  **nem existe** em 2026-09-05. Quem liga a flag herda os bugs do store: [#90731](https://github.com/anthropics/claude-code/issues/90731) endereçado
  por session id, um id novo encalha as tasks no disco · [#90709](https://github.com/anthropics/claude-code/issues/90709) store limpo no meio da
  sessão, ids seguem além do buraco · [#88346](https://github.com/anthropics/claude-code/issues/88346) arquivos apagados sem chamada de Task tool
  (`data-loss`) · [#88129](https://github.com/anthropics/claude-code/issues/88129) pede contrato de escrita externa + releitura do disco pelo painel.
  Leitura para nós: **o transcript continua a fonte** (achado 1/(a) confirmado); o store só
  interessa se um dia virar o único lugar onde a lista existe.
- **Reforço (varredura 2026-10-04):** [#97903](https://github.com/anthropics/claude-code/issues/97903) / [#98095](https://github.com/anthropics/claude-code/issues/98095) — `TaskUpdate`/`TaskCreate` reportam
  sucesso e descartam campos fora do schema; [#93675](https://github.com/anthropics/claude-code/issues/93675) pede uma chave de settings para as task
  tools. Só afeta quem liga a flag; o transcript segue a fonte.

### 22. Notificação "aguardando sua resposta" (AskUserQuestion) ✅ ENTREGUE (0.15.0)
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
- **Status:** ✅ entregue na 0.15.0. Spec:
  [docs/specs/2026-07-17-awaiting-input-notification-design.md](specs/2026-07-17-awaiting-input-notification-design.md).
  Plano: [docs/plans/2026-07-17-model-badge-and-awaiting-input.md](plans/2026-07-17-model-badge-and-awaiting-input.md).
  `detectAwaitingInput(lines, skipSidechain)` no parser (tool_use sem tool_result subsequente),
  novo kind `awaitingInput` no `SessionNotifier` (transição imediata, idle suprimido com
  pendência), toast + i18n ×3. Verificado com transcript real do próprio repo: sobre o arquivo
  completo retorna `null`; truncado antes do `tool_result` do `AskUserQuestion`, retorna
  `'question'`.
- **Reforço pós-entrega (varredura 2026-07-25):** três issues novas em ~5 dias confirmando que
  o hook `Notification` **não** dispara na extensão VS Code —
  [#79881](https://github.com/anthropics/claude-code/issues/79881) (permission_prompt e
  idle_prompt; funciona no terminal, não no painel nativo),
  [#80110](https://github.com/anthropics/claude-code/issues/80110) e
  [#79362](https://github.com/anthropics/claude-code/issues/79362) (com repro). Somadas a #8985
  (63 reações), são o argumento mais forte do nosso notifier: ele deriva do transcript e
  **independe de hook**, então funciona exatamente no cenário onde o oficial falha.
- **Reforço (varredura 2026-08-10):** o cluster segue crescendo, agora nas duas superfícies —
  [#83577](https://github.com/anthropics/claude-code/issues/83577) e
  [#84669](https://github.com/anthropics/claude-code/issues/84669) painel nativo do VS Code;
  [#81788](https://github.com/anthropics/claude-code/issues/81788) e
  [#84006](https://github.com/anthropics/claude-code/issues/84006) app desktop. Um ano de
  issue aberta (#8985) e o hook continua não disparando. Relacionada:
  [#82764](https://github.com/anthropics/claude-code/issues/82764) pede painel unificado de
  **aprovações pendentes** multi-sessão — é a metade permission-prompt que já documentamos não
  alcançar (não chega ao transcript); segue fora.
- **Extensão natural (nova, 2026-07-25):** [#79078](https://github.com/anthropics/claude-code/issues/79078)
  pede um painel lateral que **liste as perguntas em aberto** de uma conversa. Já detectamos a
  pendência (`detectAwaitingInput`) — falta só exibi-la no painel em vez de só notificar: uma
  faixa "aguardando sua resposta" com o texto da pergunta e clique levando à linha do
  transcript (reusa `openTodoSource` do item 1). Custo baixo, tudo já parseado.
  📐 **1º da fila** (decidido 2026-07-27) — daqui em diante chamado de **item 22-ext**.
- **✅ item 22-ext entregue (2026-07-27, publicado na 0.18.0 em 2026-09-05):** faixa
  `PendingQuestions.svelte` no topo do painel (após o header, antes da `UsageTable`), no VS
  Code **e** no JetBrains (webview e `SessionCore` compartilhados desde a 0.16.0, sem código
  específico de host). Novo campo `pendingQuestions?: PendingQuestion[]` no snapshot —
  `AwaitingInput` (usado pelo toast) fica intocado, as duas features leem a mesma detecção sem
  se acoplar. Um `AskUserQuestion` pode trazer até 4 perguntas na mesma chamada; todas
  aparecem. Aparece **independente do foco da janela** e do setting `claudeTodos.notifications`
  — diferente do toast, que segue gated pelos dois. Some sozinha quando o `tool_result` chega
  (resposta, rejeição ou timeout). Spec:
  [docs/specs/2026-07-27-perguntas-pendentes-no-painel-design.md](specs/2026-07-27-perguntas-pendentes-no-painel-design.md)
  · plano: [docs/plans/2026-07-27-perguntas-pendentes-e-sessoes-vivas.md](plans/2026-07-27-perguntas-pendentes-e-sessoes-vivas.md).
- **⚠️ Atualização (varredura 2026-09-05) — o argumento "sem hook" enfraqueceu:** [#79881](https://github.com/anthropics/claude-code/issues/79881)
  foi **fechada em 2026-08-20** — o CHANGELOG da 2.1.233 registra *"Fixed Notification hooks not
  firing for permission prompts when running under Claude Desktop or VS Code"*. Um ano depois
  de #8985, o hook passou a disparar. O que sobra como diferencial: (a) zero configuração (o
  hook exige script + settings), (b) a **faixa no painel** com o texto da pergunta (22-ext),
  (c) não roubar o foco — [#87053](https://github.com/anthropics/claude-code/issues/87053) consolida **52 relatos** de prompts que roubam o foco
  durante a digitação (`area:ide`). Novos no cluster: [#86082](https://github.com/anthropics/claude-code/issues/86082) agent view sem indicador "needs
  input, sleeping" · [#88503](https://github.com/anthropics/claude-code/issues/88503) a notificação de idle não avisa que a saída de um teammate ainda
  precisa ser pedida · [#91996](https://github.com/anthropics/claude-code/issues/91996) pede configurar como as notificações de background renderizam ·
  [#88830](https://github.com/anthropics/claude-code/issues/88830) falhas de hook invisíveis no desktop e sem diagnóstico. **Rever a divulgação** que
  dizia "o hook oficial não dispara no VS Code" — ficou desatualizado (os 5 READMEs foram
  conferidos em 2026-09-05 e não fazem essa afirmação; sobra o post do LinkedIn).
- **Atualização (varredura 2026-10-04):** (1) a extensão oficial ganhou a linha **Questions** com
  as perguntas **já respondidas** e as escolhas (2.1.286). O card da pergunta pendente sempre
  esteve no chat deles; a nossa faixa segue útil para sessões do terminal e quando o chat não
  está à vista. (2) [#93672](https://github.com/anthropics/claude-code/issues/93672) (`COMPLETED`, corrigido na 2.1.288) e [#98373](https://github.com/anthropics/claude-code/issues/98373): o `idle_prompt`
  disparava com sub-agents em background ainda rodando. O nosso notifier provavelmente tem o
  mesmo defeito — ver **R6**.

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
- **🔥 Reforço forte (varredura 2026-07-25):** o tema explodiu em ~9 dias.
  [#79006](https://github.com/anthropics/claude-code/issues/79006) enuncia a dor inteira —
  "background tasks são **invisíveis**: sem campo no statusline, sem badge de UI" ·
  [#79016](https://github.com/anthropics/claude-code/issues/79016) teammates terminados ficam
  como *idle* para sempre, **22 agentes afogando** os ativos, sem dispensa em lote ·
  [#78646](https://github.com/anthropics/claude-code/issues/78646) card do sub-agent fica
  `running` depois da notificação de conclusão · [#78960](https://github.com/anthropics/claude-code/issues/78960)
  (`COMPLETED`) sidebar mostrando "Running" para sessão concluída ·
  [#79250](https://github.com/anthropics/claude-code/issues/79250) e
  [#79178](https://github.com/anthropics/claude-code/issues/79178) notificações de conclusão
  **fabricadas** / spinner órfão · [#78338](https://github.com/anthropics/claude-code/issues/78338)
  e [#78782](https://github.com/anthropics/claude-code/issues/78782) conclusão que nunca chega.
  Todo esse cluster é **estado de vida errado no painel nativo** — que é exatamente onde um
  modelo derivado do transcript (o nosso) tende a acertar. Muda a leitura da "tensão" acima: o
  pedido não é "mostrar tudo que roda", é "mostrar o estado **certo** do que roda".
- **Reforço (varredura 2026-08-10):** segue o cluster mais quente, agora com perda além de
  estado errado — [#85534](https://github.com/anthropics/claude-code/issues/85534) notificação
  de conclusão enfileirada e **nunca entregue** ·
  [#83848](https://github.com/anthropics/claude-code/issues/83848) sub-agents em background
  travam sem texto final e o harness reporta `status:completed` ·
  [#84981](https://github.com/anthropics/claude-code/issues/84981) background tasks mortas por
  SIGTERM num timer interno de exatos 30min ·
  [#82617](https://github.com/anthropics/claude-code/issues/82617) botão Stop mata bg subagents
  de turnos **anteriores** · [#83627](https://github.com/anthropics/claude-code/issues/83627)
  Bash em bg morto quando o sub-agent que o lançou retorna ·
  [#85129](https://github.com/anthropics/claude-code/issues/85129) headless (`-p`) mata
  `run_in_background` no fim do turno ·
  [#81270](https://github.com/anthropics/claude-code/issues/81270) exit 1 reportado como 0 ·
  [#85161](https://github.com/anthropics/claude-code/issues/85161) pede painel de atividade de
  background — o pedido de UI continua vivo e sem resposta oficial.
- **Reforço (varredura 2026-09-05):** o cluster segue, sem mudança de natureza — [#88621](https://github.com/anthropics/claude-code/issues/88621)
  desktop mostra "No output captured" para sub-agent concluído **com o transcript no disco** ·
  [#88622](https://github.com/anthropics/claude-code/issues/88622) pede a atividade do sub-agent (tool calls, comandos, resultados) no painel — é a
  nossa árvore + clique-para-transcript, em outra superfície · [#86082](https://github.com/anthropics/claude-code/issues/86082) sem indicador "needs
  input" na agent view · [#90256](https://github.com/anthropics/claude-code/issues/90256) notificação de conclusão de sub-agent aninhado (depth-2)
  roteada para a raiz e descartada. A decisão de posicionamento continua pendente — mas ganhou
  gatilho externo com o R2 (ver a atualização 2026-09-05 na fila).
- **Atualização (varredura 2026-10-04) — o oficial chegou primeiro no VS Code:** o agent map
  lista shells e tarefas em background com Stop (2.1.278) e mostra a saída de shells/Monitors nos
  cards (2.1.287). O pedido de [#75863](https://github.com/anthropics/claude-code/issues/75863) foi atendido do lado deles; sobram lacunas de UX
  ([#98114](https://github.com/anthropics/claude-code/issues/98114): o pill só aparece quando há sub-agent; [#94611](https://github.com/anthropics/claude-code/issues/94611): o contador "N agents" não
  limpa; [#95622](https://github.com/anthropics/claude-code/issues/95622): a lista não remove os concluídos). Para nós, o item perde sentido **no VS
  Code**; só valeria como paridade no JetBrains ou para sessões do terminal. Reavaliar junto da
  decisão de posicionamento (R2 passo 3), não antes. Antes de qualquer UI nova de background,
  corrigir o estado dos sub-agents assíncronos (**R6**), que é a base de dados disso.

### 25. Mods (function hooks) — nova superfície de extensão do Claude Code · ✅ ponte de dados v1 entregue
- **Origem:** varredura 2026-10-04. A 2.1.287 lançou **Claude Mods** (*"plugins may now modify
  deeper behavior"*): um plugin cujo comportamento vive num módulo de hooks em TypeScript
  (`register(on, options)`, hooks `($, e, next)` que interceptam eventos do engine como
  middleware), com UI própria (Pane ao lado do transcript, banda acima do prompt, status, toast).
  O código dos mods embutidos (`/diff`, `telemetry`, `agents-md`, `sec-default`) e as
  declarações de tipo (`mods/types/claude-code.d.ts`, ~13 mil linhas, escritas pela 2.1.277)
  estão publicados em [`mods/`](https://github.com/anthropics/claude-code/tree/main/mods). **Early access:** só carrega onde
  function hooks estão ligados, a Anthropic pode desligar remotamente e a API muda sem aviso.
- **Por que nos importa — dados ao vivo e exatos, sem heurística:**
  - `$.session.usage()` devolve a janela de contexto **como o statusline a vê** (preenchimento,
    tamanho e a origem do tamanho: `env`, `settings`, `model-default`…), rate limits e custo —
    exatamente o que o item 2 estima por heurística (ver o bug do Fable).
  - `$.agent.list()` lista sub-agents e teammates com `status` (`running`, `completed`, `failed`,
    `killed`…) e `parentId`; `agent.spawn` traz o modelo resolvido; `tool.call` carrega o
    `agentId` do loop; `turn.complete` fecha cada turno com duração e `usage`. Resolveria o R6 e o
    item 20 na fonte.
  - Um usuário já publicou um mod de árvore de agentes para o terminal (**agent-flow**, Apache-2.0,
    citado em [#24537](https://github.com/anthropics/claude-code/issues/24537)) — concorrente direto na superfície do terminal.
- **Limites hoje:** a extensão VS Code **não desenha** UI de mod ([#99045](https://github.com/anthropics/claude-code/issues/99045), [#99401](https://github.com/anthropics/claude-code/issues/99401), [#99423](https://github.com/anthropics/claude-code/issues/99423) —
  abertas, embora o engine aceite a superfície `vscode`); só terminal e a aba Code do desktop. O
  módulo roda sem Node nem DOM, mas tem `$.fs` (leitura/escrita até 4 MiB).
- **Duas ideias:** (a) **ponte de dados** — um mod mínimo que grava `$.session.usage()` e o
  ciclo de vida dos agentes num arquivo por sessão, lido pelo painel como fonte exata quando
  existir (opt-in, mesmo espírito do "statusline bridge" do item 2) — ✅ entregue, ver "Ponte v1
  entregue" abaixo; (b) um mod "Claude Todos" para o terminal — ⏸️, reabrir quando a API sair do
  early access **ou** a extensão VS Code passar a desenhar mods; até lá, só observar a cada
  varredura.
- **🧪 Spike da ponte de dados (2026-10-05, descartável, nada entrou no repo).** Um mod mínimo, sem
  UI, carregado por hot reload de `~/.claude/dev-mods/<sessão>/` numa sessão da **extensão VS Code**
  (Claude Code 2.1.289, Windows 11), gravando num JSON a cada `session.start`, `agent.spawn` e
  `turn.complete`. As três incógnitas:
  1. **Function hooks ligados aqui? Sim.** Os três hooks dispararam. A única porta foi o
     consentimento que o engine pede uma vez por sessão (*"Enable hot reloading for this session?"*).
  2. **Carrega na sessão da extensão VS Code? Sim, sem superfície.** `$.session.surfaces()` = `[]` e
     `session.start` chega com `surface: null`: nada desenha, mas os hooks e o `$` funcionam. Uma
     ponte sem UI cabe; um Pane ou uma banda não apareceriam.
  3. **O id do `$.agent.list()` é o `agentId` do `agent-*.jsonl`? Sim.** O mesmo id em todos os
     pontos: resultado do `agent.spawn` (`agentId`), `turn.complete.agentId`, `$.agent.list()[].id`,
     `toolUseResult.agentId` do `async_launched` e o nome `subagents/agent-<id>.jsonl`. Verificado com
     dois agentes em background (Explore/haiku). A junção ponte↔parser é direta, sem mapeamento.
- **O que mais o spike mostrou:**
  - `$.agent.list()` é um retrato do que está **vivo**: o agente aparece `running`, passa a
    `completed` no `turn.complete` e sai da lista em seguida (o primeiro já não estava listado
    ≤ 76 s depois). A ponte precisa registrar as **transições** (eventos), não confiar num snapshot.
  - `$.session.usage()` sem argumentos (chamada de graça, sem contar tokens) devolveu
    `context { tokens, window: 1000000, percent }`, `rateLimits` (`five_hour` e `seven_day`, cada um
    com `percentUsed` e `resetsAt`), `cost.usd` e `startedAt` (o primeiro lançamento, também em sessão
    retomada). **Rate limits e janela exata são inalcançáveis pelo transcript.**
  - `agent.spawn` traz `background`, `subagentType`, o `tool_use_id` do Agent no transcript e o
    modelo resolvido (`haiku` → `claude-haiku-4-5-20251001`).
- **Pegadinhas para quem for escrever a ponte:**
  - A primeira versão não gravou nada e nenhum erro ficou visível. Duas causas possíveis, as duas
    corrigidas na segunda: o validador (`claude plugin validate`) segue o `$` estaticamente e **só
    aceita passá-lo a funções declaradas no topo do arquivo** (a v1 usava uma closure dentro do
    `register`); e trabalho disparado com `void` **depois** do `return` do hook roda fora do
    dispatch, que já acabou. Aguardar o trabalho dentro do hook (`$` em voo não conta no orçamento).
  - Sem `claude --debug`, `$.ui.log(…, { to: 'debug' })` não aparece em lugar nenhum: gravar o erro
    no próprio arquivo de saída.
  - Na recarga, o `turn.complete` de um sub-agent que terminou ~0,8 s depois do `session.start` não
    chegou ao mod. Hipótese: o engine aguarda o `session.start` do plugin recarregado (o nosso fazia
    I/O ali) antes de lhe entregar outros eventos. Manter o `session.start` leve.
  - O próprio aviso de hot reload entra no transcript como `attachment` `queued_command` com
    `commandMode: "task-notification"` e texto livre, sem `<task-notification>`. O coletor do R6 o
    ignora porque exige esse prefixo; nada mais no parser lê `queued_command`.
- **Recomendação do spike:** a ponte (ideia a) é **viável**, e as incógnitas técnicas estão
  resolvidas. O que ainda segura é **distribuição e early access**: hoje o mod só carregou por hot
  reload (consentimento por sessão). Falta validar como um usuário comum o instalaria (plugin num
  marketplace ou `--plugin-dir`) e se function hooks estão ligados fora desta conta. O maior ganho
  seriam os rate limits e a janela exata (item 2) e o fim exato de cada sub-agent (R6), com o parser
  continuando como fonte de verdade e a ponte só enriquecendo quando existir. Se for adiante, vira
  spec própria.
- **✅ Ponte v1 entregue:** o mod `claude-todos-bridge`, instalado pela extensão via
  `CLAUDE_CODE_PLUGIN_DIRS`, grava a janela exata, os limites de 5h e 7 dias, o fim exato de
  sub-agents e turnos; o aviso de ociosidade sai no fim do turno. Spec
  `docs/specs/2026-10-06-ponte-de-dados-mod-design.md`, plano
  `docs/plans/2026-10-06-ponte-de-dados-mod.md`. Fora da v1: custo, `failed`/`killed` na UI,
  aviso de "esperando permissão", marketplace. A ideia (b), um mod "Claude Todos" para o
  terminal, segue ⏸️.
- **⏳ Pendências da v1** (revisões de 2026-10-06; nenhuma impede o uso):
  - **Verificação manual de ponta a ponta** ainda não feita: o roteiro de 10 passos está no plano
    (Task 10, Step 5), para VS Code e JetBrains.
  - **Mod** (`mod/claude-todos-bridge/hooks/register.ts`, `src/bridgeMod/state.ts`):
    - a fila de gravações (`record()`) não tem timeout: um `$.fs.write` pendurado segura as
      seguintes (só o `session.end` tem teto);
    - id ou pasta inválidos fazem o hook voltar sem log, e qualquer erro de leitura conta como
      arquivo ausente: uma falha passageira depois de uma recarga recomeça o estado;
    - `normalizeUsage({})` devolve leitura vazia e apaga a anterior (o comentário promete
      `undefined`, e o `if (normalized)` do `parseBridgeFile` fica morto);
    - `agentEnd` sem `reason` herda o `reason` do fim anterior;
    - `SAFE_ID` só vale na leitura: um id com `@` (teammate) é gravado e some na leitura, e
      `__proto__` passa pelo filtro e troca o protótipo de `agents`;
    - o teto de 500 agentes só se aplica em `spawn` e `agentEnd`: um arquivo lido com 600 devolve
      os 600;
    - o parse aceita `usage.at` absurdo, que vence o `latestRateLimits` de todas as sessões até o
      `prune`, e não deduplica `kind` (o painel já tolera; endurecer é opcional);
    - erros de tipo do `register.ts` só aparecem no `claude plugin validate` do release; a suíte
      checa só a sintaxe.
  - **Instalação** (`src/services/bridgeModInstaller.ts`):
    - `install()` lê o `settings.json`, copia o mod e só então grava: uma escrita de terceiros
      nesse intervalo se perde (reler antes de gravar);
    - `uninstall()` lança `ENOTEMPTY` se um arquivo do mod estiver aberto, depois de já ter tirado
      a entrada do `settings.json` (tolerar a falha da pasta);
    - o memo do `status()` guarda o "não instalado" de um erro de leitura passageiro
      (`EBUSY`/`EPERM`) até o `settings.json` mudar; não memorizar quando o erro não for
      `SettingsParseError`;
    - `status()` exige o `plugin.json`: com a pasta sem manifesto, o `refresh` não repara e o
      `install` devolve `changed: false`;
    - a cópia nunca apaga arquivos que saíram do pacote, e o `refresh` não compara versão: dois
      IDEs em versões diferentes regravam o mod um do outro;
    - a validação do `env` duplica a de `claudeSettings.ts`.
  - **Leitura, snapshot e painel** (`bridgeLive`, `snapshotService`, `sessionNotifier`, webview):
    - o botão Atualizar (`claudeTodos.refresh` e a mensagem `refresh` no VS Code, o `getSnapshot`
      do sidecar no JetBrains) não descarta o memo dos limites: com um evento perdido do
      `fs.watch`, mostra até 60 s de limites velhos (um `SessionCore.refresh()` que chame
      `invalidate()` resolve);
    - um erro de leitura passageiro (`EBUSY`/`EPERM`) num arquivo de `live/` vira "arquivo
      inválido" até a próxima gravação (separar leitura de parse); `schema` diferente de 1 cai no
      mesmo caminho, hoje inalcançável;
    - o cache por mtime e tamanho não vê uma regravação do mesmo tamanho no mesmo tique do relógio
      quando há leitura no meio (só em sistema de arquivos de 1–2 s ou com leitura fora do
      watcher);
    - com o mod desativado e um arquivo antigo em `live/`, o contexto pode sair com origem `mod` e
      o rodapé em "Ativar" (conferir);
    - `bridgeTurnEndedAt` relê o registro de processos que o snapshot já leu;
    - o aviso pela ponte pode sair só no tick de 10 s quando a última linha do transcript e a
      gravação em `live/` caem na mesma janela de 150 ms (aceito pela spec);
    - sem `<svelte:boundary>` no `App`: outra exceção de render no `UsageTable` ainda derruba o
      painel;
    - "lido às 06/10 03:05" lê mal em pt-BR e es quando a leitura não é de hoje;
    - o botão do rodapé tem nome acessível só "Ativar"/"Desativar" (falta `aria-describedby` com
      o estado);
    - o `margin-bottom: 0.6rem` do bloco de limites não preserva o respiro de 0.4rem, e o
      `nowrap` de nome e reinício pode espremer a barra numa sidebar estreita.
  - **Hosts** (VS Code e JetBrains): o toast de sucesso é igual com e sem mudança;
    `bridgeMod.failed` atribui toda falha ao `settings.json`; os comandos aparecem sempre na
    paleta; o rótulo do botão do diálogo (decisão 8) não tem guarda automática; o KDoc do
    `MessageRouter` não lista os pedidos novos.
  - **Build e release:** `npm run test:watch` quebra num clone novo (falta um `pretest:watch` que
    gere o módulo do mod); o `--out` do gerador sem valor, ou como `--out=x`, é ignorado em
    silêncio, resolve relativo à raiz, não limpa o destino e não tem teste; `dist/mod` e
    `dist/bridge-smoke` podem entrar num `vsce package` local (faltam no `.vscodeignore`); o
    `RELEASING.md` valida o mod depois do `npm version`, e deveria validar antes do bump.
  - **Docs:** o CHANGELOG e o diálogo de instalação dizem que a pasta `mod/` vai para
    `CLAUDE_CODE_PLUGIN_DIRS`, mas a entrada real é `mod/claude-todos-bridge`; a linha de `live/`
    nos READMEs fala em "início e fim" (o arquivo guarda só o `at` do último evento) e não diz
    que `rateLimits` guarda qualquer `kind`; "apagados após 30 dias" só vale com a extensão
    instalada, e a remoção manual não cita `live/`; a limitação "a ponte não respondeu" não cita
    um Claude Code anterior aos Mods como causa; um link `todosParser.ts#L365` da spec ficou
    deslocado.
  - **Testes:** casos de borda sem teste no parse (`engineVersion`, `turn`, opcionais do agente,
    `parentId`, `resetsAt`), no teto de agentes (não distingue o evento mais recente do último
    inserido), nos ramos de cache do leitor (arquivo apagado, recuperação depois de meia
    gravação) e na guarda `SAFE_SESSION_ID`, no estado `silent` (60 000 exato,
    `startedAt === installedAt`, `installedAt` ausente), no filtro de `resetsAt`, no caminho
    rápido do notifier e no `bridgeTurnEndedAt`; no instalador, `env` não-objeto,
    `install.json` e `splitPluginDirs` sem teste direto; o empate do `mergeLifecycles` (o
    transcript vence) não é observável; o teste de `live/` do watcher não discrimina no Windows;
    o fluxo dos hosts (confirmar, agir, atualizar) não tem teste automatizado, e o teste de erro
    do dispatcher usa `Error` genérico e só exercita o instalar; os testes Kotlin não cobrem o
    desinstalar, o toast de desinstalado nem a falha de instalação; o painel não tem teste de
    template (o vitest roda sem jsdom); os horários não têm caso para meia-noite, fuso e es/zh, e
    a paridade do i18n não confere `{time}`; 20 limpezas de pasta temporária sem retentativa em 14
    outros arquivos de teste; ruído do vitest no Windows ("Timeout terminating forks worker",
    `kill EPERM`) sem causa conhecida.
  - **Polimento:** `prune()` repete o corpo de `invalidate()`; comentário defasado em
    `sessionNotifier.ts:95`; marcações "Review Focus" nos testes; `'live'` e
    `'.vscode-todos-bridge'` repetidos em vez de constantes; `resolver` e `installed` duplicados
    e um `const window` que sombreia o global no snapshot; o `SnapshotService` com 8 parâmetros
    posicionais; `Map` vazio em vez de `undefined`; o comentário do `mergeLifecycles` (R6) não
    cita a ponte; o leitor guarda cache e última leitura boa em mapas paralelos; uma variável
    local `settings` convive com `this.settings` no instalador.
  - **Ferramenta:** o `shoot.sh` da skill `preview-webview` não isola o perfil do navegador.

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

### R2. Ferramentas de task desligadas por padrão nos modelos novos (2.1.233) 🔥 MATERIALIZADO — 📐 prioridade máxima
- **Origem:** varredura 2026-07-25. **Onze** issues abertas entre 21 e 23/07 reportando que
  `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` **e** `TodoWrite` deixaram de ser expostas ao
  modelo: [#80210](https://github.com/anthropics/claude-code/issues/80210) (7 comentários),
  [#80015](https://github.com/anthropics/claude-code/issues/80015),
  [#80401](https://github.com/anthropics/claude-code/issues/80401),
  [#80129](https://github.com/anthropics/claude-code/issues/80129),
  [#80160](https://github.com/anthropics/claude-code/issues/80160),
  [#80215](https://github.com/anthropics/claude-code/issues/80215),
  [#80487](https://github.com/anthropics/claude-code/issues/80487),
  [#79695](https://github.com/anthropics/claude-code/issues/79695),
  [#79836](https://github.com/anthropics/claude-code/issues/79836),
  [#79900](https://github.com/anthropics/claude-code/issues/79900),
  [#80151](https://github.com/anthropics/claude-code/issues/80151).
- **Por que nos importa:** é a nossa **única matéria-prima**. Se o agente não chama `TodoWrite`
  nem `TaskCreate`, o painel não tem o que mostrar — e o usuário culpa a extensão, não o gate.
- **Causa apontada:** flags de remote config (GrowthBook) — #80487 detalha `tengu_vellum_ash`
  contendo `["claude-opus-4-8","claude-sonnet-5","claude-fable-5"]` com **teste por substring**,
  e #80151 aponta `tengu_shale_finch`. Ou seja: **gate por conta/modelo, não por versão** — não
  dá para prevenir do nosso lado nem detectar por número de versão.
- **✅ Verificado localmente (2026-07-25):** aqui as ferramentas **continuam funcionando** —
  21 de 23 transcripts dos últimos 7 dias contêm `TodoWrite`/`TaskCreate`, incluindo sessões
  `claude-fable-5` com 32, 40 e 34 chamadas. Confirma que o gate é por conta/flag, **não**
  universal. Nenhuma ação de código necessária agora.
- **O que fazer:** monitorar na próxima varredura. Se escalar, a mitigação é de **UX, não de
  parser**: o estado vazio precisa distinguir "sessão sem tasks" de "ferramenta indisponível
  nesta sessão" — hoje o item 10 mostra "Sessão ativa — aguardando tasks", que ficaria
  enganoso. O bloco de tokens/contexto/cache continua funcionando nesse cenário (foi
  justamente o desacoplamento do item 10), então o painel não fica inútil.
- **🔥 Materializou (verificado 2026-09-05).** Não era mais gate por conta: a **2.1.233**
  (publicada 2026-08-14) desligou `TodoWrite` e `TaskCreate/Get/Update/List` **por padrão** para
  Opus 4.8, Sonnet 5, Fable 5, Mythos 5 e mais novos. Entrada literal do CHANGELOG: *"Todo/task-tracking
  tools (TaskCreate/Get/Update/List, TodoWrite) are no longer available on Opus 4.8, Sonnet 5,
  Fable 5, Mythos 5, and newer models; set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` to bring them
  back"*. O mantenedor (bcherny) reproduziu e classificou em [#86929](https://github.com/anthropics/claude-code/issues/86929) (2026-08-15): *"This is
  intended today, not a bug"* — modelos antigos mantêm as ferramentas, a env var restaura em
  qualquer modelo; admite que a mensagem do modelo ("TaskCreate is missing") parece quebra e
  promete documentar a var fora do changelog. **Issue canônica:** [#80015](https://github.com/anthropics/claude-code/issues/80015) (aberta, 12
  reações, 12 comentários, última atividade 2026-08-26 — usuários pedindo reversão; #80160 e
  #86929 fechadas como duplicatas dela). Relacionadas: [#88649](https://github.com/anthropics/claude-code/issues/88649), [#86668](https://github.com/anthropics/claude-code/issues/86668), [#86269](https://github.com/anthropics/claude-code/issues/86269) (desktop
  renderiza `Task*` como linha vazia), [#92178](https://github.com/anthropics/claude-code/issues/92178) (2.1.260, Opus 5: "TodoWrite is unavailable"),
  [#80305](https://github.com/anthropics/claude-code/issues/80305) (5 reações, a var antiga `CLAUDE_CODE_ENABLE_TASKS` sem efeito), [#89049](https://github.com/anthropics/claude-code/issues/89049) (pede
  um sinal para detectar quando a disponibilidade padrão de uma ferramenta muda — cita a 2.1.233
  como exemplo).
- **Evidência local (2026-09-05, `~/.claude/projects`, últimos 30 dias)** — chamadas de
  `TodoWrite` por versão do harness que gravou a linha:

  | versão | 2.1.203 | 2.1.214 | 2.1.218 | 2.1.220 | 2.1.221 | 2.1.224 | 2.1.226 | 2.1.227 | 2.1.229 | 2.1.232 | **≥ 2.1.233** |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | `TodoWrite` | 22 | 6 | 12 | 140 | 2 | 13 | 69 | 20 | 29 | 13 | **0** |

  Corte limpo na fronteira. A sessão desta análise (2.1.240/2.1.261, Opus 5 + Fable 5.1) não
  tem **nenhuma** ferramenta de task no roster; `~/.claude/tasks/` **não existe** nesta máquina.
  O CLI instalado (2.1.219) ainda é pré-corte, mas a extensão VS Code oficial já grava com
  2.1.261 — e é ela que alimenta o painel.
- **Impacto:** a "lista de todos" — o nome da extensão — perde a fonte no fluxo padrão de
  qualquer usuário com modelo atual. **Não** afeta: árvore de agentes (13), tokens/contexto/
  cache (2/3/6/16), notificações (14), perguntas pendentes (22/22-ext), badge de modelo (20),
  sessões vivas (5a). O painel continua útil — mas o usuário novo abre a extensão, vê
  "aguardando tasks" para sempre e culpa a extensão.
- **Mitigação disponível hoje:** `~/.claude/settings.json` aceita a chave `env`, que o harness
  aplica às sessões (o CHANGELOG cita o `env` do settings.json em várias entradas; este ambiente
  já usa `"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}`). Basta acrescentar
  `"CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"`. É o caminho que o mantenedor aponta e foi
  **verificado aqui** (passo 0, abaixo).
- **Passo 0 — ✅ verificado em 2026-09-05** (binário 2.1.261 embutido na extensão oficial, modelo
  Fable 5.1, `-p` em cwd de rascunho, ambiente da sessão limpo):

  | Teste | Flag | Resposta | `tool_use` no `.jsonl` |
  |---|---|---|---|
  | A | nenhuma | `NO_TASK_TOOLS TaskOutput TaskStop` | nenhum |
  | B | `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` no ambiente do processo | `DONE` | `ToolSearch` → `TaskCreate` ×2 |
  | C | só `env` do `~/.claude/settings.json` | `DONE` | `ToolSearch` → `TaskCreate` ×2 |
  | D | `env` do settings.json **+** `CLAUDE_CODE_ENABLE_TASKS=0` (o que a extensão injeta) | `DONE` | `ToolSearch` → `TodoWrite` ×1 |

  Prova final: a sessão desta análise, rodando **dentro da extensão oficial**
  (`CLAUDE_CODE_ENTRYPOINT=claude-vscode`), recebeu `TodoWrite` no roster de ferramentas assim
  que a chave entrou no settings.json, sem reiniciar. Três achados para o passo 1: (1) o `env`
  do settings.json vale na extensão, como os READMEs afirmam; (2) as ferramentas voltam como
  **deferred** — o modelo as carrega via `ToolSearch` quando decide criar tasks — então mesmo
  com a flag ligada a lista só aparece quando o agente a cria, e o estado vazio precisa
  continuar dizendo "aguardando"; (3) o **esquema depende do ambiente**: com
  `CLAUDE_CODE_ENABLE_TASKS=0` (extensão) vem `TodoWrite`, sem ela vem `TaskCreate` — o
  `todosParser` já trata os dois (`detectSchema`). A flag ficou **ligada** neste ambiente
  (backup do settings.json no scratchpad da sessão). Script reproduzível: `run_ptest.sh` no
  scratchpad — não versionado; portar para `scripts/` se o teste virar rotina de release.
- **Plano (📐 a especificar — passa na frente de qualquer feature):**
  1. **Estado vazio inteligente:** ✅ implementado em 2026-09-05, publicado na **0.19.0** (2026-09-07) — spec
     [docs/specs/2026-09-05-task-tools-off-empty-state-design.md](specs/2026-09-05-task-tools-off-empty-state-design.md),
     plano [docs/plans/2026-09-05-task-tools-off-empty-state.md](plans/2026-09-05-task-tools-off-empty-state.md).
     Distinguir "sessão sem tasks" de "ferramentas de task
     desligadas nesta sessão". Sinal disponível no transcript: `version` ≥ 2.1.233 + `model`
     da última mensagem em família nova + ausência de qualquer `TodoWrite`/`TaskCreate`.
     Mensagem com a correção a um clique: botão que grava `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`
     no `settings.json` do usuário (opt-in explícito, mostrando o que vai mudar) ou instrução
     copiável. Sem isso, o item 10 ("Sessão ativa — aguardando tasks") vira mentira.
     **Lacunas conhecidas (revisão final do branch, 2026-09-05):** (a) a dica **não aparece em
     sessões que já dispararam sub-agents** — o parser lista todo `agent-*.jsonl` mesmo sem
     tasks, então `agents.length > 0` e o ramo do estado vazio não roda; o painel mostra a
     árvore com listas vazias e sem explicação. (b) A flag lida do **ambiente do processo do
     IDE** pode divergir do shell do usuário (VS Code aberto pela GUI sem o `export` do rc):
     falso positivo que o próprio botão corrige. Candidatas à próxima iteração do estado vazio
     ou ao passo 3 (posicionamento).
  2. **Onboarding/README/walkthrough (item 18):** ✅ **README feito em 2026-09-05** nos 5 idiomas —
     callout no topo, subseção "Ative as ferramentas de tasks" em Instalação (JSON do
     `settings.json` + links para CHANGELOG/#86929/#80015), bullet em Requisitos e em Limitações
     conhecidas; paridade de 11 seções preservada (a landing extrai por índice — `tests/site`
     verde). Pendências, em ordem de impacto:
     - [x] **Walkthrough** ✅ 2026-09-06 (`package.json` → `contributes.walkthroughs[0].steps`): passo novo
       `enableTaskTools` entre `installHook` e `startSession`, com o JSON do `settings.json` e
       um botão que abre o arquivo (`vscode.open` em `~/.claude/settings.json`); chaves
       `walkthrough.enableTaskTools.title/description` nos 5 `package.nls*.json` e o mesmo
       esquema de mídia dos passos atuais. É o primeiro lugar que o usuário novo vê — hoje o
       guia leva até "Explore a árvore" sem nunca citar a flag.
     - [x] **Descrição do plugin JetBrains** ✅ 0.18.0 (`jetbrains/src/main/resources/META-INF/plugin.xml`,
       `<description>` em EN + zh-cn): uma frase "On Claude Code 2.1.233+ set
       `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` in `~/.claude/settings.json` to get the task list" com
       link para a seção do README. A página do JetBrains Marketplace **não** mostra o README;
       só vale com release do plugin (`changeNotes` no `build.gradle.kts` aponta para o GitHub
       Releases — as notas do release também devem citar a flag).
     - [ ] **Descrição curta do marketplace / Open VSX** (`extension.description` nos 5
       `package.nls*.json`): avaliar se cabe uma menção sem estourar o limite de caracteres da
       listagem; se não couber, deixar só no README (que é a página da extensão nas duas lojas).
  3. **Decidir posicionamento:** a mudança **acelera** a tese da seção "Apostas de produto" —
     o ecossistema foi de "um agente com todos" para orquestração, e o que sobra sem a flag é
     exatamente o que já fazemos de observability (agentes, tokens, notificações, perguntas).
     Avaliar reposicionar o pitch (não necessariamente o nome) para "observability" com a lista
     de tasks como recurso opt-in. É a decisão que os itens 8 e 23 esperavam.
  4. **Comentar em #80015** com disclosure — a extensão mostra a lista com a flag ligada e o
     estado vazio explica o porquê — **só depois** do passo 1 entregue. **Decisão 2026-09-06:**
     publicar **depois da 0.19.0** (a release que leva o botão), citando a versão. **✅ Publicado em
     2026-09-07**, com o texto abaixo, logo após a 0.19.0 chegar às três lojas:
     [issuecomment-5572982980](https://github.com/anthropics/claude-code/issues/80015#issuecomment-5572982980).
     > Disclosure: I maintain Claude Todos, an open-source VS Code/JetBrains panel that reads the
     > task list from the transcripts Claude Code writes, so this change hit us directly. Data
     > points: (1) verified on 2.1.261 — no flag → a fresh session on Opus 5 / Fable 5 has only
     > `TaskOutput`/`TaskStop`; `"env": { "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1" }` in
     > `~/.claude/settings.json` brings the tools back on any model, including sessions started
     > by the VS Code extension (a running session picked them up without restart); (2) they come
     > back as deferred tools (loaded via `ToolSearch`) and the schema depends on the env:
     > `CLAUDE_CODE_ENABLE_TASKS=0` (set by the VS Code extension) → `TodoWrite`, otherwise
     > `TaskCreate`/`TaskUpdate`; (3) +1 on documenting the env var outside the changelog. Until
     > then our panel detects the state and offers a one-click switch that writes that key after
     > a confirmation (README section "Turn the task tools back on", v0.19.0).
  5. **Monitorar** se a Anthropic entrega o que prometeu ("have Claude explain that the task
     list is off for this model", documentar a var) ou reverte sob pressão.
- **Atualização (varredura 2026-10-04):**
  - **A regra virou lista de permissão (2.1.268):** *"Changed the task-tracking tools
    (TaskCreate/Get/Update/List, TodoWrite) to be offered only on Claude 3.x, Opus 4.0–4.7, Sonnet
    4.0–4.6, Haiku 4.5; set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` elsewhere"*. O nosso
    `modelLosesTaskTools` ([taskToolsGate.ts:13](../src/services/taskToolsGate.ts#L13)) ainda é
    lista de bloqueio (famílias novas + major ≥ 5) e acerta todos os modelos vistos no disco (Opus
    4.6–4.8, Opus 5/5.5, Sonnet 5/5.5, Fable 5/5.1, Haiku 4.5). Só diverge num id desconhecido
    (gateway, modelo custom) ou num 4.x novo (ex. `sonnet-4-7`): o harness desliga e nós não
    avisamos. Espelhar a lista de permissão é barato; baixa prioridade.
  - **Passo 5 (monitorar):** nenhuma reversão e nenhuma resposta oficial em #80015 (16 reações,
    17 comentários, o último em 09-11 — usuários perguntando se alguém da Anthropic respondeu;
    *"TODOs are not just for agents… a great way for me as a human to track what work remains"*).
    A 2.1.286 corrigiu sub-agents em foreground perdendo as task tools **com a flag ligada**: a
    Anthropic mantém o caminho da flag. [#93675](https://github.com/anthropics/claude-code/issues/93675) pede uma chave de settings e um aviso no
    `/doctor` (o `env` do settings.json funcionou para o autor, mas *"nothing in the settings
    documentation says this variable is honored there"*). [#95227](https://github.com/anthropics/claude-code/issues/95227): a webview oficial **não
    renderiza** a lista `Task*`, só as linhas cruas — validação direta do painel.
  - **Verificado no disco:** com a flag ligada aqui, `TodoWrite` aparece em todas as versões de
    2.1.261 a 2.1.287 (Opus 5.5, Sonnet 5.5, Fable 5.1). As lacunas (a) e (b) do passo 1 seguem
    abertas.

### R3. Integridade do transcript — a fonte de dados está ficando menos confiável ⚠️ monitorar
- **Origem:** varredura 2026-07-25. Cluster grande e novo de perda/corrupção do `.jsonl`:
  - **Transcript apagado:** [#79298](https://github.com/anthropics/claude-code/issues/79298)
    (`data-loss`) o `.jsonl` é **reescrito como stub só-metadados** no resume ·
    [#78821](https://github.com/anthropics/claude-code/issues/78821) transcript do orquestrador
    deletado com o diretório `<UUID>/subagents/` preservado ·
    [#78578](https://github.com/anthropics/claude-code/issues/78578) a extensão oficial
    **hard-deleta** o transcript no update/restart · [#79122](https://github.com/anthropics/claude-code/issues/79122)
    limpeza de retenção de 30 dias apaga conteúdo de sessões com aba aberta.
  - **Escrita incompleta:** [#80434](https://github.com/anthropics/claude-code/issues/80434),
    [#80662](https://github.com/anthropics/claude-code/issues/80662),
    [#80459](https://github.com/anthropics/claude-code/issues/80459),
    [#80136](https://github.com/anthropics/claude-code/issues/80136),
    [#78550](https://github.com/anthropics/claude-code/issues/78550) — texto do assistente não
    persistido no JSONL ("mute windows"); note que #80459 é justamente o texto que acompanha um
    `AskUserQuestion`/`ExitPlanMode`, os tool_use do item 22.
  - **Nem sempre é gravado:** [#78843](https://github.com/anthropics/claude-code/issues/78843)
    com `CLAUDE_CONFIG_DIR` custom não sai JSONL nenhum ·
    [#78940](https://github.com/anthropics/claude-code/issues/78940) `/cd` no meio da sessão
    racha o transcript entre dois project dirs.
- **Nosso estado:** somos **read-only** e derivamos tudo do arquivo — degradamos naturalmente
  (menos dados = menos exibição, não crash). O risco real é de **percepção**: transcript
  truncado vira painel "errado" aos olhos do usuário.
- **✅ Verificado (2026-07-25):** o layout `<UUID>/subagents/agent-*.jsonl` citado em #78821 é o
  **atual em disco** (zero `agent-*.jsonl` soltos no diretório do projeto) e já é o que lemos —
  [transcriptPaths.ts:29](../src/services/transcriptPaths.ts#L29) e
  [projectUsageService.ts:77](../src/services/projectUsageService.ts#L77). Sem ação.
- **A avaliar:** `CLAUDE_CONFIG_DIR` custom (#78843) — assumimos `~/.claude` em vários pontos;
  respeitar a env var é barato e cobre esses usuários. Já existe como follow-up no ledger do
  item 24 (*"`resolveClaudeDir` do VS Code consultar `CLAUDE_CONFIG_DIR`"*); esta issue é a
  evidência externa de que vale priorizar. 🔍
- **Reforço (varredura 2026-08-10)** — dois sub-temas distintos:
  - **Retenção de 30 dias virou revolta:** [#82084](https://github.com/anthropics/claude-code/issues/82084)
    transcripts deletados sem aviso nem recuperação ·
    [#84279](https://github.com/anthropics/claude-code/issues/84279) "meses de histórico
    destruídos silenciosamente" · [#83019](https://github.com/anthropics/claude-code/issues/83019)
    o diretório fica **fora** da cobertura típica de backup e ainda auto-deleta ·
    [#81946](https://github.com/anthropics/claude-code/issues/81946) pede transcripts portáveis
    por projeto. Para nós é o mesmo recado do #79122: a fonte tem prazo de validade — o
    dashboard 7 dias está confortavelmente dentro, mas qualquer feature futura de histórico
    longo (item 8) precisa assumir horizonte de 30 dias.
  - **"Dados intactos, índice perdido":** [#83730](https://github.com/anthropics/claude-code/issues/83730)
    sidebar esvaziado após reinstall com `--resume` funcionando ·
    [#85209](https://github.com/anthropics/claude-code/issues/85209) idem com dados locais
    intactos · [#83164](https://github.com/anthropics/claude-code/issues/83164) sessões somem
    do sidebar em modo Gateway · [#83826](https://github.com/anthropics/claude-code/issues/83826)
    projeto some após crash com dados no disco. O painel nativo depende de um índice próprio
    que dessincroniza do disco; nós listamos **direto dos `.jsonl`** — imunes a essa classe
    inteira. Argumento de divulgação, mesmo padrão do item 20.
- **Reforço (varredura 2026-09-05)** — quatro sub-temas, dois deles **riscos nossos**:
  - **⚠️ Risco nosso — a extensão oficial mexe no mtime:** [#87900](https://github.com/anthropics/claude-code/issues/87900) (`platform:vscode`,
    `has repro`) o indexer da extensão oficial anexa um record `last-prompt` a transcripts
    antigos no startup e **bumpa o mtime** de sessões paradas. Nós usamos mtime como sinal de
    atividade em [projectUsageService.ts:71](../src/services/projectUsageService.ts#L71) (janela
    do dashboard) e em [sessionNotifier.ts:41](../src/services/sessionNotifier.ts#L41) (detecção
    de mudança → toast). Hipótese a testar: no boot do VS Code, sessões velhas entram no
    dashboard de 7 dias e/ou disparam notificação falsa. Confirmado no disco: o transcript da
    sessão desta análise já tem 10 records `last-prompt`, além de `ai-title`, `atis-latch`,
    `bridge-session`, `queue-operation`, `mode` e `file-history-snapshot` — o `.jsonl` deixou de
    ser só conversa. Paralelo no desktop: [#89871](https://github.com/anthropics/claude-code/issues/89871) `lastActivityAt` gravado para um turno que
    nunca aconteceu, sessão morta ordenada acima das vivas.
    **✅ Corrigido em 2026-09-06.** Medido no disco: 26 de 42 transcripts com mtime nos últimos
    30 dias tinham o mtime mais de 1 h depois da última mensagem (11 com mais de 7 dias); a
    última linha era sempre metadado **sem `timestamp`** (`bridge-session`, `mode`,
    `last-prompt`, `ai-title`, `atis-latch`, `pr-link`). Correção: o sinal de atividade passou a
    ser o `timestamp` da última mensagem `user`/`assistant`
    ([transcriptActivity.ts](../src/services/transcriptActivity.ts): leitura da cauda do
    arquivo memoizada por mtime+size, fallback mtime) nos três consumidores — ordenação e
    escolha do picker, janela do dashboard de 7 dias e notifier. `AgentTodos.updatedAt` do
    main segue mtime (sem consumidor no webview).
  - **⚠️ Risco nosso — stubs vazios e records não-conversa:** [#85892](https://github.com/anthropics/claude-code/issues/85892) (`platform:vscode`) o
    "teleport" da extensão oficial cria stubs de sessão com `messageCount: 0` que sombreiam
    sessões reais — checar se o nosso picker os lista · [#90002](https://github.com/anthropics/claude-code/issues/90002) (**15 comentários**) a aba
    Code grava metadados de render (`start_timestamp`/`stop_timestamp`/flags) **dentro** do
    JSONL e a sessão fica irrecuperável (API 400) — mais um tipo de linha que o parser precisa
    ignorar sem tropeçar · [#88274](https://github.com/anthropics/claude-code/issues/88274) bloco de texto do assistente **omitido** do transcript
    quando seguido de thinking intercalado antes de um tool_use (família das "mute windows").
  - **Validação do R5:** [#87303](https://github.com/anthropics/claude-code/issues/87303) (`COMPLETED`) descreve exatamente a replicação do `usage`
    por content block que o dedupe por `requestId` já resolve
    ([usageParser.ts:104](../src/services/usageParser.ts#L104)) — a correção oficial não muda
    nada para nós.
  - **Retenção e índice, sem novidade de natureza:** [#87748](https://github.com/anthropics/claude-code/issues/87748), [#85743](https://github.com/anthropics/claude-code/issues/85743), [#86730](https://github.com/anthropics/claude-code/issues/86730)
    (`cleanupPeriodDays` apagou 58 de 69 transcripts) — a revolta continua · [#87423](https://github.com/anthropics/claude-code/issues/87423),
    [#87710](https://github.com/anthropics/claude-code/issues/87710), [#91017](https://github.com/anthropics/claude-code/issues/91017) (índice travado desde abril), [#91433](https://github.com/anthropics/claude-code/issues/91433) e [#89740](https://github.com/anthropics/claude-code/issues/89740)
    (`platform:vscode`, 7 comentários: o painel de histórico da extensão oficial não lista
    sessões locais **intactas no disco**) — a classe "dados intactos, índice perdido" agora tem
    caso na nossa superfície; listamos direto do disco, imunes.
- **Reforço (varredura 2026-10-04)** — nenhum risco novo nosso confirmado; quatro sub-temas:
  - **A fonte some ou muda de lugar:** [#98642](https://github.com/anthropics/claude-code/issues/98642) o desktop passou a **apagar o transcript
    local** ao deletar uma sessão do sidebar; [#96013](https://github.com/anthropics/claude-code/issues/96013) pede guardar os transcripts **dentro do
    projeto** em vez de `~/.claude/projects/<slug>` — se a Anthropic aceitar, a nossa resolução
    de project dir quebra (observar); [#96018](https://github.com/anthropics/claude-code/issues/96018) `claude project mv`; [#99068](https://github.com/anthropics/claude-code/issues/99068) Cowork mantém só o
    último transcript pós-compactação; [#97237](https://github.com/anthropics/claude-code/issues/97237) transcript gravado com o path em vez do session
    id (POSIX com symlink).
  - **Escrita incompleta (família "mute windows"):** [#97665](https://github.com/anthropics/claude-code/issues/97665) (9 comentários) o record final do
    segmento preservado nunca é gravado no transcript do sub-agent; [#96950](https://github.com/anthropics/claude-code/issues/96950) e [#98564](https://github.com/anthropics/claude-code/issues/98564) texto do
    assistente some do transcript; [#97316](https://github.com/anthropics/claude-code/issues/97316) últimas mensagens não gravadas depois do `/compact`.
  - **Stubs e índice:** [#94808](https://github.com/anthropics/claude-code/issues/94808) o handoff interativo → background segue deixando `.jsonl` só
    com título (2.1.270–2.1.273) — checar se o nosso picker os lista; #85892 foi fechada
    `NOT_PLANNED` em 09-09. "Dados intactos, índice perdido" continua ([#94253](https://github.com/anthropics/claude-code/issues/94253), [#95252](https://github.com/anthropics/claude-code/issues/95252),
    [#94700](https://github.com/anthropics/claude-code/issues/94700), [#97894](https://github.com/anthropics/claude-code/issues/97894), [#98056](https://github.com/anthropics/claude-code/issues/98056), [#98761](https://github.com/anthropics/claude-code/issues/98761), [#96135](https://github.com/anthropics/claude-code/issues/96135)) — imunes. O `sessions-index.json` citado em
    #95252 existe em alguns project dirs daqui, mas parado desde fevereiro: não serve de fonte.
  - **Records novos no disco (só metadados):** `relocated`, `worktree-state`, `cost-state`,
    `frame-link`, `file-history-delta`, `artifact-*`. Verificado: uma sessão que entra num
    worktree continua gravando no project dir **original** (o `relocated` só anota a cwd nova). O
    parser ignora tipos desconhecidos; sem ação.
    **⚠️ Corrigido em 2026-10-05 — depende do caminho:** a sessão que implementou o R6 entrou
    num worktree novo com `EnterWorktree` (2.1.28x), e o transcript **inteiro** (6 MB, desde o
    início da sessão) e os sub-agents passaram para o project dir do worktree
    (`…-claude-todos-vscode--claude-worktrees-r6-fable`); o project dir original ficou sem a
    sessão. A de 2026-10-04 (`96adbae3`, worktree já existente) tinha ficado no original.
    **Risco nosso a investigar:** enquanto uma sessão trabalha num worktree, o painel do
    workspace principal não a enxerga — justamente o fluxo de SDD em worktree. Conferido no
    mesmo dia: no `ExitWorktree` o transcript e os sub-agents **voltam** para o project dir
    original (o do worktree fica vazio). O risco se limita ao período dentro do worktree, que
    numa execução de plano é a maior parte do trabalho. Candidato: o painel também procurar a
    sessão no project dir dos worktrees do workspace (`.claude/worktrees/*`).

### R4. Performance com transcripts grandes — agora com evidência externa 🔍 a avaliar
- **Origem:** o tema era preocupação interna sem issue; a varredura 2026-07-25 trouxe evidência
  de que o problema é real no lado oficial: [#78449](https://github.com/anthropics/claude-code/issues/78449)
  (`COMPLETED`) **crash do renderer (SIGBUS)** ao abrir projetos com transcripts grandes ·
  [#79042](https://github.com/anthropics/claude-code/issues/79042) sessões grandes retomadas com
  scrollback truncado · [#78825](https://github.com/anthropics/claude-code/issues/78825) Remote
  Control falha em transcript grande.
- **Conecta com:** a R-perf do item 2, ✅ entregue no R5 (2026-08-11): o transcript principal é lido uma vez por refresh. Se este item evoluir, o próximo alvo é leitura incremental/streaming, não a passada dupla (que já morreu).
- **Reforço (varredura 2026-10-04):** [#97229](https://github.com/anthropics/claude-code/issues/97229) e [#99088](https://github.com/anthropics/claude-code/issues/99088) — transcript acima de **2 GiB** derruba o
  extension host da extensão oficial (loop de re-parse até OOM, 2.1.282); [#97230](https://github.com/anthropics/claude-code/issues/97230) cada aba
  re-parseia o transcript inteiro depois de uma compactação. Do nosso lado o teto é mais baixo:
  `readFileSync(…, 'utf-8')` não cria string acima de ~512 MB (limite do V8) e o `readLines`
  engole o erro — um transcript desse tamanho viraria painel vazio, sem aviso. O maior transcript
  desta máquina tem menos de 50 MB. Se aparecer relato, o alvo é a leitura incremental acima.

### R5. Contabilidade de tokens — soma linha-a-linha infla ~2×; formato novo `usage.iterations` ✅ ENTREGUE (achados 1 e 2 · 2026-08-11 · publicado na 0.18.0)
- **Origem:** varredura 2026-08-10 ([#84223](https://github.com/anthropics/claude-code/issues/84223),
  [#81620](https://github.com/anthropics/claude-code/issues/81620),
  [#84738](https://github.com/anthropics/claude-code/issues/84738)) + **medição local**. É o
  único achado da varredura que é **bug nosso**, não do harness — promovido direto a prioridade.
- **Achado 1 — inflação ~2× nos totais (medido).** O transcript grava **um record por content
  block**, e o `usage` final do request é replicado/backfilled em cada record do mesmo
  `requestId` (formato descrito em #84223). O
  [readFileUsage](../src/services/usageParser.ts#L56) soma **todas** as linhas → medido em 40
  transcripts recentes deste disco: **70% dos requests têm 2+ records e a soma dá 1.97× o valor
  real** (vs. dedupe por `requestId`). Tabela de tokens, breakdown por agente/modelo (6a) e
  dashboard 7 dias (16) exibem ~2× o consumo real. A eficiência de cache (%) escapa por ser
  razão entre grandezas igualmente infladas. **Correção:** agregar por `requestId` ficando com o
  usage final (record com `stop_reason` non-null / `usage.iterations` / maior `output_tokens`) —
  o mesmo dedupe que o `ccusage` faz por `message.id`+`requestId`.
- **Achado 2 — rollup do advisor contamina o indicador de contexto.** #81620/#84738: turnos que
  chamam o `advisor` server-side somam as iterations no `usage` **top-level** (≈2× o contexto
  real; o próprio auto-compact dispara cedo por isso). É esse top-level que o
  [contextForFile](../src/services/usageParser.ts#L148) lê da última mensagem. **Correção:**
  quando `usage.iterations` existir, usar a **última iteration `type:"message"`** em vez do
  rollup. Verificado localmente (2026-08-10): `iterations` já está em **313/314** transcripts
  dos últimos 14 dias e **267** têm rollup na última mensagem — hoje **0 divergem** (1 arquivo
  com `advisor_message` no disco), ou seja, a exposição é estrutural e o gatilho ainda é raro
  aqui; corrigir antes de virar report de usuário.
- **Achado 3 — subcontagem sem correção possível (documentar).** #84223: ~20% dos requests de
  **sub-agent** nunca recebem o usage final — ficam com o snapshot inicial (`output_tokens: 1`,
  thinking zerado). Medido local: **15.9%** (6.392 requests em 286 `agent-*.jsonl` de 14 dias).
  É piso de subcontagem **do dado**, não do parser; nada a fazer além de saber que o número de
  output por sub-agent é um mínimo, não um exato.
- **Conecta com:** itens 2 (contexto), 6a (por agente), 16 (dashboard) e a R-perf do item 2 —
  o dedupe e a unificação de passada mexem na mesma função; fazer juntos.
- **✅ Entregue (2026-08-11):** achado 1 (dedupe por `requestId`, vencedor = record final) e
  achado 2 (contexto pela última iteration `type:"message"`) corrigidos, com a unificação
  R-perf junto (`contextForFile` removido — uma leitura do transcript principal por refresh).
  Achado 3 segue documentado como piso de subcontagem do dado. Spec:
  [docs/specs/2026-08-11-token-accounting-dedupe-design.md](specs/2026-08-11-token-accounting-dedupe-design.md)
  · plano: [docs/plans/2026-08-11-token-accounting-dedupe.md](plans/2026-08-11-token-accounting-dedupe.md).
- **Achado 4 (varredura 2026-10-04) — fork duplica o último request do pai (latente).**
  [#97978](https://github.com/anthropics/claude-code/issues/97978): o transcript de um sub-agent **fork** (`isFork: true` no meta.json) começa com um
  record `fork-context-ref` e uma **cópia** da última resposta do pai, com o mesmo `message.id`,
  `requestId` e `usage`. O nosso dedupe por `requestId` é **por arquivo**, então a sessão contaria
  esse request duas vezes. Medido aqui: 29 sessões com sub-agents nos últimos 30 dias, 489
  transcripts de sub-agent, **0** sobreposições (ninguém usa fork nesta máquina). Correção barata
  quando mexer no parser: dedupe por `requestId` no escopo da sessão (main + sub-agents) ou pular
  a cópia quando `isFork`.
- **Reforço do achado 3:** [#97763](https://github.com/anthropics/claude-code/issues/97763) e [#98696](https://github.com/anthropics/claude-code/issues/98696) — transcripts de sub-agent/workflow seguem sem o
  usage final na maioria dos turnos com tool_use (o piso de subcontagem continua). **Validação:**
  [#97258](https://github.com/anthropics/claude-code/issues/97258) o gráfico de uso do desktop soma as linhas duplicadas — o bug que corrigimos em 08-11.

### R6. Sub-agents em background: estado e notificação ✅ CORRIGIDO (achados 1 e 2 · 2026-10-05 · aguardando release)
- **✅ Corrigido (2026-10-05):** status pelo ciclo de vida por `agentId` (lançamento
  `async_launched`, retomada por `SendMessage`, `<task-notification>` entregue entre turnos
  como mensagem `user` ou no meio de um turno como `attachment` `queued_command`), só para o que
  o **processo vivo** da sessão lançou ou retomou (`startedAt` do registro); sub-agent rodando
  conta como atividade no notifier; o watcher observa `~/.claude/sessions` e redesenha quando
  um processo encerra. Spec:
  [docs/specs/2026-10-05-subagents-background-e-janela-fable-design.md](specs/2026-10-05-subagents-background-e-janela-fable-design.md)
  · plano: [docs/plans/2026-10-05-subagents-background-e-janela-fable.md](plans/2026-10-05-subagents-background-e-janela-fable.md).
  Medição refeita na revisão final: dos 112 assíncronos do disco, 111 fecham (98 com a
  notificação entre turnos, 15 no meio do turno, 13 só nesse formato); sobra 1 sem parada. Os
  "13 órfãos em sessões mortas" do brainstorm eram notificações no meio do turno. A revisão
  final (revisor novo) achou ainda que "sessão viva" não é "processo que lançou vivo": uma
  sessão retomada ressuscitava os agentes do processo anterior — corrigido com o `startedAt`.
  Verificado ao vivo: um agente em background desta sessão apareceu rodando e virou concluído
  com a notificação; a sessão `04061916`, viva num processo novo, ficou sem fantasmas.
- **Origem:** varredura 2026-10-04 ([#93672](https://github.com/anthropics/claude-code/issues/93672), [#98373](https://github.com/anthropics/claude-code/issues/98373), [#94872](https://github.com/anthropics/claude-code/issues/94872), [#95601](https://github.com/anthropics/claude-code/issues/95601)) + **medição local**.
- **Achado 1 — sub-agent assíncrono aparece como concluído (confirmado).** Quando o `Agent` roda
  em background (`run_in_background: true`, ou movido para background pelo harness), o
  `tool_result` chega **na hora**, com `toolUseResult = {isAsync: true, status:
  "async_launched", agentId, resolvedModel, outputFile, …}`. O `collectDispatches` trata a
  presença de `agentId` como fim ([todosParser.ts:458](../src/services/todosParser.ts#L458)) →
  `status: 'completed'`. Medido no disco (30 dias): **103 de 473** disparos foram assíncronos (67
  com `run_in_background`, 36 sem a flag e assíncronos mesmo assim), e o transcript do sub-agent
  continuou recebendo mensagens por uma mediana de **7,5 min** (p90 26 min, máximo 6 h) depois do
  `tool_result`. Afeta o estado na árvore (13 — nós rodando aparecem concluídos e podem ser
  recolhidos, [tree.ts:10](../src/webview/tree.ts#L10)), a faixa de lista defasada (19, que exige
  sub-agent `running`) e o notifier (achado 2).
- **Sinal de conclusão disponível:** o transcript principal recebe uma mensagem `user` com
  `<task-notification><task-id>{agentId}</task-id><tool-use-id>{toolUseId}</tool-use-id>…` quando
  o agente termina (também enfileirada como `queue-operation`); há ainda attachments
  `task_status` com `status: "running"`. #95601 mostra que a conclusão pode chegar também como
  `SubagentHandback` do próprio sub-agent.
- **Cuidado ([#94872](https://github.com/anthropics/claude-code/issues/94872), [#97271](https://github.com/anthropics/claude-code/issues/97271), [#85534](https://github.com/anthropics/claude-code/issues/85534)):** a notificação de conclusão às vezes **nunca
  chega** (a sessão pai morreu, a entrega se perdeu). Marcar `running` até a notificação, sem
  fallback, troca um erro por outro (agente "rodando há 500 h", como em #94872). Fallback
  sugerido: sem notificação **e** com o transcript do sub-agent parado há N minutos → estado
  parado/desconhecido, não `running`.
- **Achado 2 — toast "ociosa" provavelmente falso (deduzido do código, não reproduzido).** O
  notifier usa só a última mensagem do transcript **do main** como marcador de atividade
  ([sessionCore.ts:128](../src/core/sessionCore.ts#L128)). No padrão "o main dispara agentes em
  background e encerra o turno", o main fica em silêncio enquanto os sub-agents trabalham e,
  depois de 45 s, o toast de ociosa dispara — o mesmo bug que a Anthropic corrigiu no
  `idle_prompt` dela na 2.1.288 (#93672; #98373 ainda relata). Correção natural depois do achado
  1: suprimir `idle` enquanto houver sub-agent `running`, ou considerar a atividade dos
  transcripts de sub-agent.
- **Plano:** TDD no `todosParser` (dispatch `async_launched` → `none` até a `<task-notification>`
  com o mesmo `tool-use-id`, com o fallback por inatividade) e teste no
  `SessionNotifier`/`sessionCore` para o achado 2, reproduzido antes com um transcript real
  truncado. Os dois mexem no mesmo dado; fazer juntos. Fonte exata desde a ponte v1 (item 25),
  com o mod ativo: o fim de cada sub-agent pelo `turn.complete` com `agentId` (o `$.agent.list()`
  só mostra o que está vivo).

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

### Varredura 2026-07-25 (incremental, `created:>2026-07-16`)

Terceira passada, incremental sobre a anterior: 28 consultas temáticas via `gh api` autenticado
(aberto **e** fechado, ordenado por reações), 529 candidatos únicos fora do ROADMAP, 268 no
núcleo de escopo depois de filtrar o ruído. Script:
[docs/sweep_issues.py](sweep_issues.py) com `created:>{DATA}` e a lista `KNOWN` estendida.

**Nota de método:** o volume de julho é dominado pelo cluster de billing do lançamento do
Fable 5 ("usage credits required" — dezenas de issues com as maiores contagens de reação do
período) que **não** tem nada a ver com a extensão. Ordenar por reações sem filtrar esse ruído
enterra o que interessa; a triagem passou a excluir `usage credits|weekly quota|max plan|billed`
antes de ranquear.

**Resultados:**
- **9 issues novas de validação** (tabela no topo) — destaque para o trio de l10n da UI da
  extensão (item 12, já entregue) e o trio de "hook `Notification` não dispara no VS Code"
  (itens 14 e 22, onde nosso design sem-hook é a resposta).
- **Item novo:** a extensão do item 22 — exibir a pergunta pendente **no painel**, não só no
  toast (#79078).
- **Riscos novos:** **R2** (task tools somindo por remote-config — 11 issues em 3 dias) e
  **R3** (integridade do transcript: apagado no resume, escrita incompleta, hard-delete pela
  extensão oficial). Ambos verificados contra o disco local antes de registrar. **R4**
  (performance com transcripts grandes) ganhou a evidência externa que faltava.
- **Reforços fortes:** item 23 (background tasks) virou o cluster mais quente do período — 8
  issues sobre estado de vida errado no painel nativo; item 5(a) ganhou o guarda-chuva #80099 e
  o enunciado de liveness #79571; item 20 segue validado por 3 issues novas de modelo errado.
- **Falsos alarmes verificados (nenhuma ação):** o layout `<UUID>/subagents/` de #78821 já é o
  que lemos; o gate de `TodoWrite`/`TaskCreate` não afeta este ambiente (21/23 transcripts
  recentes têm as chamadas).

**Temas varridos sem nada aplicável nesta passada:** Routines/Cowork (superfície do desktop e
da web, não lemos), painel do iOS Simulator, Remote Control, sidebar do app desktop (grupos,
pins, filtros — outro produto), Workflow/effort por subagent (harness).

**Ferramenta (atualizada junto com esta passada):** [docs/sweep_issues.py](sweep_issues.py)
deixou de usar a API anônima e passou a chamar o `gh` CLI autenticado — 30 req/min em vez de
10, o que derrubou o tempo de varredura. Ganhou também: modo incremental por argumento
(`python sweep_issues.py 2026-07-25` vira `created:>2026-07-25`), o filtro `NOISE` que remove o
cluster de billing do Fable 5 **antes** do ranqueamento por reações, o filtro `CORE` que
classifica candidatos por título **e** corpo (600 chars), e a lista `KNOWN` estendida com tudo
que as varreduras 07-16 e 07-25 já trataram. Sem esses dois filtros o sinal fica enterrado — é
a razão de método descrita acima.

### Varredura 2026-08-10 (incremental, `created:>2026-07-25`)

Quarta passada, incremental: 28 consultas via `gh` autenticado, 475 candidatos únicos fora do
ROADMAP, 266 no núcleo de escopo.

**Nota de método:** as reações do período são baixas (máx. 4) — issue recém-criada não acumulou
reação ainda, então o ranking por reações perde valor na janela incremental curta. O sinal desta
passada está nos **clusters de títulos repetidos**, não no topo do ranking.

**Resultados:**
- **Achado principal — R5 (novo, 📐 prioridade):** contabilidade de tokens. Três problemas
  encadeados, todos **medidos contra o disco local**: (1) nossa soma linha-a-linha infla os
  totais em ~1.97× porque o usage final é replicado em cada record do `requestId` (#84223
  descreve o formato; 70% dos requests locais têm 2+ records) — bug **nosso**; (2) o rollup de
  `usage.iterations` em turnos com `advisor` (~2× contexto, #81620/#84738) contamina o
  indicador de contexto, que lê o top-level da última mensagem (313/314 transcripts locais já
  têm `iterations`; 0 divergem hoje); (3) ~16% dos requests de sub-agent nunca recebem usage
  final (medido: 15.9%) — subcontagem do dado, sem correção possível. Único item da varredura
  que exige código; os demais são validação/reforço.
- **10 issues novas de validação** (tabela no topo) — destaque para o par de statusline que
  ignora o sub-agent focado (#83289/#83512) e o quarto caso de modelo errado no painel nativo
  (#82766, que ainda bloqueia o modo Auto do usuário).
- **Reforços:** item 23 (8 issues novas — segue o cluster mais quente, agora com *perda* de
  background tasks além de estado errado); R3 (dois sub-temas: revolta com a retenção de 30
  dias e "dados intactos, índice perdido" — onde nossa listagem direto do disco é imune); itens
  14/22 (hook `Notification` segue quebrado nas duas superfícies, um ano de #8985); item 20
  (3 novos casos de modelo errado); item 21 (fonte nova: MCP `ccd_*` não documentado, #82141);
  item 8 (grouping multi-projeto + horizonte de 30 dias); item 1-viewer (#81549 timestamps).
- **Temas varridos sem nada aplicável nesta passada:** bugs do plugin JetBrains **oficial**
  (#82400, #84097, #84460… — outra extensão, não a nossa), sidebar/grouping do app desktop
  (dezenas de issues, outro produto), Cowork/Dispatch/Routines, iOS Simulator, cluster de
  billing (ruído já filtrado pelo `NOISE`).

### Varredura 2026-09-05 (incremental, `created:>2026-08-10`, em duas janelas)

Quinta passada, incremental, rodada em **duas janelas** (`created:>2026-08-10` e
`created:>2026-08-20`) porque o script pega os top-40 por reações **por consulta** e, num
intervalo de ~4 semanas com ~2.000 issues/semana, uma janela só perde a cauda: 603 + 618
candidatos únicos fora do ROADMAP (1.152 na união), 310 + 300 no núcleo de escopo.

**Nota de método:** as buscas por título do script **não** acham `TodoWrite`/`TaskCreate` (o
tokenizador do GitHub não casa `todo in:title` com `TodoWrite`). Sete das issues mais
importantes desta passada (#86929, #88649, #89049, #92178, #90731, #90709, #86269) só
apareceram numa busca direta por esses termos — consultas adicionadas ao script junto com esta
passada. Também vale conferir o **estado das issues já comentadas** a cada varredura: três
(#18456, #79155, #79881) foram fechadas pela Anthropic entre 08-17 e 08-20 sem que a lista
`KNOWN` acusasse nada.

**Resultados:**
- **🔥 Achado principal — R2 materializou:** a 2.1.233 (2026-08-14) desligou `TodoWrite` e
  `TaskCreate/Get/Update/List` por padrão em Opus 4.8 / Sonnet 5 / Fable 5 / Mythos 5 e mais
  novos; `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` restaura. Decisão **intencional** (bcherny em #86929),
  canônica #80015 (12 reações, usuários pedindo reversão). Verificado no disco local: `TodoWrite`
  até a 2.1.232, zero depois. Único item da passada que exige código **e** decisão de produto.
- **Fechamentos que mudam a tabela de validação:** #18456 (160 reações) fechada como
  `COMPLETED` — a extensão oficial ganhou indicador de contexto no prompt box (sem semáforo);
  #79155 fechada "já disponível via statusline"; #79881 fechada — hook `Notification` corrigido
  na 2.1.233 para Desktop e VS Code. O argumento "o hook oficial não dispara" **caducou**;
  READMEs conferidos e limpos, rever a divulgação (item 22).
- **Dois riscos novos do nosso lado (R3):** #87900 — a extensão oficial reescreve o **mtime** de
  transcripts antigos no startup (usamos mtime na janela do dashboard e no notifier); #85892 —
  stubs de sessão vazios criados pelo teleport; #90002 — metadados de render gravados dentro do
  JSONL. O primeiro é o próximo bug a investigar.
- **13 issues novas de validação** (tabela no topo) — destaque para #87081 (dashboard nativo
  **não** escopado ao cwd, vs. nosso escopo por workspace), o trio de contexto no desktop
  (#90708/#91075/#91232 — o indicador foi **removido** do rodapé) e #87053 (52 relatos de
  prompts que roubam o foco).
- **Reforços:** item 20 (4 novos casos de modelo errado — 7º a 10º); item 21 (o task store
  perdeu o cliente padrão; bugs #90731/#90709/#88346 só afetam quem liga a flag); item 23 (4
  novas, sem mudança de natureza); item 8 (#90030/#86259); item 7 (#85726 deep link
  `target=sidebar` na extensão oficial); R5 validado por #87303 (`COMPLETED`).
- **Temas varridos sem nada aplicável:** cross-session messaging/agent teams (dezenas de bugs
  de entrega de mensagens — harness), PR badges do sidebar desktop, Cowork, Chrome, safeguards
  do Fable 5 (`reasoning_extraction`), auth/OAuth no Windows, iOS Simulator, plugin JetBrains
  oficial.

### Varredura 2026-10-04 (incremental, `created:>2026-09-04`, em três janelas)

Sexta passada, em **três janelas** (`>2026-09-04`, `>2026-09-14`, `>2026-09-24`; ~4 semanas a
~2.000 issues/semana): **995** candidatos únicos fora do ROADMAP na união das três, **474** no
núcleo de escopo, todos os títulos lidos. Junto: o CHANGELOG da 2.1.263 à 2.1.289 lido inteiro,
o estado das issues já comentadas conferido e cinco verificações no disco (modelos e janela de
contexto, disparos assíncronos de `Agent`, sinal de conclusão, fork × `requestId`, tipos de
record novos) — scripts no scratchpad da sessão, não versionados.

**Nota de método:** desta vez o achado principal veio do **CHANGELOG** e do **disco**, não do
ranking — as reações seguem baixas na janela curta (máximo 14). Ler o CHANGELOG inteiro, não só
buscar palavras, pegou a 2.1.268 (lista de permissão das task tools) e a 2.1.269 (agent map), que
nenhuma busca de issue trouxe para o topo. Fica como passo fixo das próximas varreduras.

**Resultados:**
- **🐛 Três bugs nossos:** R6 achado 1 (sub-agent em background marcado como concluído —
  confirmado, 103 de 473 disparos), R6 achado 2 (toast de ociosa com agentes em background —
  provável) e a janela do Fable em 200k (item 2 — confirmado). Latentes: R5 achado 4 (fork
  duplica `requestId`, 0 casos aqui) e o gate do R2 ainda como lista de bloqueio.
- **🧭 Mudança de cenário:** agent map na extensão VS Code oficial (aviso no topo) — sobrepõe os
  itens 13, 23, 1 e parte do 22-ext; pressiona a decisão de posicionamento (R2 passo 3).
- **R2:** a regra virou lista de permissão (2.1.268); #80015 sem resposta oficial; nenhum sinal
  de reversão.
- **Superfície nova:** Mods / function hooks (item 25) — observar. Depois: spike em 10-05 e
  ponte de dados v1 entregue em 10-06.
- **12 linhas novas de validação** (tabela no topo) — destaque para #93036 (indicador oficial
  escondido até 50%), #95227 (a webview oficial não renderiza `Task*`) e #98118 (o agent map
  oficial erra o aninhamento).
- **Mudanças de estado:** #59195 (`NOT_PLANNED` desde 07-07) e #73963 (`NOT_PLANNED` em 08-26)
  constavam como abertas na tabela de validação — corrigido; #85892 fechada `NOT_PLANNED` em
  09-09; #59195 e #86929 travadas pelo bot.
- **Reforços:** itens 1, 2, 5, 13, 17 (reverificado — gatilho não atingido), 20 (11º a 16º
  casos), 21, 22, 23 e os riscos R3, R4 e R5.
- **Temas varridos sem nada aplicável:** sidebar e grupos do app desktop (dezenas — outro
  produto), routines e agendamentos, Claude in Chrome, Cowork, computer use, diff panel do
  terminal, mensageria de agent teams, safeguards (`reasoning_extraction`), o cluster de feedback
  de modelo (#97776–#97802), auth e gateways.

Próxima varredura: `python docs/sweep_issues.py 2026-10-03` (três janelas se passar de três
semanas) **e** ler o CHANGELOG inteiro desde a 2.1.289.

Anotar novos achados abaixo:

- [ ] _(adicionar aqui novas issues encontradas)_
