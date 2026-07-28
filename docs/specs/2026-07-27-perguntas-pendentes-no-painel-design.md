# Perguntas pendentes no painel — design

**Roadmap:** item 22-ext · Origem: varredura 2026-07-25 —
[#79078](https://github.com/anthropics/claude-code/issues/79078) pede um painel lateral que
**liste as perguntas em aberto** de uma conversa.

Continuação direta do item 22 (0.15.0), cujo spec
([2026-07-17](./2026-07-17-awaiting-input-notification-design.md)) deixou
explicitamente fora de escopo o *"hint visual 'aguardando' dentro do painel (só toast;
reavaliar depois)"*. Esta é a reavaliação.

## Problema

O toast da 0.15.0 avisa que a sessão parou numa pergunta, mas o aviso é efêmero e só dispara
com a janela sem foco. Quem volta ao painel depois não tem como saber que a sessão está
esperando — nem **sobre o quê**. O dado existe: `detectAwaitingInput` já localiza a pendência
no transcript, mas descarta tudo menos o tipo (`'question' | 'plan'`).

## O dado, medido antes de desenhar

Varredura de todo o `~/.claude/projects` (2026-07-27): **320 chamadas** de
`AskUserQuestion`/`ExitPlanMode` em 142 arquivos.

| Perguntas na mesma chamada | Chamadas |
|---|---|
| 1 | 273 (85%) |
| 2 | 27 |
| 3 | 15 |
| 4 | 5 |

Pico de perguntas simultaneamente pendentes, por sessão: 1 em 30 sessões, 2 em 10, 3 em 13,
4 em 4. **Nunca houve duas chamadas concorrentes abertas** — todo pico >1 vem de uma única
chamada multi-pergunta (`AskUserQuestion` aceita até 4 no mesmo `tool_use`).

Consequência para o design: "lista de perguntas em aberto" = as sub-perguntas do **último
`tool_use` pendente**. Não é preciso acumular pendências de chamadas diferentes; fazê-lo seria
resolver um caso que o dado não produz.

Formato confirmado em transcript real:
`AskUserQuestion.input.questions[] = {question, header, options[{label,description}],
multiSelect}`; `ExitPlanMode.input.plan` = markdown.

## Decisões

1. **Campo novo no snapshot; `awaitingInput` intocado.**
   - `SessionSnapshot` ganha `pendingQuestions?: PendingQuestion[]`, com
     `PendingQuestion = { kind: 'question' | 'plan'; header?: string; text: string; line: number }`.
   - `kind` existe para o webview escolher rótulos **localizados** sem que o parser precise
     conhecer locale: o core (que não importa `vscode` nem o catálogo) nunca produz texto
     visível — só dado.
   - `AwaitingInput` continua `'question' | 'plan'`. O `SessionNotifier` compara esse valor
     **por identidade** ([sessionNotifier.ts:59](../../src/services/sessionNotifier.ts#L59))
     para decidir o disparo; transformá-lo em objeto quebraria a comparação, os testes do
     notifier e a ponte do JetBrains em troca de elegância de tipo.
   - As duas features passam a ler a mesma detecção sem se acoplar: o toast responde à
     transição de tipo, a faixa renderiza a lista.
2. **Parser: `detectPendingQuestions(lines, skipSidechain)`, irmã da detecção atual.**
   - Mesma mecânica de `tool_use` sem `tool_result` casado por id, mesma regra de pular
     `isSidechain` (sub-agents não conversam com o usuário).
   - Guarda o conteúdo, que hoje é descartado: para `AskUserQuestion`, **um item por entrada**
     de `input.questions[]` (`kind: 'question'`, `header` → `header`, `question` → `text`);
     para `ExitPlanMode`, **um item único** (`kind: 'plan'`, `header` ausente, `text` =
     primeira linha não vazia do `plan`).
   - Cada item carrega `line` = índice (0-based) da linha do `tool_use` no transcript do main —
     o que o clique precisa.
   - Só o **último** `tool_use` pendente vira lista (justificativa na seção acima).
   - Entrada malformada (sem `questions`, `question` não-string, `plan` vazio) é ignorada item
     a item; nunca lança.
3. **Webview: `PendingQuestions.svelte`, no topo.**
   - Renderizado em [App.svelte](../../src/webview/App.svelte) logo após `</header>` e
     **antes** do `UsageTable`: a sessão estar parada esperando o usuário é a informação mais
     acionável do painel.
   - Título: `app.pendingPlanTitle` quando a lista é um único item `kind: 'plan'`; caso
     contrário `app.pendingQuestions` com a contagem. Um item por pergunta: chip com o
     `header` (para `kind: 'plan'`, o chip fixo `app.pendingPlanChip`; omitido quando o
     `header` falta) + o `text`.
   - **Sem** as opções da pergunta: mesmo com 4 perguntas a faixa cabe numa sidebar estreita
     sem empurrar as tasks para fora da tela.
   - Clique no item reusa `openTodoSource` (0.12.0, item 1) com
     `{sessionId, agentId: sessionId, line}` — a pendência é sempre do main.
   - Componente é função pura do snapshot, sem estado próprio: some sozinho quando o
     `tool_result` chega (resposta, rejeição ou timeout do harness).
4. **Aparece independentemente do foco da janela.** A faixa é passiva — ao contrário do toast,
   que segue gated por foco + setting `claudeTodos.notifications`. Consequência deliberada: a
   faixa aparece mesmo com as notificações desligadas, porque não interrompe nada.

## Alcance

Webview e `SessionCore` são compartilhados desde a 0.16.0, então a faixa aparece no **VS Code
e no JetBrains** sem código específico de host. O `snapshotService` apenas propaga o campo
novo, como já faz com `awaitingInput`
([snapshotService.ts:61](../../src/services/snapshotService.ts#L61)).

i18n: **3 chaves novas** × 5 idiomas em [messages.ts](../../src/i18n/messages.ts) (`en`,
`pt-br`, `es`, `zh-cn`, `zh-tw`), com o chinês seguindo o
[glossário](../i18n/glossary-zh.md):

| Chave | pt-br |
|---|---|
| `app.pendingQuestions` | `{n} perguntas em aberto` |
| `app.pendingPlanTitle` | `Plano aguardando aprovação` |
| `app.pendingPlanChip` | `Plano` |

Forma única com placeholder, **sem** tratamento de plural — é a convenção do catálogo atual
(`'project.sessions': '{n} sessions'`, `'agent.activeBadge': '{count} active'`). Divergir só
aqui criaria uma segunda regra de i18n no projeto para ganhar concordância num caso que
representa 15% das ocorrências.

## Fora de escopo

- **Responder a pergunta pelo painel.** O painel é read-only por princípio; responder exige
  escrever no processo do Claude Code.
- **Acumular pendências de chamadas diferentes.** O dado não produz esse caso (0 em 320
  chamadas medidas).
- **Mostrar as opções de resposta.** Decidido na fase de design: custo vertical alto,
  benefício baixo para quem vai responder na sessão de qualquer forma.
- **Perguntas de sub-agents (sidechain)** — mantido do item 22.
- **Prompts de permissão** — não chegam ao transcript; limitação de dado herdada do item 22.

## Testes

`detectPendingQuestions` é função pura sobre `string[]`, testável direto. Casos, todos com
formato verificado em disco:

- `AskUserQuestion` com 1, 3 e 4 perguntas → lista do tamanho certo, `header` e `text`
  corretos, `line` apontando para o `tool_use`.
- `ExitPlanMode` → item único, `kind: 'plan'`, sem `header`, `text` = primeira linha não vazia
  do plano.
- Pendência resolvida por `tool_result` → lista vazia.
- Duas chamadas, a primeira resolvida e a segunda aberta → só a segunda.
- `isSidechain` ignorado; transcript sem essas ferramentas → lista vazia.
- Malformados (sem `questions`, `question` não-string, `plan` só com linhas vazias) → ignorados
  sem lançar.

Webview: teste de que a faixa some quando `pendingQuestions` é vazio/ausente, e de que o chip
é omitido quando `header` falta.
