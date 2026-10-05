# Sub-agents em background e janela do Fable — design

**Roadmap:** R6 (achados 1 e 2) e item 2 (bug da janela do Fable) · Origem: varredura
2026-10-04 — [#93672](https://github.com/anthropics/claude-code/issues/93672) (o mesmo defeito
no `idle_prompt` oficial, corrigido na 2.1.288), [#94872](https://github.com/anthropics/claude-code/issues/94872) (agentes órfãos "rodando" para
sempre), [#95601](https://github.com/anthropics/claude-code/issues/95601) e [#97271](https://github.com/anthropics/claude-code/issues/97271) (formas e falhas da notificação de conclusão),
[CHANGELOG 2.1.285 e 2.1.287](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) (Fable entre os modelos de 1M).

Tarefa 0 do trabalho com Mods (ROADMAP, item 25): o parser precisa estar certo para todos os
usuários antes de existir uma ponte de dados opcional. A ponte vem depois, num spike próprio.

## Problema

1. **Sub-agent em background aparece como concluído enquanto roda.** Quando a chamada `Agent`
   roda em background, o `tool_result` chega na hora, com `agentId`, e o `collectDispatches`
   trata a presença de `agentId` como fim
   ([todosParser.ts:458](../../src/services/todosParser.ts#L458)). O nó vai para o grupo de
   histórico da árvore ([tree.ts:10](../../src/webview/tree.ts#L10)), e a faixa de lista
   defasada (item 19), que exige sub-agent rodando, nunca aparece nesse cenário.
2. **O toast de "ociosa" dispara com agentes trabalhando.** O notifier usa só a última mensagem
   do transcript do main como marcador de atividade
   ([sessionCore.ts:128](../../src/core/sessionCore.ts#L128)). No padrão "o main dispara
   agentes em background e encerra o turno", o main fica em silêncio enquanto os sub-agents
   trabalham, e o toast sai 45 s depois. Deduzido do código; é o defeito de #93672.
3. **A janela do Fable sai como 200k.** O `ONE_M_FAMILY`
   ([usageParser.ts:12](../../src/services/usageParser.ts#L12)) só reconhece `opus|sonnet`, e o
   transcript grava `claude-fable-5-1` sem o sufixo `[1m]`. Com 150k de contexto o painel mostra
   75% (amarelo) quando o real é 15%; ao passar de 200k o limite pula para 1M.

## O dado, medido antes de desenhar

Disco local, `~/.claude/projects`, 30 dias até 2026-10-04.

**Disparos assíncronos.** 103 de 473 chamadas `Agent` foram assíncronas: 67 com
`run_in_background: true` e 36 sem a flag (o harness moveu para background). O transcript do
sub-agent continuou recebendo mensagens por uma mediana de 7,5 min depois do `tool_result`
(p90 26 min, máximo 6,4 h).

**Os três eventos do ciclo de vida, no transcript de quem disparou:**

| Evento | Como aparece | Efeito |
|---|---|---|
| Lançamento | `tool_result` da chamada `Agent` com `toolUseResult = { isAsync: true, status: "async_launched", agentId, resolvedModel, outputFile, … }`; o texto começa com "Async agent launched successfully" e traz `agentId: <id>` | rodando |
| Retomada | `tool_result` de um `SendMessage` com `toolUseResult = { success: true, message: "Resuming agent …", resumedAgentId }` (o mesmo JSON no texto) | rodando |
| Parada | entregue **entre turnos**: mensagem `user` com `content` em string; entregue **no meio de um turno** do main: `attachment` com `type: "queued_command"` e o texto em `attachment.prompt`. Nos dois, o texto é `<task-notification>` com `<task-id>` (= `agentId`), `<tool-use-id>`, `<status>` (`completed`, `failed`, `stopped`) e `<summary>` | parado |

Detalhes que o design precisa respeitar:

- A notificação aparece também como `queue-operation` (`content` no nível de cima: `enqueue` e,
  no meio do turno, `remove`). Só a entrega conta (a mensagem `user` ou o `attachment`).
  *Corrigido na revisão final:* a primeira versão desta spec conhecia só a mensagem `user`.
- Uma retomada gera uma nova notificação com o **mesmo `task-id`** e o `tool-use-id` do
  `SendMessage`. A chave do ciclo de vida é o `agentId`, nunca o `tool-use-id`.
- Background shells também geram `<task-notification>`, com `task-id` que não é de agente. Não
  casam com nenhum sub-agent e são ignorados.

**O modelo, validado** (medição refeita na revisão final, 2026-10-05). Estado = último evento
por `agentId`. Dos 112 agentes assíncronos, 111 terminam em "parado": 98 com a notificação
entregue entre turnos e 15 no meio de um turno, 13 deles só nesse formato. **Nenhum** teve
mensagem no próprio transcript depois da parada, e as retomadas foram cobertas. Sobra 1 sem
parada. A primeira medição, que só lia a mensagem `user`, contou os 13 do meio do turno como
órfãos de sessões mortas; não eram.

**Aninhados.** Um transcript de sub-agent tinha um lançamento assíncrono. Ali não existe
`toolUseResult` (o enriquecimento é só do transcript principal), mas o texto do `tool_result`
traz a mesma frase e o `agentId`, e a notificação chega no mesmo arquivo.

**Registro de sessões vivas.** Os registros em `~/.claude/sessions/*.json` eram todos de
`entrypoint: "claude-vscode"`. Os transcripts também têm `sdk-cli` (execuções `-p`), e não há
como saber daqui se esse entrypoint grava o registro. Cada registro traz `startedAt` (epoch ms):
o início **do processo**, não da sessão. Uma sessão retomada tem o mesmo `sessionId` e um
processo novo. No disco, a sessão `04061916` estava viva desde 2026-10-04 22:24Z com agentes
lançados em 28/09, que morreram com o processo anterior (achado da revisão final).

**Fable.** 45 transcripts com `claude-fable-5-1`, contexto máximo de 962k, 6.071 records acima
de 200k, nenhum com `[1m]` no id do modelo.

## Decisões

### 1. Um módulo puro para o ciclo de vida: `agentLifecycle.ts`

`src/services/agentLifecycle.ts`, sem acesso a arquivos, no mesmo estilo de
`detectAwaitingInput`:

```ts
export type LifecycleState = 'running' | 'stopped';
export interface LifecycleEntry { state: LifecycleState; at: number }

// Eventos de ciclo de vida de sub-agents assíncronos nas linhas de UM transcript
// (o de quem disparou). Chave: agentId. O último evento vence.
export function collectAgentLifecycle(lines: string[]): Map<string, LifecycleEntry>;

// Junta mapas de transcripts diferentes: para o mesmo agentId, vence o maior `at`.
export function mergeLifecycles(maps: Map<string, LifecycleEntry>[]): Map<string, LifecycleEntry>;
```

Regras de leitura, por linha:

- **Pré-filtro por substring** antes do `JSON.parse` (`async_launched`, `Async agent launched`,
  `resumedAgentId`, `<task-notification>`), como o `readSessionTitle` já faz: o transcript
  principal pode ter dezenas de milhares de linhas.
- Entram records `type === "user"` e `type === "attachment"` (`queued_command`). O
  `queue-operation` fica de fora por construção.
- **Lançamento:** `toolUseResult.status === "async_launched"` com `agentId` string; sem
  `toolUseResult`, um bloco `tool_result` cujo texto **começa** com "Async agent launched" e casa
  `agentId: ([\w-]+)`. Saída de ferramenta que só menciona a frase não conta.
- **Retomada:** `toolUseResult.resumedAgentId` string; sem `toolUseResult`, o texto do
  `tool_result` quando é um JSON com `resumedAgentId` **no nível de cima** (o formato de todas
  as 69 retomadas reais do disco). Um registro de transcript colado como saída de ferramenta
  (`cat`, `grep`) tem o campo aninhado e não conta (revisão final).
- **Parada:** `message.content` string, ou `attachment.prompt` de um `queued_command`, que
  **começa** com `<task-notification>`; o `agentId` sai de `<task-id>`. O `<status>` não muda
  nada nesta entrega (ver "Fora de escopo").
- `at` é o `timestamp` do record (epoch ms; 0 sem timestamp). Dentro de um transcript vale a
  ordem das linhas; entre transcripts, o `mergeLifecycles` usa `at`.
- O texto de um `tool_result` pode vir como string ou como array de blocos `{ type: "text" }`;
  os dois são lidos.

### 2. Integração no `todosParser`: o status muda numa regra só

`listSubAgents` já lê o transcript principal e cada `agent-*.jsonl` inteiros. Na mesma passada,
calcula `collectAgentLifecycle` para o main e para cada sub-agent e junta com
`mergeLifecycles`. O status de um sub-agent, nos dois caminhos de casamento (por
`meta.toolUseId` e pelo legado por prompt), passa a ser:

```ts
const lc = lifecycle.get(info.agentId);
const running = dispatch.result === 'none'
  || (sessionAlive && lc?.state === 'running' && (aliveSince === undefined || lc.at >= aliveSince));
status = running ? 'running' : 'completed';
```

- `dispatch.result === 'none'` é o foreground sem `tool_result`: **inalterado**.
- Um agente assíncrono vira "rodando" pelo ciclo de vida enquanto o processo vivo da sessão é o
  que o lançou ou retomou (decisão 3).
- Um agente em foreground que já terminou e foi retomado por `SendMessage` também volta a
  "rodando" pelo ciclo de vida, pelo mesmo caminho.
- `rejected` continua igual: o nó nem entra na lista.
- O `TranscriptEntry` e o `Dispatch` do parser não mudam: o `agentLifecycle` tem o próprio tipo
  de entrada.

### 3. Liveness só para o ciclo de vida, pelo processo vivo, decidida no `SnapshotService`

`listSessionDetail(sessionId, cwd, opts?: { alive?: boolean; aliveSince?: number })`. Sem a
opção, `alive` é `false`, e todo agente assíncrono aparece concluído: o comportamento de hoje,
então nenhum chamador antigo muda sem querer. O `SnapshotService.build()` passa
`alive: chosen.alive === true` (o mesmo `alive` do picker, lido de `~/.claude/sessions/{pid}.json`)
e `aliveSince` = `startedAt` desse registro.

*Corrigido na revisão final:* "sessão viva" não é "o processo que lançou o agente está vivo".
Agentes em background vivem no processo; numa sessão retomada (mesmo `sessionId`, processo
novo), os que o processo anterior deixou rodando morreram com ele, mas o último evento deles
ainda é o lançamento. Por isso o ciclo de vida só conta "rodando" para eventos a partir de
`aliveSince`. Uma retomada por `SendMessage` no processo atual gera um evento novo e continua
valendo. Sem `startedAt` no registro, não há limite (a regra anterior).

O `TodosWatcher` passa a observar `~/.claude/sessions`: quando um processo encerra, o registro
sai e o painel redesenha na hora, nos dois IDEs, sem esperar uma escrita em `projects/`.

A liveness **não** se aplica ao foreground. Se um entrypoint não grava o registro (o `sdk-cli`
é o candidato), aplicá-la ao foreground apagaria um agente rodando de verdade numa sessão viva.
Para os assíncronos o risco é aceitável: sem registro, eles aparecem concluídos, como hoje.
Órfãos em foreground (a sessão morreu no meio de um agente) continuam como estão.

### 4. Notifier: sub-agent rodando conta como atividade

`NotifierInput` ganha `subAgentRunning?: boolean`. O `SessionCore.observeForNotifications()`
calcula o valor do snapshot que já monta: algum agente não-main com `status === 'running'`.

No `SessionNotifier.observe()`, um observe com `subAgentRunning` é tratado como **atividade**,
do mesmo jeito que uma mudança no marcador do main: mantém a rajada viva, atualiza
`lastChangeAt`, zera `idleNotified` e não dispara `idle`. Assim:

- Enquanto há agente rodando, o toast de ociosa não sai.
- Quando os agentes terminam, a notificação de conclusão chega ao main como mensagem nova
  (atividade), o main fecha o turno, e 45 s de silêncio disparam o `idle`. A rajada inclui o
  trabalho dos agentes, então o mínimo de 60 s de atividade é cumprido mesmo se o fechamento
  do main for curto.

O `shouldPoll()` passa a devolver `true` também enquanto o último observe teve
`subAgentRunning`. Sem isso, no VS Code o timer de 10 s pararia durante um comando longo e
silencioso de um sub-agent, e a rajada se partiria. No JetBrains nada muda: o timer do plugin
já chama `observe` a cada 10 s, sem condição.

`allComplete` e `awaitingInput` não mudam. Custo aceito: uma sessão morta com um órfão em
foreground mantém o timer do VS Code ativo (um snapshot a cada 10 s) enquanto estiver exibida.

### 5. Fable com janela de 1M

`ONE_M_FAMILY` passa a `/(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)|fable/i`. Haiku continua com 200k.
Mythos fica de fora: não há evidência de janela de 1M no CHANGELOG nem no disco.

Decisão tomada no brainstorm, com o risco conhecido: no Pro/Team sem usage credits o Fable roda
em 200k (CHANGELOG 2.1.268), e o painel sub-reporta nesses casos. É o mesmo risco que Opus e
Sonnet já têm hoje. A ponte de dados via mod (item 25) traz a janela exata para quem instalar.

## Alcance

- **Serviços:** `src/services/agentLifecycle.ts` (novo), `src/services/todosParser.ts`
  (lifecycle em `listSubAgents`, opções `alive` e `aliveSince` em `listSessionDetail`),
  `src/services/snapshotService.ts` (passa `alive` e `aliveSince`),
  `src/services/liveSessions.ts` (lê `startedAt`), `src/services/todosWatcher.ts` (observa
  `~/.claude/sessions`), `src/services/sessionNotifier.ts` (`subAgentRunning` e `shouldPoll`),
  `src/services/usageParser.ts` (`ONE_M_FAMILY`). Os três do meio entraram na revisão final.
- **Core:** `src/core/sessionCore.ts` (calcula `subAgentRunning`).
- **Webview, hosts, i18n, READMEs:** nenhuma mudança. O status já existe no snapshot e a
  webview e o núcleo são os mesmos nos dois IDEs.
- **Docs:** `CHANGELOG.md` (Unreleased) e o ROADMAP ao entregar (R6 ✅ achados 1 e 2; item 2,
  bug do Fable ✅).

## Fora de escopo

- Visual próprio para `failed`/`stopped`: no disco foram 2 e 1 casos; todos viram "concluído".
- Inatividade como reserva para notificação perdida com a sessão viva: decidido no brainstorm
  que só a liveness vale (agentes ficam ativos por horas; um limite de tempo marcaria como
  concluído um agente num comando longo).
- Órfãos em foreground e liveness para o foreground (decisão 3).
- A ponte de dados via mod e o spike que a precede (item 25).
- Atualizar a regra das task tools para a lista de permissão da 2.1.268 (R2, card próprio).

## Testes

Tudo em Node (`vitest`). Fixtures no formato real descrito em "O dado".

- `tests/services/agentLifecycle.test.ts`:
  - lançamento → `running`; lançamento + notificação → `stopped`;
  - lançamento → notificação → retomada → `running`; mais uma notificação → `stopped`;
  - a cópia em `queue-operation` sozinha não para o agente;
  - notificação de background shell (task-id sem lançamento) não interfere nos agentes;
  - transcript sem `toolUseResult`: lançamento e retomada lidos pelo texto (string e array);
  - `tool_result` de um `Agent` síncrono (`status: "completed"`, texto do relatório) não gera
    evento;
  - linhas malformadas ou sem timestamp não derrubam a leitura;
  - `mergeLifecycles`: para o mesmo `agentId`, vence o maior `at`.
- `tests/services/todosParser.test.ts`:
  - sessão viva, assíncrono sem notificação → `running`;
  - sessão viva, assíncrono notificado → `completed`;
  - sessão morta (`alive: false` ou opção ausente), assíncrono sem notificação → `completed`;
  - foreground sem `tool_result` → `running` mesmo com `alive: false`;
  - foreground concluído e retomado por `SendMessage`, sessão viva → `running`;
  - aninhado: o sub-agent lança outro em background → o neto aparece `running` (sessão viva);
  - os casos atuais continuam verdes.
- `tests/services/snapshotService.test.ts`: o `alive` do registro chega ao parser (sessão no
  registro → assíncrono `running`; fora dele → `completed`), e o `startedAt` chega como
  `aliveSince`.
- Revisão final: parada entregue no meio do turno (`attachment`); registro de transcript colado
  como saída de ferramenta não retoma; sessão retomada (processo novo) não ressuscita agentes;
  `liveSessions` lê `startedAt`; o watcher dispara quando o registro muda.
- `tests/services/sessionNotifier.test.ts`:
  - com `subAgentRunning` em observes espaçados de 10 s, nenhum `idle`, mesmo além de 45 s;
  - agentes terminam, o marcador do main muda, 45 s de silêncio → `idle` dispara, mesmo com o
    fechamento do main menor que 60 s;
  - `shouldPoll` fica `true` enquanto o último observe teve `subAgentRunning`;
  - sem o campo, os casos atuais seguem iguais.
- `tests/core/sessionCore.test.ts`: `observeForNotifications` passa `subAgentRunning` a partir
  do snapshot.
- `tests/services/usageParser.test.ts`: `contextLimitFor('claude-fable-5-1')` e
  `contextLimitFor('claude-fable-5')` = 1M; `claude-haiku-4-5-20251001` = 200k;
  `claude-opus-5-5` e `claude-sonnet-5-5` = 1M.
- **Manual, com dados reais:** rodar o snapshot sobre um transcript do disco com agentes em
  background (sessão viva com agente rodando e uma sessão encerrada) e conferir a árvore no
  painel (F5); repetir no JetBrains (`gradlew runIde`) só para a árvore, já que o código é o
  mesmo.
