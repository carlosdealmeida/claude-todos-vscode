# Estado vazio inteligente: ferramentas de tasks desligadas — design

**Roadmap:** R2, passo 1 · Origem: varredura 2026-09-05 —
[CHANGELOG 2.1.233](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md),
[#86929](https://github.com/anthropics/claude-code/issues/86929) (mantenedor: *"intended today,
not a bug"*) e [#80015](https://github.com/anthropics/claude-code/issues/80015) (canônica).

Primeira entrega do R2 depois que o risco se materializou. O passo 0 (verificação da
mitigação na extensão oficial) já foi feito e está registrado no ROADMAP; este documento
desenha o que o painel faz com essa informação.

## Problema

Desde a Claude Code **2.1.233** (2026-08-14), as ferramentas de lista de tasks — `TodoWrite`,
`TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet` — vêm **desligadas por padrão** em Opus 4.8,
Sonnet 5, Fable 5, Mythos 5 e modelos mais novos. Voltam com
`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. Sem elas o agente não grava tasks no transcript, e o painel
mostra "Sessão ativa — aguardando tasks" para sempre. O usuário novo, com modelo atual, conclui
que a extensão não funciona. O resto do painel (árvore de agentes, tokens, contexto, cache,
notificações, perguntas pendentes) não depende dessas ferramentas e continua certo — mas o
estado vazio não diz isso.

Os READMEs já explicam o corte e ensinam a reativar (0.18.0). Este design leva a mesma
informação, e a correção, para dentro do painel, no lugar onde o problema aparece.

## O dado, medido antes de desenhar

**Distribuição local** (`~/.claude/projects`, 30 dias até 2026-09-05): chamadas de `TodoWrite`
por versão do harness que gravou a linha.

| versão | 2.1.203 | 2.1.214 | 2.1.218 | 2.1.220 | 2.1.221 | 2.1.224 | 2.1.226 | 2.1.227 | 2.1.229 | 2.1.232 | **≥ 2.1.233** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `TodoWrite` | 22 | 6 | 12 | 140 | 2 | 13 | 69 | 20 | 29 | 13 | **0** |

**Passo 0** (binário 2.1.261 embutido na extensão oficial, modelo Fable 5.1, `-p` em cwd de
rascunho):

| Teste | Flag | Resposta | `tool_use` no `.jsonl` |
|---|---|---|---|
| A | nenhuma | `NO_TASK_TOOLS TaskOutput TaskStop` | nenhum |
| B | variável no ambiente do processo | `DONE` | `ToolSearch` → `TaskCreate` ×2 |
| C | só `env` do `~/.claude/settings.json` | `DONE` | `ToolSearch` → `TaskCreate` ×2 |
| D | `env` do settings.json + `CLAUDE_CODE_ENABLE_TASKS=0` (o que a extensão injeta) | `DONE` | `ToolSearch` → `TodoWrite` ×1 |

E a sessão que fez a análise, rodando dentro da extensão oficial, recebeu `TodoWrite` no roster
assim que a chave entrou no settings.json, sem reiniciar.

Três consequências para o design:

1. **O `env` do settings.json vale na extensão.** É a mitigação que o botão vai gravar.
2. **As ferramentas voltam como deferred**: o modelo as carrega via `ToolSearch` quando decide
   criar tasks. Mesmo com a flag ligada, a lista só aparece quando o agente a cria. Depois de
   ativar, o texto correto volta a ser "aguardando tasks", não "pronto".
3. **O esquema depende do ambiente**: com `CLAUDE_CODE_ENABLE_TASKS=0` vem `TodoWrite`, sem ela
   vem `TaskCreate`. O `todosParser` já trata os dois (`detectSchema`). Nada a fazer.

## Decisões

### 1. A detecção mora no `SessionCore`; o snapshot ganha um campo

`SessionSnapshot` ganha `taskToolsOff?: true`, presente só quando as quatro condições abaixo
valem. O webview só renderiza. Alternativas descartadas: detectar no webview (regra de
negócio no Svelte e a flag do settings.json teria de viajar até lá) e detectar nos hosts
(duplicação em TypeScript e Kotlin). Mesmo padrão de `awaitingInput` e `pendingQuestions`.

### 2. As quatro condições

1. **Sem agentes com tasks** — `agents.length === 0`. É o ramo que já mostra "aguardando".
2. **Harness ≥ 2.1.233** — o `version` está em todo record do transcript. O `readFileUsage`
   passa a capturar `lastVersion` na mesma passada em que já captura `lastModel` (última
   mensagem do assistente com `usage`). A comparação é numérica por tupla
   (`major.minor.patch`), ignorando sufixos. Constante `TASK_TOOLS_OFF_SINCE = '2.1.233'`.
3. **Modelo na lista desligada** — o `lastModel` casa `/opus-4-8|opus-5|sonnet-5|fable|mythos/`
   ou tem major ≥ 5 no id (`claude-<família>-<major>-…`). Opus 4.7 e anteriores, Sonnet 4.x e
   Haiku 4.5 mantêm as ferramentas: caem no texto normal. Sem versão ou sem modelo (sessão sem
   mensagem do assistente ainda): texto normal, sem dica — na dúvida, não acusar.
4. **Flag não ligada em nenhuma fonte** — `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` em
   `<claudeDir>/settings.json`, `<cwd>/.claude/settings.json`, `<cwd>/.claude/settings.local.json`
   e `process.env` do host. Valores verdadeiros: `"1"`, `"true"` (sem distinção de caixa).
   Precedência: **qualquer** fonte verdadeira → ligada, sem dica. Nenhuma verdadeira e alguma
   explicitamente falsa (`"0"`, `"false"`) → o usuário decidiu, sem dica. Ausente em todas →
   desligada, **com** dica. A leitura dos três arquivos é memoizada por `mtime`, como o
   dashboard já faz com os transcripts.

### 3. A ação `enableTaskTools` grava a flag no `settings.json` do usuário

`SessionCore.enableTaskTools(): { changed: boolean; path: string }` grava
`env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` em `<claudeDir>/settings.json` (respeita
`claudeTodos.claudeDir`, como o hook). Idempotente: se já está `"1"`, devolve
`changed: false` sem escrever. Preserva todas as outras chaves e a indentação de 2 espaços que
a extensão já usa. Ao gravar, invalida o memo da flag e dispara `onChange`; o próximo snapshot
não satisfaz a condição 4 e a dica some sozinha.

Sempre atrás de confirmação explícita do usuário (decisão 5). Só a fonte do usuário é escrita;
as fontes de projeto são apenas lidas.

### 4. `ClaudeSettingsFile`, compartilhada com o `HookInstaller`, com leitura estrita

A leitura tolerante e a escrita atômica hoje privadas do `HookInstaller` saem para
`src/services/claudeSettings.ts` (`ClaudeSettingsFile`: `exists`, `read`, `write`, `getEnv`,
`setEnv`). Diferença deliberada: **arquivo existente que não parseia lança erro, e nada é
escrito** — hoje o `HookInstaller` lê `{}` nesse caso e sobrescreve o arquivo do usuário só com
os hooks. Arquivo ausente continua sendo criado.

O `HookInstaller` adota a classe e herda a proteção (decisão tomada no brainstorm: é bug latente
de perda de dados, e o custo é um teste novo). Os chamadores já tratam: o caminho manual do
VS Code mostra `hook.installFailed` com o erro, o caminho automático da ativação engole a
exceção (só pula a limpeza), e o `dispatcher` do sidecar já emite `ev: 'error'`.

### 5. Confirmação e feedback nos dois hosts

- **VS Code:** `handleMessage` recebe `{ type: 'enableTaskTools' }`, abre
  `showInformationMessage` **modal** com o caminho do arquivo e a chave que será gravada, botões
  "Ativar"/"Cancelar". Confirmado: chama o core, faz `pushSnapshot`, mostra toast de sucesso
  (sessões novas já saem com as ferramentas; nas abertas, mande uma mensagem ou reinicie).
  Já ativada: toast informativo. Erro: toast com caminho e mensagem. O mesmo fluxo é registrado
  como comando `claudeTodos.enableTaskTools` ("Claude Todos: Enable Claude Code task tools"),
  na paleta — e é o botão que o passo do walkthrough (R2 passo 2) vai usar.
- **JetBrains:** `RouterHost` ganha `confirm(messageKey, onOk)` e `info(messageKey)`. O
  `MessageRouter` trata `"enableTaskTools"`: pede confirmação ao host e envia ao sidecar
  `{ cmd: 'enableTaskTools', id }`; o `dispatcher` responde `{ ev: 'taskToolsEnabled', id,
  changed }` ou `{ ev: 'error', id, message }`, e o router mostra o toast correspondente.
  Strings no `NotifyMessages.kt`, nos cinco idiomas, como as demais.

### 6. UI: variante do bloco "aguardando", sem dispensar

No `App.svelte`, o ramo `{:else}` que hoje mostra `app.awaitingTitle` ganha a variante
`{#if snapshot.taskToolsOff}`: título, um parágrafo curto de explicação, botão primário
(`--vscode-button-background`/`--vscode-button-foreground`, que o tema do JetBrains já mapeia)
e uma legenda pequena dizendo o que o botão grava e que pede confirmação. Sem "dispensar": a
dica ocupa o lugar de um texto que já estaria ali ("aguardando tasks"), não é toast nem banner.
Quem não quer ativar vê a explicação em vez de uma promessa que não se cumpre. Quem prefere
desligado de propósito grava `"0"` e volta ao texto normal (condição 4).

### 7. Textos e i18n

Catálogo `messages.ts` (en, pt-br, es, zh-cn, zh-tw; paridade testada):

| Chave | pt-br |
|---|---|
| `app.taskToolsOff.title` | Ferramentas de tasks desligadas neste Claude Code |
| `app.taskToolsOff.body` | A partir da 2.1.233 o Claude Code desliga `TodoWrite`/`TaskCreate` por padrão nos modelos novos, então o agente não consegue registrar tasks. O resto do painel continua funcionando. |
| `app.taskToolsOff.button` | Ativar ferramentas de tasks |
| `app.taskToolsOff.hint` | Grava `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` em `~/.claude/settings.json`. Pede confirmação antes. |
| `taskTools.confirm` | O Claude Todos vai adicionar `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` em {path}. As outras configurações são preservadas. Sessões novas do Claude Code voltam a ter as ferramentas de tasks. |
| `taskTools.enable` / `taskTools.cancel` | Ativar / Cancelar |
| `taskTools.enabled` | Ferramentas de tasks ativadas. Sessões novas já saem com elas; nas abertas, mande uma mensagem ou reinicie. |
| `taskTools.alreadyEnabled` | As ferramentas de tasks já estão ativadas em {path}. |
| `taskTools.failed` | Não foi possível atualizar {path}: {error} |

As chaves `taskTools.*` também entram no `NotifyMessages.kt` (mapa por idioma do plugin) e
`command.enableTaskTools.title` nos cinco `package.nls*.json`. Os demais idiomas seguem o
conteúdo do pt-br; o inglês é a base do tipo do catálogo, como hoje.

### 8. READMEs: a tabela de privacidade

A linha do `~/.claude/settings.json` ("Lido + escrito (uma vez, com permissão) — adiciona dois
comandos de hook…") passa a citar a segunda escrita: sob pedido explícito, a chave
`env.CLAUDE_CODE_ENABLE_TODO_TOOLS`. Cinco idiomas, sem mudar a contagem de seções (a landing
extrai por índice; `tests/site` garante).

## Alcance

Arquivos tocados, por camada:

- **Serviços:** `src/services/claudeSettings.ts` (novo), `src/services/taskToolsGate.ts` (novo:
  `evaluateTaskTools` pura + leitor de flag memoizado), `src/services/hookInstaller.ts` (adota
  a classe), `src/services/usageParser.ts` (`lastVersion`), `src/services/snapshotService.ts`
  (condições 1 e 4 + campo), `src/types.ts` (`taskToolsOff`, `WebviewMessage`).
- **Core:** `src/core/sessionCore.ts` (`enableTaskTools`, invalidação do memo),
  `src/core/dispatcher.ts` (comando e evento).
- **VS Code:** `src/extension.ts` (mensagem, diálogo, comando), `package.json` (comando),
  `package.nls*.json` ×5.
- **Webview:** `src/webview/App.svelte` (variante), `src/webview/stores.svelte.ts`
  (`enableTaskTools()`), `src/i18n/messages.ts` ×5.
- **JetBrains:** `MessageRouter.kt` (ramo + `RouterHost`), `ClaudeTodosToolWindowFactory.kt`
  (implementação de `confirm`/`info`), `NotifyMessages.kt` ×5.
- **Docs:** cinco READMEs (tabela de privacidade), `CHANGELOG.md` (Unreleased), ROADMAP (R2
  passo 1 ✅ ao entregar).

## Fora de escopo

- O passo do **walkthrough** (R2 passo 2): usa o comando criado aqui, mas é entrega própria.
- **Ativar sem clique** ou na ativação da extensão: mexer no settings.json do usuário sem pedido
  explícito contraria o princípio de privacidade da extensão.
- Detectar "flag ligada, mas a sessão aberta nasceu antes dela": não há sinal confiável no
  transcript; o toast de sucesso cobre com a instrução de mandar uma mensagem ou reiniciar.
- Escrever nas fontes de **projeto** (`<cwd>/.claude/settings*.json`): só leitura.
- A decisão de **posicionamento** (R2 passo 3) e o comentário em **#80015** (R2 passo 4).
- Um alerta quando a Anthropic **renomear** a variável ou **reverter** o corte: a constante de
  versão e a regex de modelos ficam isoladas no `taskToolsGate.ts` para a manutenção ser um
  commit pequeno; o monitoramento é o R2 passo 5.

## Testes

Tudo em Node (`vitest`), exceto o Kotlin, que é verificado por `gradlew buildPlugin` e smoke no
IDE, como nas entregas anteriores.

- `tests/services/claudeSettings.test.ts`: cria o arquivo quando ausente; preserva chaves e
  indentação de 2 espaços; **lança e não altera o arquivo** em JSON inválido; `setEnv` devolve
  `changed: true` na primeira e `false` na segunda; `getEnv` lê valores como string.
- `tests/services/hookInstaller.test.ts`: caso novo — settings inválido lança e o arquivo segue
  intacto; os 15 casos atuais continuam verdes.
- `tests/services/taskToolsGate.test.ts` (matriz da decisão 2): `2.1.232` → sem dica;
  `2.1.233` e `2.1.261` com Fable/Opus 5/Sonnet 5/Opus 4.8 → dica; Opus 4.7, Sonnet 4.x e
  Haiku 4.5 → sem dica; versão ou modelo ausentes → sem dica; flag `"1"`/`"true"` em cada uma
  das quatro fontes → sem dica; `"0"` explícito sem nenhuma verdadeira → sem dica; memo
  invalida quando o `mtime` muda.
- `tests/services/usageParser.test.ts`: `lastVersion` vem do último record do assistente com
  `usage`; ausente quando nenhum record tem `version`.
- `tests/services/snapshotService.test.ts`: `taskToolsOff: true` quando não há agentes e o
  gate acusa; ausente quando há agentes mesmo com o gate acusando; ausente logo após
  `enableTaskTools()` (memo invalidado).
- `tests/core/dispatcher.test.ts`: `enableTaskTools` responde `taskToolsEnabled` com `changed` e
  `error` em falha, ambos com o `id` de volta.
- `tests/webview/bridge.test.ts`: `enableTaskTools()` posta `{ type: 'enableTaskTools' }`.
- `tests/i18n/*` e `tests/site/*`: paridade das chaves novas nos cinco idiomas e das seções dos
  READMEs, sem mudança nos testes — só precisam continuar verdes.
- **Manual:** F5 no VS Code com a flag removida do settings.json local → dica aparece; clicar,
  confirmar → toast, dica some, "aguardando tasks" volta; nova sessão cria tasks e a lista
  aparece. `gradlew runIde` para o mesmo roteiro no JetBrains.
