# Design — Todos clicáveis → mensagem de origem no transcript

**Data:** 2026-07-14
**Status:** aprovado, aguardando plano de implementação
**Origem:** roadmap item 1 — issue [anthropics/claude-code#61543](https://github.com/anthropics/claude-code/issues/61543)
(labels oficiais `area:ide`, `platform:vscode`, `area:ui`)

Clicar numa task do painel abre o transcript `.jsonl` no editor, com a linha da mensagem em
que a task atingiu o status atual selecionada.

---

## Decisões de escopo (validadas com o usuário)

1. **Escopo mínimo:** o clique abre o **`.jsonl` cru** no editor nativo. O viewer legível de
   transcript (renderização amigável) fica para um spec futuro — esta infra de `sourceLine` é
   exatamente o que ele reusará.
2. **Destino do clique:** a linha da **última mudança de status** — onde a task virou o que é
   agora (in_progress, completed…). É onde a ação está.
3. **Abordagem A:** o parser anota a linha durante as passadas existentes; o clique envia
   `{sessionId, agentId, line}` e a extensão resolve o arquivo e abre. Fundamento: transcripts
   são **append-only**, então o índice de linha é estável entre o snapshot e o clique.
   Rejeitadas: guardar `uuid` e re-escanear no clique (robustez contra um cenário que não
   existe, custo extra por clique) e deep link `vscode://` (pertence ao item 7 do roadmap).

---

## Contrato (`types.ts`)

- `Todo` ganha campo opcional:

```ts
sourceLine?: number;  // linha (0-based) no transcript DO AGENTE onde a task
                      // atingiu o status atual; ausente se não determinável
```

Anexado só quando definido (padrão do repo — `makeTodo` estende).

- `WebviewMessage` ganha a variante:

```ts
| { type: 'openTodoSource'; sessionId: string; agentId: string; line: number }
```

---

## Parser (`todosParser`)

### Schema TodoWrite (snapshots)

`extractTodoWriteTimings` já varre os snapshots em ordem cronológica mantendo `prevStatus`
por `content`. Estender o registro para também guardar `statusLine`:

- Task nova no snapshot OU status observado ≠ anterior → `statusLine = índice da linha
  corrente` (a linha do próprio evento TodoWrite).
- Status igual ao anterior → mantém o `statusLine` registrado.
- Task que some e reaparece (regra de reset existente) → a reaparição conta como transição e
  atualiza a linha (coerente com o reset de timing já em vigor).

O merge final em `readLastTodosFromLines` anexa `sourceLine` junto de
`startedAt`/`completedAt` (via `makeTodo` estendido).

### Schema TaskCreate/TaskUpdate (stream)

- `TaskCreate` resolvido (tool_result com id) → `statusLine = linha do tool_use do create`
  (status pending nasce ali).
- Cada `TaskUpdate` válido (taskId conhecido + status válido) → sobrescreve `statusLine` com
  a linha do update.

Em ambos os schemas a linha é do **arquivo do próprio agente** (main → transcript principal;
sub-agent → seu `agent-*.jsonl`), que é o arquivo que o clique abre.

---

## UI (webview)

- `AgentSection` passa `agentId={agent.agentId}` e `sessionId={agent.sessionId}` ao
  `TodoItem` (props novas).
- `TodoItem`: quando `todo.sourceLine !== undefined`, o item vira clicável — cursor pointer,
  `title` i18n ("Abrir no transcript"), acessível por teclado (elemento interativo real, não
  só onclick em `<li>`); visual atual preservado. Sem `sourceLine` → item inerte como hoje.
- Clique → `todosStore.openTodoSource(sessionId, agentId, sourceLine)` → postMessage.
- i18n: chave nova `todo.openSource` nos 3 idiomas.

---

## Extension

Handler no `handleMessage`:

- `agentId === sessionId` (main) → `transcriptPath(claudeDir, sessionId, cwd)`.
- Senão → `path.join(subAgentsDir(claudeDir, sessionId, cwd), 'agent-<agentId>.jsonl')`
  (helpers existentes; `cwd` = primeira pasta do workspace, como nos demais handlers).
- Abre: `vscode.window.showTextDocument(Uri.file(p), { selection: new vscode.Range(line, 0, line, 0), preview: true })`
  — o editor rola até a linha e a seleciona.
- Arquivo inexistente (sessão apagada) → `showWarningMessage` leve, sem crash. Linha além do
  fim (compactação — raro): o VS Code posiciona no fim; degradação aceitável, sem validação
  extra.

---

## Casos de borda

| Caso | Comportamento |
|---|---|
| Task sem transição observada (1º snapshot já no status atual) | `sourceLine` = linha do 1º snapshot em que apareceu nesse status. |
| Content reusado em rodada nova | A regra de reset existente conta como transição → linha da rodada atual. |
| Todo de sessão antiga sem dados suficientes | `sourceLine` ausente → item não clicável (degrada para o comportamento de hoje). |
| Transcript apagado entre snapshot e clique | Aviso leve; nada abre. |
| Linha além do fim do arquivo | VS Code posiciona no fim; aceitável (append-only torna isso raríssimo). |

---

## Testes

- **Parser (dois schemas):** transição atualiza a linha (pending→in_progress→completed aponta
  para a linha do completed); status estável mantém a linha da transição; reuso de content na
  2ª rodada aponta para a rodada nova; TaskCreate sem update aponta para o create; TaskUpdate
  de status sobrescreve; `sourceLine` ausente quando não determinável.
- **i18n:** paridade das chaves (teste existente).
- **Smoke manual:** clicar numa task da sessão ativa e conferir que o editor abre o `.jsonl`
  com a linha certa selecionada (main e sub-agent).
