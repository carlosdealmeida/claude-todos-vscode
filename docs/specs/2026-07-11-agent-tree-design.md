# Design — Árvore de agentes ao vivo ("mission control")

**Data:** 2026-07-11
**Status:** aprovado, aguardando plano de implementação
**Origem:** roadmap item 13 (aposta de produto) — descoberta do `agent-*.meta.json` durante o
debug do release 0.8.2

Exibir a sessão como árvore expansível — Main agent → sub-agents → agentes aninhados — com
tipo do agente e tokens por nó, substituindo o matching heurístico por prompt pelo vínculo
exato via `toolUseId`.

---

## Motivação e o dado novo

Hoje o painel mostra os sub-agents como **lista plana** sob o main, casando cada invocação do
tool `Agent` (no transcript principal) com o arquivo `agent-*.jsonl` cujo primeiro `user`
message tem **prompt idêntico**. Funciona (verificado: 531/531 invocações nos transcripts de
2026-07), mas é heurístico, e **descarta por design** agentes disparados por outros sub-agents
(`spawnDepth ≥ 2`).

Descoberta de 2026-07-10: o Claude Code agora grava, ao lado de cada `agent-*.jsonl`, um
`agent-*.meta.json`:

```json
{"agentType":"general-purpose","description":"Implementar Task 1: parser","toolUseId":"toolu_01MVm…","spawnDepth":1}
```

- `toolUseId` — id do `tool_use` de `Agent` que disparou este sub-agent → **vínculo exato**
  invocação↔arquivo, sem heurística.
- `agentType` — tipo do agente (Explore, Plan, general-purpose, …) → badge por nó.
- `spawnDepth` — profundidade do disparo → hierarquia.

Nenhuma outra extensão mostra isso; é a feature de destaque do posicionamento
"observability para agentes Claude Code" (roadmap, seção de apostas de produto).

---

## Decisões de escopo (validadas com o usuário)

1. **Release única (0.9.0):** matching por `toolUseId` + árvore na UI juntos.
2. **Conteúdo do nó:** card atual + badge do `agentType` + tokens do agente no cabeçalho
   (`usage.byAgent` já existe no snapshot — é exibir, não calcular). Resolve parte do
   roadmap item 6 (tokens por sub-agent).
3. **Compat:** sessões sem `meta.json` caem no matching por prompt atual → lista plana sob o
   main, comportamento idêntico ao de hoje.
4. **Layout escolhido: A — linhas-guia (rails)**, recuo + linha vertical conectando
   pai→filhos, estilo árvore de arquivos do VS Code (mockups comparados no visual companion).

---

## Arquitetura escolhida

**Lista plana + `parentAgentId`; a árvore é montada na webview.** O parser anota parentesco em
campos opcionais do `AgentTodos` existente; o `SessionSnapshot` continua uma lista plana —
stores, `UsageTable` e testes atuais não mudam. Alternativas descartadas: árvore composta no
snapshot (`AgentNode.children[]` — quebra o contrato inteiro para o mesmo resultado visual) e
`TreeDataProvider` nativo (jogaria fora o painel Svelte: cards, timers, i18n).

---

## Parser (`todosParser`)

### Leitura do meta.json

Para cada `agent-*.jsonl` em `subagents/`, tentar ler `agent-*.meta.json` (mesmo basename).
Meta legível → matching por `toolUseId`. Meta ausente ou ilegível → fallback por prompt exato
(código atual), **por arquivo** — uma sessão pode misturar os dois caminhos.

### Índice de parentesco

O pai de um agente X é **o dono do transcript onde `X.toolUseId` aparece como `tool_use`**.
Durante as leituras que o parser já faz (transcript principal + cada `agent-*.jsonl`, todos
lidos integralmente hoje), anotar um índice `tool_use id de Agent → agentId do dono do
transcript` (dono do principal = `sessionId`). Custo incremental ~zero — nenhuma leitura nova
além dos `meta.json` (arquivos de ~150 bytes).

- `spawnDepth: 1` → pai = main (caso comum, resolvível sem índice).
- `spawnDepth ≥ 2` → pai = sub-agent cujo transcript contém o `toolUseId`. Hoje esses agentes
  são descartados; passam a existir como filhos de quem os disparou.

### Nome, status e ordenação

- **Nome do nó:** mantém `input.name ?? input.description` da invocação; para agentes cuja
  invocação está no transcript de outro sub-agent, o mesmo fallback aplicado àquele transcript,
  e em último caso a `description` do meta.json.
- **Status:** `tool_result` correspondente ao `toolUseId` no transcript do pai (mesma técnica
  de hoje, estendida pelo índice): sem result → `running`; com `toolUseResult.agentId` →
  `completed`; result de rejeição → excluído (regra atual).
- **Ordenação entre irmãos:** regra atual mantida (running → com tasks → histórico, depois
  `updatedAt` desc), aplicada **por nível**.

---

## Contrato (`types.ts`)

`AgentTodos` ganha três campos opcionais:

```ts
agentType?: string;      // do meta.json (ex.: "general-purpose", "Explore")
parentAgentId?: string;  // agentId do pai; ausente = filho direto do main (ou main)
depth?: number;          // spawnDepth do meta.json; ausente = comportamento legado
```

Anexados só quando definidos (padrão do repo). Tokens por nó **não** mudam o contrato:
`usage.byAgent` já viaja no snapshot; a webview cruza por `agentId`.

---

## UI (webview)

- **`buildTree` (função pura, novo módulo):** recebe `AgentTodos[]` e devolve a floresta
  `{ agent, children[] }[]` agrupando por `parentAgentId` (raiz = main; órfãos → filhos do
  main). Testável fora do Svelte, como `format.ts`.
- **`App.svelte`:** usa `buildTree` e renderiza `AgentSection` recursivo.
- **Rails (layout A):** recuo por nível + linha vertical em `--vscode-panel-border` e um
  conector horizontal curto por card. Recuo visual limitado a 4 níveis — além disso, achata
  no 4º (o painel é estreito; `spawnDepth > 3` é raríssimo).
- **Badge de tipo:** cores temáticas — Explore verde, Plan amarelo, general-purpose azul,
  demais neutro — via variáveis `--vscode-*` (theme-aware, como o restante do painel).
- **Tokens no cabeçalho do nó:** total compacto (ex.: `45,1k`) somando os modelos do
  `usage.byAgent` do agente; oculto quando não há usage.
- **Colapso:** chevron por nó; default expandido = main e sub-agents `running`; colapsar
  esconde a sub-árvore inteira. (Hoje: `defaultExpanded={isMain}`.)
- **Divisor "histórico":** continua existindo **só no nível raiz** (filhos diretos do main).
- **i18n:** strings novas (tooltip do badge, aria-labels) nos três idiomas, via catálogo
  existente.

---

## Casos de borda

| Caso | Comportamento |
|---|---|
| `meta.json` ausente/corrompido | Fallback por prompt para aquele arquivo; demais seguem por `toolUseId`. |
| `toolUseId` órfão (invocação não encontrada em nenhum transcript — ex. sessão compactada) | Nó vira filho do main, com badge e tasks normais. Nunca some do painel. |
| Sessão 100% antiga (sem nenhum meta.json) | Idêntico a hoje: matching por prompt, lista plana sob o main. |
| Dois arquivos com mesmo `toolUseId` (não observado; defensivo) | Primeiro vence, segundo descartado (dedupe por `agentId` mantido). |
| Agente rejeitado pelo usuário | Excluído, regra atual. |

---

## Testes

- **Fixtures novas** (transcripts sintéticos, padrão dos testes atuais): sessão com meta.json
  depth 1; depth 2 (aninhado); meta órfão; misto meta+legado; meta corrompido.
- **`todosParser`:** matching por `toolUseId`, resolução de pai via índice, fallback por
  arquivo, status de aninhados.
- **`buildTree`:** floresta a partir da lista plana, órfãos → main, ordenação por nível,
  cap de profundidade.
- **Formatação:** total compacto de tokens por agente; badge por tipo.
- **Smoke test:** skill `smoke-test` existente valida ao vivo no fim (main + sub-agents com
  task tracking), agora conferindo também hierarquia e badges.
