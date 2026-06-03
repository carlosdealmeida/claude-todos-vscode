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
- **Status:** 🔍 a investigar (parser atual)
- **Ideia:** ao percorrer o transcript buscando o último `TodoWrite`, guardar o `uuid`/índice da
  mensagem onde cada item apareceu ou mudou de status; tornar o item clicável → abre o `.jsonl`
  naquela posição.
- **Depende de:** entender como o parser hoje localiza e ordena os itens.

### 2. Indicador de uso de contexto/token na barra
- **Issue:** [#58159](https://github.com/anthropics/claude-code/issues/58159) — labels `platform:vscode`, `area:statusline`
- **Reforçada por:** [#516](https://github.com/anthropics/claude-code/issues/516) (`NOT_PLANNED`) "Always show available context percentage" — pedido antigo, nunca atendido.
- **Status:** 🔍 a investigar
- **Ideia:** mostrar "Context: 45% / 200k" perto do input, como na CLI, + aviso de proximidade
  do autocompact. Dados já estão no `usage` por mensagem do transcript.
- **Sinergia:** reaproveita a agregação de tokens do 0.3.0.

### 3. Visibilidade de custo: cached vs uncached + aviso por valor absoluto
- **Issue:** [#44779](https://github.com/anthropics/claude-code/issues/44779) — labels `area:cost`, `area:tui`, `area:statusline`
- **Status:** 🔍 a investigar
- **Ideia:** exibir cached vs uncached por turno e avisar com base em contagem absoluta de tokens
  da sessão (ex.: "250k"), não só em %. `usage` já traz `cache_read_input_tokens` e
  `cache_creation_input_tokens`.
- **Sinergia:** complementa a tabela de tokens; bom de fazer junto com #58159.

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

---

## Média aderência (escopo maior)

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

## Robustez (riscos do nosso lado, não features)

### R1. Hooks no Windows — instalação e execução frágeis
- **Issues:** [#34457](https://github.com/anthropics/claude-code/issues/34457) (`NOT_PLANNED`) hooks com shell travam 5+ min no Windows · [#59622](https://github.com/anthropics/claude-code/issues/59622) `EEXIST` em `mkdir` não-idempotente de session-env · [#59072](https://github.com/anthropics/claude-code/issues/59072) hooks do `settings.json` silenciosamente não invocados no Windows
- **Status:** 🔍 auditar nosso `hookInstaller` / `sessionStart`
- **Risco:** nós instalamos `SessionStart` + `UserPromptSubmit` que rodam um script Node. Três
  issues distintas mostram que hooks no Windows sofrem com `mkdir` não-idempotente, hangs e
  não-invocação. Como o ambiente alvo do mantenedor é Windows, vale auditar se nosso instalador e
  script de hook são idempotentes, rápidos e à prova de path com espaço/acentos.
- **Não é feature:** é dívida de robustez; barata de verificar, cara se morder um usuário.

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

### Candidata de baixa prioridade / inspiração

- **i18n da nossa própria UI** — há forte demanda por localização **no Claude Code**
  ([#60914](https://github.com/anthropics/claude-code/issues/60914), [#64472](https://github.com/anthropics/claude-code/issues/64472),
  [#58688](https://github.com/anthropics/claude-code/issues/58688), [#35600](https://github.com/anthropics/claude-code/issues/35600) etc.).
  Não são issues do nosso domínio, mas nossa UI hoje é só pt enquanto o README é trilíngue (pt/en/es).
  Localizar a UI da extensão seria coerente. Esforço médio, valor incremental.

### Varredura concluída

Garimpo inicial de `anthropics/claude-code` (aberto + fechado) **completo**. Resultados:

- **plan mode / ExitPlanMode** — varrido; só há issues sobre o *comportamento* do plan mode
  (enforcement, edits sem sair), tudo harness. **Nada aplicável** ao nosso painel.
- **performance de transcripts grandes** — varrido; nenhuma issue clara da comunidade. Mantemos
  como preocupação interna de engenharia, não derivada de issue. A varredura levou ao item **R1**
  (hooks no Windows), que é o risco concreto que apareceu.

Reabrir a varredura só quando surgir tema novo. Anotar novos achados abaixo:

- [ ] _(adicionar aqui novas issues encontradas)_
