# Design — Indicador de % de contexto no painel

**Data:** 2026-06-03
**Status:** aprovado, pronto para plano de implementação
**Issues relacionadas:** [#58159](https://github.com/anthropics/claude-code/issues/58159), [#44779](https://github.com/anthropics/claude-code/issues/44779), [#516](https://github.com/anthropics/claude-code/issues/516) (itens 2 do roadmap)

## Problema

A `UsageTable` (0.3.0) mostra tokens acumulados por modelo/agente, mas nada indica **quão cheio está o contexto da sessão atual**. Em sessões longas, o autocompact do Claude Code dispara sem aviso visível no painel, surpreendendo o usuário. O dado necessário já está no transcript — falta superfície.

## Objetivo

Enriquecer a área "Tokens" com um indicador glanceable de **% de contexto usado**, com semáforo de cor, reaproveitando os dados já lidos do transcript.

### Não-objetivos

- Custo estimado em **$** (exige tabela de preços por modelo que envelhece e pode enganar — fora de escopo).
- Indicador por sub-agent (o contexto é da sessão principal; cada sub-agent tem o seu, somar não faz sentido).
- Aviso/ação ativa (notificação, sugestão de `/compact`) — só exibição.

## Design

### Fonte do dado

O tamanho do contexto **agora** é o `usage` da **última** mensagem com `message.usage` no transcript **principal**, ignorando entradas `isSidechain`:

```
contextTokens = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

`output_tokens` não entra (é a resposta gerada, não o que foi enviado). Apenas o transcript principal — sub-agents não contribuem.

### Limite da janela

```
contextLimitFor(model): 200_000 por padrão; 1_000_000 se o id do modelo contém "1m" (case-insensitive)
```

Cobre `claude-opus-4-8[1m]` e equivalentes. Modelo desconhecido → 200k.

### Tipo

Em `src/types.ts`:

```ts
export interface ContextUsage {
  tokens: number;   // input + cache da última mensagem do main
  limit: number;    // 200_000 | 1_000_000
}
// SessionUsage ganha um campo opcional:
//   context?: ContextUsage
```

Opcional: ausente quando a sessão ainda não produziu resposta com `usage`. A UI não renderiza nesse caso.

### Estado / semáforo

Lógica pura em `src/webview/format.ts` (testável, sem Svelte):

```
pct = clamp(tokens / limit, 0, 1)
contextLevel(pct): 'ok'    se pct < 0.60
                   'warn'  se 0.60 <= pct < 0.85
                   'danger' se pct >= 0.85
```

Bordas exatas: `0.60` → `warn`; `0.85` → `danger`. Percentual exibido = `Math.round(pct * 100)` (ex.: `82% ctx`).

Mapeamento de cor (no componente):
`ok` → `--vscode-charts-green` · `warn` → `--vscode-charts-yellow` · `danger` → `--vscode-charts-red`.
O percentual textual fica sempre visível ao lado da cor (acessível a daltônicos).

### UI (layout C aprovado)

Em `src/webview/lib/UsageTable.svelte`, renderizado só quando `usage.context` existe:

- Badge `"{pct}% ctx"` ao lado do rótulo "Tokens" no cabeçalho, colorido conforme o nível.
- Barra fina logo abaixo do cabeçalho: preenchimento = `pct`, cor = nível; à direita, a contagem `Xk / Yk` (via `formatCompact`).

### Edge cases

- Sem `usage` no transcript → `context` indefinido → indicador oculto.
- Modelo desconhecido → limite 200k.
- `tokens > limit` (detecção de 1M falha, ou estouro) → `pct` clampado a 100%, estado `danger`.

## Plano de testes (TDD)

**`usageParser`:**
- extrai `context` da última mensagem do transcript principal (soma input + cache_read + cache_creation).
- detecta limite 1M pelo sufixo `1m` no modelo; 200k caso contrário.
- ignora entradas `isSidechain` ao escolher a "última".
- retorna `context` indefinido quando o transcript não tem `usage`.

**`format.contextLevel`:**
- `'ok'` / `'warn'` / `'danger'` nas faixas, com as bordas exatas (0.60 = warn, 0.85 = danger).
- `pct` clampado quando `tokens > limit`.

A UI Svelte não tem teste unitário (consistente com o projeto, que testa serviços e `format.ts`); a lógica de cor/nível vive em `format.ts` e é coberta ali.

## Arquivos afetados

- `src/types.ts` — novo `ContextUsage`, campo `context?` em `SessionUsage`.
- `src/services/usageParser.ts` — extração do contexto + `contextLimitFor`.
- `src/webview/format.ts` — `contextLevel(pct)`.
- `src/webview/lib/UsageTable.svelte` — badge + barra fina.
- Testes: `tests/services/usageParser.test.ts`, `tests/webview/format.test.ts`.
