# Ponte de dados via mod do Claude Code — design

**Roadmap:** item 25 (ponte de dados), item 2 (janela exata) e R6 (fim dos sub-agents) · Origem:
spike de 2026-10-05 (ROADMAP, item 25, commit `1f7975d`) e sonda de `CLAUDE_CODE_PLUGIN_DIRS` no
mesmo dia · [CHANGELOG 2.1.287 a 2.1.289](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
(Mods, id único de agente, mods desligados remotamente).

Um mod do Claude Code, instalado pela extensão com um clique, grava um arquivo por sessão com o
que o transcript não tem: a janela de contexto exata, os limites de uso de 5h e 7 dias e o momento
em que cada sub-agent e cada turno do main terminam. O painel usa esses dados quando o arquivo
existe e continua no parser quando não existe. As duas fontes convivem enquanto os Mods estão em
early access.

## Problema

1. **A janela é estimada pelo nome do modelo.** O `contextLimitFor`
   ([usageParser.ts:24](../../src/services/usageParser.ts#L24)) devolve 1M ou 200k pela família.
   No Pro/Team sem usage credits, Fable, Opus e Sonnet rodam em 200k e o painel sub-reporta
   (decisão 5 da spec de 2026-10-05). Uma janela definida por `env` ou `settings` também escapa.
2. **Os limites de uso não existem no disco.** Nenhum arquivo local traz o percentual dos limites
   de 5h e 7 dias, e o painel não os mostra.
3. **O fim de um sub-agent é deduzido do transcript.** O R6 cobre as formas conhecidas (111 de
   112 agentes medidos), mas depende de a notificação chegar ao main. O engine sabe o momento
   exato.
4. **O aviso de ociosidade espera 45 s de silêncio.** Sem saber quando o turno do main acaba, o
   notifier usa o silêncio do transcript como sinal
   ([sessionNotifier.ts:77-86](../../src/services/sessionNotifier.ts#L77-L86)).

## O que o spike e a sonda mediram

- Os function hooks rodam nesta máquina (Windows 11, Claude Code 2.1.289 na extensão VS Code).
- A sessão da extensão VS Code carrega mods sem superfície de desenho: `$.session.surfaces()`
  devolve `[]`. Os hooks e o `$` funcionam; uma UI de mod não aparece.
- O mesmo id de agente aparece no resultado do `agent.spawn`, em `turn.complete.agentId`, em
  `$.agent.list()[].id`, no `toolUseResult.agentId` do lançamento e no nome
  `subagents/agent-<id>.jsonl`. A 2.1.289 trouxe *"one agent id across plugin hook events"*;
  antes dela, a igualdade não é garantida.
- `$.agent.list()` só lista os agentes vivos. Um agente concluído sai da lista (em até 76 s no
  spike).
- `$.session.usage()` sem argumentos devolve `context { tokens?, window, percent? }` (os números
  da status line), `rateLimits[]` (`five_hour`, `seven_day` e, atrás de gateway, `spend_limit`,
  cada um com `percentUsed` e `resetsAt`), `cost.usd` e `startedAt`.
- Um mod listado em `CLAUDE_CODE_PLUGIN_DIRS` carregou numa sessão nova (`claude -p`, 2.1.286)
  sem pedir consentimento, e `session.start`, `turn.complete` e `session.end` dispararam. O
  `turn.complete` do main chega sem `agentId` e com `reason: "answer"`; o `session.end` de um
  `-p` chega com `reason: "other"`.
- `CLAUDE_CONFIG_DIR` não estava definido; `HOME` e `USERPROFILE` apontavam para o perfil do
  usuário.
- Na mesma máquina convivem duas versões: o `claude` do PATH é a 2.1.286 e a extensão VS Code
  roda a 2.1.289.

Regras da API que o design respeita:

- O `claude plugin validate` segue o `$` estaticamente: o `$` só pode ser passado a funções
  declaradas no topo do arquivo.
- Um hook roda dentro de um dispatch, e trabalho iniciado depois do `return` é abandonado.
  Chamadas a `$` em voo não contam no orçamento do hook.
- O `$.fs` lê, grava (criando as pastas), lista e consulta arquivos de até 4 MiB. Ele não renomeia
  nem apaga, e a escrita não é atômica.
- Uma recarga do módulo zera as variáveis dele e dispara `session.start` de novo. O `/clear`
  encerra a sessão (`session.end` com `reason: "clear"`) e troca o id sem um novo `session.start`.
- Os Mods estão em early access: a API muda entre versões, e a Anthropic pode desligá-los
  remotamente.

## Decisões

### 1. Um arquivo de estado por sessão

O mod mantém um retrato pequeno da sessão e reescreve o arquivo inteiro a cada evento relevante.
O leitor fica simples, o tamanho é limitado e cada arquivo tem um único escritor.

Descartados no brainstorm:

- **Log de eventos.** O `$.fs` não tem append: o arquivo seria reescrito inteiro a cada evento,
  sempre crescendo, e a reconstrução do estado iria para a extensão.
- **Linhas no próprio transcript, via `$.session.append`.** Cada linha aparece como aviso no
  terminal, e o mod passaria a escrever na conversa do usuário.

### 2. O mod `claude-todos-bridge`

Sem UI. Quatro hooks; todos aguardam o próprio trabalho dentro do hook, e a falha de uma chamada a
`$` não derruba as outras.

| Hook | O que faz |
|---|---|
| `session.start` | Depois do `next`, relê o arquivo da sessão, se existir, lê o `$.session.usage()` e grava. Restaura o estado que a recarga zerou, e a janela exata aparece antes da primeira resposta. |
| `agent.spawn` | Depois do `next`, registra o agente como `running`, com tipo, descrição, background, modelo resolvido e pai. Um spawn negado não entra. |
| `turn.complete` | Com `agentId`, o agente passa a `stopped`; um agente que nasceu antes de o mod carregar ganha a entrada nesse momento. Sem `agentId`, o turno do main termina (`turn.state = "idle"`). Nos dois casos, relê o `$.session.usage()`. |
| `session.end` | Antes do `next`, porque o fim da sessão tem orçamento curto, marca `turn.state = "ended"` com o motivo. |

- O id da sessão vem de `$.session.id()` a cada evento. Quando ele muda (depois de um `/clear`), o
  mod começa um estado novo para o id novo.
- A retomada de um sub-agent por `SendMessage` não tem hook. O transcript registra a retomada, e o
  leitor funde as duas fontes pelo evento mais recente de cada agente (decisão 6).
- O mod não grava custo.
- Cada arquivo guarda até 500 agentes, os de evento mais recente, e fica bem abaixo dos 4 MiB do
  `$.fs`.
- O id da sessão passa pelo padrão `[A-Za-z0-9_-]+` antes de virar caminho.

**Onde gravar.** A extensão instala o mod em `<claudeDir>/.vscode-todos-bridge/mod/claude-todos-bridge/`
(decisão 5). O mod deriva a pasta de saída de `$.plugin.root`: quando a pasta dois níveis acima
da raiz se chama `.vscode-todos-bridge`, ele grava em `live/` dentro dela. Assim a saída acompanha
o claudeDir em que a extensão o instalou. Carregado de outro lugar (desenvolvimento), o mod usa
`CLAUDE_CONFIG_DIR` ou, sem ela, `USERPROFILE` (ou `HOME`) mais `/.claude`, e grava em
`.vscode-todos-bridge/live/` dentro dessa pasta.

### 3. O formato do arquivo

`<claudeDir>/.vscode-todos-bridge/live/<sessionId>.json`:

```json
{
  "schema": 1,
  "sessionId": "5b69f6bc-5943-44c9-9385-753cc2b5fd2c",
  "engineVersion": "2.1.289",
  "writtenAt": 1791215940722,
  "turn": { "state": "idle", "at": 1791215940722, "reason": "answer" },
  "usage": {
    "at": 1791215940722,
    "context": { "tokens": 137849, "window": 1000000, "percent": 14 },
    "rateLimits": [
      { "kind": "five_hour", "percentUsed": 2, "resetsAt": "2026-10-05T20:40:00.000Z" },
      { "kind": "seven_day", "percentUsed": 2, "resetsAt": "2026-10-12T12:00:00.000Z" }
    ]
  },
  "agents": {
    "a8a7e239c5bda24cb": {
      "state": "stopped", "at": 1791215941554, "type": "Explore",
      "description": "Spike: agente que atravessa a recarga", "background": true,
      "model": "claude-haiku-4-5-20251001", "reason": "answer"
    }
  }
}
```

| Campo | Significado |
|---|---|
| `schema` | `1`. O leitor ignora qualquer outro valor. |
| `engineVersion` | `$.session.version().version`. Decide se o ciclo de vida dos agentes vale (decisão 6). |
| `writtenAt` | Hora da gravação. |
| `turn` | Fim do último turno do main (`idle`) ou da sessão (`ended`), com `at` e o `reason` do engine. Ausente até o primeiro fim. |
| `usage` | A última leitura de `$.session.usage()`: `context` como o engine a dá e `rateLimits` (vazio quando o engine não tem leitura). `at` é a hora da leitura. Ausente se a chamada falhar. |
| `agents` | Por `agentId`: `state` (`running` ou `stopped`), `at` do último evento e, quando conhecidos, `type`, `description`, `background`, `model`, `parentId` e `reason`. |

Todos os tempos são epoch ms do relógio da máquina (`$.clock.now()`), comparáveis aos timestamps
do transcript.

### 4. O mod no repo e no build

- **`src/bridgeMod/state.ts`:** módulo puro, sem imports e sem APIs de Node, porque também roda
  dentro do mod. Contém o tipo `BridgeFile` (o contrato da decisão 3), a aplicação de eventos ao
  estado, a restauração a partir do texto do arquivo e a derivação da pasta de saída. O core
  importa o mesmo tipo para ler. Testado com vitest; o `tsc` do repo já o cobre.
- **`mod/claude-todos-bridge/`:** `.claude-plugin/plugin.json`, `hooks/hooks.json` e
  `hooks/register.ts`. O `register.ts` só liga os hooks ao `state.ts`.
- **`scripts/buildBridgeMod.mjs`:** gera `src/generated/bridgeModFiles.ts` com o conteúdo de cada
  arquivo do mod. Ele copia o `state.ts` de `src/bridgeMod/` e põe a versão do `package.json` no
  `plugin.json`. O módulo gerado entra no bundle do core, então o mod viaja dentro da extensão e
  do sidecar do JetBrains sem nenhum recurso novo no plugin.
- `src/generated/` fica no `.gitignore`. O gerador roda no início do `build` e nos scripts
  `pretest` e `pretypecheck`, porque o CI roda `typecheck` e `test` antes do `build`.
- **`npm run mod:dev`:** monta o mod em `dist/mod/claude-todos-bridge/` para o
  `claude plugin validate` e o `claude --plugin-dir` durante o desenvolvimento. O CI não tem o
  `claude`, então a validação é um passo manual do plano.

### 5. Instalar, atualizar e desinstalar

Um serviço novo no core, `BridgeModInstaller`, atende os dois IDEs.

**Instalar:**

1. Grava os arquivos do mod em `<claudeDir>/.vscode-todos-bridge/mod/claude-todos-bridge/`.
2. Lê o `settings.json` com o `ClaudeSettingsFile`
   ([claudeSettings.ts:21](../../src/services/claudeSettings.ts#L21)) e acrescenta a pasta do mod
   a `env.CLAUDE_CODE_PLUGIN_DIRS`, separada pelo `path.delimiter`, preservando as entradas que já
   existem. Um JSON inválido lança `SettingsParseError` e nada é gravado. A escrita é atômica.
3. Grava `<claudeDir>/.vscode-todos-bridge/mod/install.json` com `installedAt`.

A instalação vale para as sessões que começarem depois; uma sessão aberta só carrega o mod quando
reiniciar. Instalar de novo, ou pelo outro IDE, não duplica a entrada.

**Atualizar:** na ativação do VS Code e no `init` do sidecar, se o mod estiver instalado, o core
regrava só os arquivos cujo conteúdo mudou. Sessões interativas observam a pasta do mod e o
recarregam a cada mudança, então um arquivo igual não é regravado.

**Desinstalar:** tira a nossa entrada de `env.CLAUDE_CODE_PLUGIN_DIRS` (e a chave, se ela ficar
vazia) e apaga a pasta `mod/`. Os arquivos de `live/` expiram pela limpeza de 30 dias.

**Estado:** instalado quando a entrada no `env` e a pasta do mod existem.

**Nos hosts,** o mesmo molde do `enableTaskTools`
([extension.ts:141](../../src/extension.ts#L141),
[MessageRouter.kt:108](../../jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/MessageRouter.kt#L108)):
a webview manda `installBridgeMod` ou `uninstallBridgeMod`, o host abre o diálogo de confirmação
nativo e chama o core (no sidecar, dois `CoreCommand` novos). No VS Code, as duas ações também
viram comandos da paleta: `claudeTodos.installBridgeMod` e `claudeTodos.uninstallBridgeMod`. Os
textos do diálogo do JetBrains ficam em `NotifyMessages.kt`.

Desinstalar a extensão não desfaz a instalação, como acontece hoje com os hooks. O README explica
a remoção manual.

### 6. Leitor e precedência

Um leitor novo no core, `BridgeLiveReader`:

- **`forSession(sessionId)`:** valida o id com `SAFE_SESSION_ID`
  ([transcriptPaths.ts:8](../../src/services/transcriptPaths.ts#L8)), lê `live/<id>.json` e guarda
  o resultado em cache por mtime e tamanho. Um arquivo pela metade ou inválido devolve a última
  leitura boa daquele arquivo; um `schema` diferente de 1 é ignorado.
- **`latestRateLimits()`:** a leitura de limites mais recente entre todos os arquivos de `live/`.

O `SessionCore` constrói o leitor e o passa ao `SnapshotService` como dependência opcional, como já
faz com o `taskToolsFlags` ([snapshotService.ts:23](../../src/services/snapshotService.ts#L23)).

| Dado | Regra |
|---|---|
| Janela de contexto | Quando o parser já tem `context`, o `window` da ponte substitui o `limit` estimado, em qualquer sessão que tenha arquivo, inclusive encerrada, e o `ContextUsage` ganha `source: 'mod'`. Os tokens continuam vindo do transcript, que é sempre mais recente. O `contextLimitFor` não muda, porque o agregado de 7 dias também o usa. |
| Limites de 5h e 7 dias | Os limites são da conta, não da sessão: vale a leitura de `usage.at` mais recente entre os arquivos com `rateLimits` não vazio. Uma linha cujo `resetsAt` já passou some. Sem linha válida, nada aparece. |
| Fim dos sub-agents | Os agentes do arquivo viram mais um `Map<agentId, LifecycleEntry>` no `mergeLifecycles` ([todosParser.ts:365](../../src/services/todosParser.ts#L365)), onde vence o evento mais recente. Isso só vale com `engineVersion` 2.1.289 ou mais nova. O `statusOf` não muda: "rodando" continua exigindo sessão viva e evento a partir de `aliveSince`. |
| Fim do turno do main | Alimenta o notifier (decisão 7). |
| Tarefas, nomes, histórico | Só o parser. |

### 7. Notifier: o aviso sai no fim do turno

`NotifierInput` ([sessionNotifier.ts:10](../../src/services/sessionNotifier.ts#L10)) ganha
`turnEndedAt?: number`. O `SessionCore.observeForNotifications()` o preenche quando a sessão está
viva, o arquivo da ponte tem `turn.state === "idle"` e `turn.at` é a partir de `aliveSince`.

Quando `turnEndedAt >= mtime` (o fim do turno é mais recente que a última mensagem do transcript) e
nenhum sub-agent está rodando, o `idle` deixa de exigir os 45 s de silêncio e sai na primeira
observação seguinte. As outras condições continuam: a rajada teve pelo menos 60 s de atividade,
nenhuma pergunta está pendente e ainda não houve aviso neste ciclo.

Um fim de turno mais antigo que a última mensagem pertence a um turno anterior, e aí vale a regra
de hoje. A regra de hoje também cobre um pedido de permissão parado: o turno não terminou, o
transcript silencia e o aviso sai depois de 45 s, como hoje.

### 8. UI

A UI fica em [UsageTable.svelte](../../src/webview/lib/UsageTable.svelte), que os dois IDEs
compartilham.

**Limites de uso:** um bloco novo logo abaixo da barra de contexto, no mesmo estilo dela. O "lido
às" é a hora da leitura escolhida (`usage.at`).

```
LIMITES DE USO                         lido às 14:05
5h      ▓▓░░░░░░░░░░░░░░░░   2%   reinicia 17:40
7 dias  ▓░░░░░░░░░░░░░░░░░   2%   reinicia 12/10
```

- As cores usam os limiares do `contextLevel` ([format.ts:141](../../src/webview/format.ts#L141)):
  verde abaixo de 60%, amarelo até 85%, vermelho acima.
- O reset mostra só a hora no mesmo dia e a data nos outros, no formato do idioma do painel.
- `five_hour` vira "5h", `seven_day` vira "7 dias" e `spend_limit` vira "gasto". Outro `kind`
  aparece como vem.

**Janela exata:** a barra não muda. Com `source: 'mod'`, o tooltip da contagem diz "janela
informada pelo Claude Code".

**Rodapé da ponte:** uma linha discreta no fim do bloco de uso. O snapshot ganha
`bridge?: 'off' | 'active' | 'next-session' | 'silent'`, que o core decide e o `App.svelte` passa
à tabela.

| Estado | Quando | Texto | Ação |
|---|---|---|---|
| `off` | Mod não instalado | Dados exatos (experimental) | Ativar |
| `active` | Instalado, e a sessão exibida tem arquivo | Dados exatos do Claude Code | Desativar |
| `silent` | Instalado, sessão viva cujo processo começou depois de `installedAt`, há mais de 60 s, sem arquivo | A ponte não respondeu nesta sessão (os Mods podem estar desligados) | Desativar |
| `next-session` | Instalado, nos demais casos sem arquivo | Dados exatos a partir da próxima sessão | Desativar |

Ativar e Desativar pedem confirmação no diálogo nativo do IDE. Não há toast oferecendo a ponte na
ativação, para não insistir com algo experimental.

**i18n:** as chaves novas entram nos cinco idiomas do painel
([messages.ts](../../src/i18n/messages.ts)), do `package.nls*.json` (os dois comandos) e do
`NotifyMessages.kt` (o diálogo do JetBrains).

### 9. Watcher e limpeza

- O `TodosWatcher` passa a observar `<claudeDir>/.vscode-todos-bridge/live/`, sem recursão, ao
  lado das pastas de hoje ([todosWatcher.ts:17](../../src/services/todosWatcher.ts#L17)).
- O `SessionCore.pruneBridge` ([sessionCore.ts:66](../../src/core/sessionCore.ts#L66)) passa a
  apagar de `live/` os arquivos com mtime acima de 30 dias.

### 10. Documentação

- **READMEs (5):** a tabela de privacidade ganha `env.CLAUDE_CODE_PLUGIN_DIRS` no `settings.json`
  e as pastas `mod/` e `live/`, e uma nota de solução de problemas explica o estado "não
  respondeu".
- **CHANGELOG:** entrada em `[Unreleased]`, seção Added.
- **ROADMAP:** item 25 (ponte entregue) e item 2 (janela exata para quem instalar).

## Alcance

- **Novo:** `src/bridgeMod/state.ts`, `mod/claude-todos-bridge/` (manifesto, `hooks.json`,
  `register.ts`), `scripts/buildBridgeMod.mjs`, `src/generated/bridgeModFiles.ts` (gerado),
  `src/services/bridgeModInstaller.ts`, `src/services/bridgeLive.ts`.
- **Core e serviços:** `src/core/sessionCore.ts` (leitor, instalador, `turnEndedAt`, estado da
  ponte, limpeza), `src/core/dispatcher.ts` (dois comandos), `src/services/snapshotService.ts`
  (janela, limites, ciclo de vida, estado), `src/services/todosParser.ts` (mapa extra no
  `mergeLifecycles`), `src/services/sessionNotifier.ts` (`turnEndedAt`),
  `src/services/todosWatcher.ts` (`live/`), `src/types.ts`.
- **Hosts:** `src/extension.ts` (mensagens, comandos, atualização na ativação),
  `MessageRouter.kt` e `NotifyMessages.kt` no JetBrains.
- **Webview:** `UsageTable.svelte`, `App.svelte`, `format.ts`, `stores.svelte.ts` e `messages.ts`.
- **Build e manifesto:** `package.json` (scripts, comandos), `package.nls*.json`, `.gitignore`
  (`src/generated/`) e `.vscodeignore` (`mod/**`, que já viaja dentro do bundle).
- **Docs:** os cinco READMEs, `CHANGELOG.md` e o ROADMAP ao entregar.

## Fora de escopo

- Custo da sessão (decisão do brainstorm: a v1 entrega janela, fins exatos e limites).
- Estados `failed` e `killed` na UI. O arquivo guarda o `reason`, mas todo fim continua aparecendo
  como "concluído".
- Aviso de "esperando permissão".
- Marketplace no repositório.
- Histórico de uso ao longo do tempo.
- Limites de uso numa sessão sem uso, onde o bloco de uso não aparece.
- A pasta solta `Userscarlo.claude/` na raiz do repo, criada pelo watcher a partir de um claudeDir
  mal escapado.

## Riscos

- **Early access.** A API pode mudar e a Anthropic pode desligar os Mods remotamente. Nos dois
  casos o painel cai no parser e o rodapé mostra "não respondeu".
- **`CLAUDE_CODE_PLUGIN_DIRS` também no ambiente do processo.** Uma das duas definições pode
  prevalecer e o mod não carregar; o resultado é o mesmo estado "não respondeu", e o README trata
  do caso.
- **Versões diferentes do Claude Code na mesma máquina.** Só o ciclo de vida dos agentes depende
  da versão; janela e limites valem de qualquer versão que os grave.
- **Escrita não atômica.** O leitor mantém a última leitura boa de cada arquivo.
- **Atualizar a extensão regrava o mod**, e as sessões abertas o recarregam. Acontece só quando o
  conteúdo muda.

## Testes

Tudo em Node (`vitest`), com fixtures no formato da decisão 3.

- `tests/bridgeMod/state.test.ts`:
  - spawn → `running`; fim de turno do agente → `stopped`; spawn negado não entra;
  - fim de turno do main → `turn.state = "idle"`; fim da sessão → `"ended"` com o motivo;
  - troca de id (`/clear`) começa um estado novo;
  - restauração a partir do texto do arquivo, inclusive inválido ou de outro `schema`;
  - teto de 500 agentes, mantendo os de evento mais recente;
  - derivação da pasta de saída a partir de `$.plugin.root`, com `\` e `/`, e o caminho
    alternativo pelo ambiente.
- `tests/services/bridgeLive.test.ts`: arquivo ausente; arquivo pela metade mantém a última
  leitura boa; `schema` desconhecido; id inválido; cache por mtime e tamanho; a leitura de
  limites mais recente entre vários arquivos.
- `tests/services/bridgeModInstaller.test.ts`:
  - `env` ausente, vazio ou com entradas do usuário (separador do sistema);
  - idempotência, inclusive instalando duas vezes;
  - desinstalar remove só a nossa entrada e apaga a chave vazia;
  - `settings.json` inválido aborta sem gravar;
  - a atualização regrava só os arquivos que mudaram.
- `tests/services/snapshotService.test.ts`: janela substituída com `source: 'mod'`; limites com
  reset vencido escondidos; ciclo de vida usado com `engineVersion` 2.1.289 e ignorado com
  2.1.286; os quatro estados do rodapé.
- `tests/services/sessionNotifier.test.ts`: `idle` imediato com fim de turno fresco e nenhum
  sub-agent rodando; fim de turno mais antigo que a última mensagem segue a regra de 45 s; sem o
  campo, os casos atuais seguem iguais.
- `tests/core/sessionCore.test.ts`: `turnEndedAt` preenchido só com sessão viva e a partir de
  `aliveSince`; a limpeza apaga arquivos de `live/` com mais de 30 dias.
- `tests/services/todosWatcher.test.ts`: uma mudança em `live/` dispara o refresh.
- **Manual:** `claude plugin validate` sobre o mod montado; a UI conferida com a skill
  `preview-webview`; de ponta a ponta, ativar pelo painel no VS Code e no JetBrains, abrir uma
  sessão nova, ver o arquivo e os dados exatos no painel, desativar e conferir que o
  `settings.json` voltou ao que era.

## Errata da execução (2026-10-06)

O plano `docs/plans/2026-10-06-ponte-de-dados-mod.md` é anterior a estas decisões; onde ele ou as
seções acima divergirem delas, vale esta seção.

- O módulo gerado com os arquivos do mod fica em `src/bridgeMod/modFiles.generated.ts` (fora do
  git pelo padrão `src/bridgeMod/*.generated.ts`), e não em `src/generated/bridgeModFiles.ts`: o
  teste `tests/site/stores.test.ts` protege a pasta `src/generated/` contra um bug antigo do site.
- A ponte entra no `mergeLifecycles` só com os fins de agente; o início e a retomada continuam
  vindo do transcript. Um início cujo fim se perdesse (recarga do mod) deixaria "rodando" um
  agente que o transcript já dá como concluído.
- Depois de um aviso de ociosidade (por silêncio ou pelo fim de turno da ponte), a próxima
  atividade abre uma rajada nova: uma resposta rápida seguida de um turno curto não avisa de novo.
- O painel não cai com dado estranho porém válido no arquivo: as linhas de limites são chaveadas
  pela posição, e o horário de leitura fora do intervalo de datas é omitido.
- O link Ativar/Desativar do rodapé usa a cor de link do tema com fallback para a cor de
  destaque, porque o tema do JetBrains não define a cor de link.
- A checagem de tipos de desenvolvimento do mod roda com `--allowImportingTsExtensions`; o
  `import './state.ts'` funciona no engine.
