# Notificação "aguardando sua resposta" (AskUserQuestion/ExitPlanMode) — design

**Roadmap:** item 22 · Origem: varredura 2026-07-16 —
[#57230](https://github.com/anthropics/claude-code/issues/57230) (20r) /
[#26581](https://github.com/anthropics/claude-code/issues/26581) (27r) toasts quando "Claude
needs attention"; [#8985](https://github.com/anthropics/claude-code/issues/8985) (63r) o hook
`Notification` nativo não dispara no VS Code.

## Problema

Quando o agente faz uma pergunta (`AskUserQuestion`) ou apresenta um plano
(`ExitPlanMode`) e o usuário está em outra janela, nada avisa. O idle-notifier atual (item 14)
só dispara após ≥60s de rajada + 45s de silêncio — atraso e mensagem genérica para um caso
que tem sinal explícito no transcript.

## Decisões

1. **Detecção no passe existente do `todosParser` (transcript principal, main only).**
   - A varredura linha a linha já casa `tool_use` ↔ `tool_result` por id (mecânica do tool
     `Agent`, [todosParser.ts](../../src/services/todosParser.ts)). Novo acumulador: cada
     `tool_use` com `name` `AskUserQuestion` ou `ExitPlanMode` registra `{id, kind}`; um
     `tool_result` com `tool_use_id` casando resolve. Entradas `isSidechain` são puladas
     (sub-agents não conversam com o usuário).
   - Ao fim do passe, a pendência **mais recente não resolvida** (ordem do arquivo) vira
     `awaitingInput: 'question' | 'plan'`; nenhuma → ausente.
   - Resolução é automática por dado: resposta do usuário, rejeição E o timeout do harness
     ("continued without an answer", #73125) geram `tool_result` — a pendência limpa sozinha.
   - `SessionSnapshot` ganha `awaitingInput?: 'question' | 'plan'`; o `snapshotService`
     apenas propaga.
   - Alternativas descartadas: passe dedicado com tail-read (I/O novo + parse duplicado) e
     `contextForFile` do usageParser (semântica errada).
2. **Notifier: novo kind `awaitingInput`, disparo imediato na transição.**
   - `NotifierInput.awaitingInput: 'question' | 'plan' | null`.
   - Dispara quando o valor muda de `null` → não-nulo **ou** troca de kind (`question` →
     `plan`): pendência nova = aviso novo. Pendência adicional do MESMO kind com outra ainda
     aberta não re-dispara (anti-ruído).
   - Primeira observação de uma sessão (troca ou estreia) só inicializa — nunca notifica
     (regra existente).
   - **Supressão de idle:** enquanto `awaitingInput` ≠ null, o kind `idle` não dispara (a
     espera já foi explicada; o idle seria ruído duplicado). Resolver a pendência rearma o
     ciclo normal.
   - Sem timer novo: a detecção é dirigida pelo watcher (o `tool_use` muda o mtime do
     transcript); `shouldPoll` inalterado.
3. **Toast:** gates existentes (setting `claudeTodos.notifications` + janela sem foco).
   Prioridade no mesmo ciclo: `allComplete` > `awaitingInput` > `idle` (um toast só).
   Mensagens i18n ×3: `notify.awaitingQuestion` ("aguardando sua resposta") e
   `notify.awaitingPlan` ("plano aguardando aprovação"), com os botões atuais
   ("Abrir painel" / "Não notificar").

## Fora de escopo

- Prompts de permissão (não aparecem no transcript — limitação de dado, documentar no README
  se perguntarem).
- Hint visual "aguardando" dentro do painel (só toast; reavaliar depois).
- Perguntas feitas por sub-agents (sidechain).

## Testes

- Parser: pendente detectado (question e plan); resolvido por `tool_result` (resposta e
  timeout); múltiplas pendências → a mais recente; sidechain ignorado; transcript sem os
  tools → ausente.
- Notifier: transição null→question dispara; question→plan re-dispara; mesma pendência em
  observes seguidos não re-dispara; idle suprimido com pendência aberta e rearmado após
  resolver; primeira observação de sessão não dispara; prioridade com allComplete no mesmo
  ciclo.
- Host: mensagem certa por kind (unit do seletor de mensagem, se extraído; senão coberto por
  revisão manual + i18n keys existentes nos 3 idiomas).
