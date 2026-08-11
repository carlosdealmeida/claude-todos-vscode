# Contabilidade de tokens: dedupe por request + `usage.iterations` — design

**Roadmap:** R5 (📐 prioridade) + R-perf do item 2 · Origem: varredura 2026-08-10 —
[#84223](https://github.com/anthropics/claude-code/issues/84223) (formato de records por
content block com usage final replicado; sub-agents às vezes sem o final),
[#81620](https://github.com/anthropics/claude-code/issues/81620) /
[#84738](https://github.com/anthropics/claude-code/issues/84738) (rollup do `advisor` infla o
usage top-level ~2×). Tudo medido contra o disco local em 2026-08-10 (ver R5 no ROADMAP).

## Problema

O transcript grava **um record por content block**, todos com o mesmo `requestId`, e replica
(backfill) o `usage` final do request em cada record. O
[readFileUsage](../../src/services/usageParser.ts) soma todas as linhas → os totais da tabela
de tokens, do breakdown por agente/modelo e do dashboard 7 dias saem **~1.97× inflados**
(medido: 70% dos requests locais têm 2+ records). Além disso, turnos com `advisor` server-side
somam as iterations no usage top-level (~2× o contexto real) — e é esse top-level que o
`contextForFile` lê da última mensagem para o indicador de contexto.

## Decisões

1. **Dedupe: agrupar por request e eleger o record "final".**
   - Chave do grupo: `requestId`; fallback `message.id` (transcripts antigos); sem nenhum dos
     dois, a linha conta sozinha — comportamento legado preservado (fixtures atuais seguem
     verdes sem alteração).
   - Vencedor do grupo: record com `stop_reason` não-nulo **ou** `usage.iterations` presente;
     se nenhum tem (o caso dos ~16% de sub-agents sem usage final), o de maior
     `output_tokens` — melhor dado disponível. Empate: o último visto.
   - Alternativas descartadas: "último record vence" (perde exatamente quando o backfill falha
     parcialmente e o último é um snapshot com `output: 1`); dedupe só por `message.id`
     (o `requestId` é o agrupador que o próprio formato usa pro backfill).
   - Implementação: mesma passada única, acumulando num `Map<chave, winner>` em vez de somar
     direto; ao final, soma os winners por modelo e no `CacheStats`. Memória O(requests).
2. **Contexto: última entrada com usage, preferindo a última iteration `type:"message"`.**
   - Se o usage da última entrada tem `iterations`, o contexto = `input + cache_read +
     cache_creation` da **última iteration `type:"message"`** (imune ao rollup do advisor);
     senão, top-level como hoje.
   - Degradação: `iterations` malformado, vazio ou sem iteration `type:"message"` → top-level.
   - Não precisa do agrupamento por request: snapshot sem backfill carrega input/cache
     corretos, e record com backfill tem as iterations para desambiguar.
3. **Unificação R-perf: `contextForFile` morre.**
   - `readFileUsage(filePath, skipSidechain)` passa a retornar também
     `context?: ContextUsage` (computado com `contextLimitFor`, mesmo módulo) — a regra da
     decisão 2 aplicada à última entrada válida da mesma passada.
   - `usageForSession` usa o `context` do resultado do transcript principal em vez de reabrir
     o arquivo. Uma leitura em vez de duas por refresh.
   - `ProjectUsageService` ignora o campo novo (como já faz com `lastModel`).
4. **Atribuição do advisor: pelo modelo do request.**
   - Os totais usam o usage top-level do record final — o rollup é o consumo real das
     iterations somadas. Tokens do `advisor_message` (que roda no `advisorModel`, outro
     modelo) ficam atribuídos ao modelo do request. Inexatidão pequena e documentada; não vale
     ramificar a contabilidade por iteration.
5. **Sem mudança de UI, protocolo ou schema.**
   - JetBrains herda tudo via `SessionCore` (parser compartilhado desde a 0.16.0).
   - O memo do dashboard se auto-invalida por `(mtime, size)`; sem migração.
   - Entradas `<synthetic>` e `isSidechain` (no main) seguem puladas — a regra vale antes do
     agrupamento.
6. **CHANGELOG explícito.** Os números visíveis **caem ~2×** após a correção; a nota deve
   dizer que os valores anteriores estavam inflados pela contagem duplicada, para a queda não
   parecer perda de dados.

## Fora de escopo

- Sinalização na UI da subcontagem de output de sub-agents (achado 3 do R5) — piso do dado,
  sem correção possível do nosso lado; fica documentado no ROADMAP.
- Split da contabilidade por iteration/`advisorModel` (decisão 4).
- Qualquer mudança no `todosParser` ou nos tempos por task.

## Testes

- **Compatibilidade:** fixtures legados sem `requestId` (todos os testes atuais de
  `usageParser` e `projectUsageService`) passam sem alteração.
- **Dedupe:** request com N records idênticos (backfill completo) conta uma vez; request com
  snapshot + final conta o final; request só com snapshots (sem final) conta o de maior
  `output_tokens`; requests distintos somam; `message.id` como fallback de chave.
- **Contexto:** última entrada com `iterations` + `advisor_message` usa a última iteration
  `type:"message"` (não o top-level ~2×); sem `iterations` usa top-level; `iterations` vazio
  ou sem `type:"message"` cai no top-level; arquivo sem usage → `context` ausente.
- **Unificação:** `usageForSession` produz o mesmo `ContextUsage` que o `contextForFile`
  produzia nos casos legados (paridade), lendo o arquivo principal uma única vez.
- **Dashboard:** `ProjectUsageService` com transcript multi-record não infla o agregado.
