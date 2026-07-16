# Hint de lista defasada (main parado + sub-agent rodando) — design

**Roadmap:** item 19 · Origem: caso real de 2026-07-14 (lista "0/8, Task 1 in_progress há
17min" enquanto sub-agents avançavam — parece bug do painel, é vício do agente).

## Problema

Quando o orquestrador cria a lista de tasks e delega tudo a sub-agents sem voltar a chamar
`TodoWrite`, o painel mostra fielmente uma lista parada — e o usuário lê como bug. Falta um
sinal de que a lista está defasada **sem** esconder nem "corrigir" o dado (o painel continua
espelho fiel do transcript).

## Decisões

1. **Fonte do "última atualização da lista": timestamp do evento no transcript.**
   - Schema `TodoWrite`: o `timestamp` da linha onde `readLastTodoWriteSnapshot` achou o
     último snapshot.
   - Schema `TaskCreate`/`TaskUpdate`: o maior `timestamp` entre os eventos do stream.
   - Novo campo opcional `todosUpdatedAt?: number` (epoch ms) em `AgentTodos`, preenchido
     para qualquer agente quando determinável. Transcripts antigos sem `timestamp` → campo
     ausente → sem hint (degradação graciosa).
   - Alternativas descartadas: mtime do transcript (avança a cada mensagem — inútil) e
     max de `startedAt`/`completedAt` dos todos (erra quando o TodoWrite só adiciona tasks
     `pending`, caso comum de lista defasada).
2. **Condição do hint** (todas simultâneas), computada em função pura testável
   (`listStaleness` em `src/webview/format.ts`):
   - agente main com `todosUpdatedAt` definido;
   - main tem ≥1 task **não**-`completed` (lista 100% concluída não engana ninguém);
   - existe ≥1 sub-agent com `status === 'running'` no snapshot;
   - `now − todosUpdatedAt ≥ 5 min` (limiar generoso, anti-ruído).
3. **Apresentação:** texto sutil no cabeçalho do main — *"lista sem atualização há 17min"* —
   cor `descriptionForeground`, duração ao vivo via relógio compartilhado
   (`clock.svelte.ts`), `title` com a explicação: o main não atualiza a lista, mas há
   sub-agents ativos; o progresso real pode estar nos cards abaixo. i18n en/pt-br/es.
4. **Fluxo de dados:** `hasRunningSubAgent` é derivado no `App.svelte` a partir de
   `snapshot.agents` e passado como prop até o cabeçalho do main (a condição cruza
   agentes; o componente do agente não enxerga os irmãos).

## Fora de escopo

- Qualquer "correção" automática da lista ou merge com o estado dos sub-agents.
- Hint para sub-agents (o problema observado é do orquestrador).

## Testes

- Parser: `todosUpdatedAt` extraído nos dois schemas; ausente quando as linhas não têm
  `timestamp`.
- `listStaleness`: cada condição isoladamente (sem todos, tudo completed, sem sub-agent
  running, abaixo do limiar, sem `todosUpdatedAt`) + caso positivo com duração correta.
- Visual: preview-webview do cabeçalho do main com o hint ativo.
