# Design — Eficiência de cache + detecção da janela de contexto

**Data:** 2026-06-04
**Status:** aprovado, pronto para plano de implementação
**Alvo:** release 0.5.0
**Issues relacionadas:** [#44779](https://github.com/anthropics/claude-code/issues/44779) (item 3 do roadmap)

Duas mudanças na área "Tokens" do painel, no mesmo ciclo:
- **Parte 1 — bugfix:** a detecção da janela de contexto (200k vs 1M) erra para modelos 1M.
- **Parte 2 — feature:** indicador de eficiência do cache (taxa de reaproveitamento + quebra).

---

## Parte 1 — Correção da detecção da janela de contexto

### Bug

O indicador de contexto (0.4.0) mostra `426k / 200k = 100%` (vermelho) para uma sessão
`claude-opus-4-8` que na verdade usa janela de 1M. Um contexto de 426k é impossível numa
janela de 200k — a janela foi detectada errada.

### Causa raiz

[`contextLimitFor`](../../src/services/usageParser.ts) decide a janela só pelo sufixo `/1m/`
no id do modelo. Modelos que **suportam** 1M (`opus`/`sonnet` 4+) não trazem `[1m]` no id, então
caem no default de 200k.

### Por que heurística (investigação)

A janela exata **não existe** em nenhuma fonte local barata:
- **Transcript:** verificado — `usage`, `diagnostics`, `stop_details` e top-level não têm o tamanho
  da janela; `grep` por `context_window`/`max_tokens`/`betas`/`1m` em todos os `.jsonl`: zero matches.
  O beta `context-1m` viaja só no header HTTP e não é gravado.
- **Hooks:** só `SessionStart` recebe `model` (o mesmo id cru); nenhum hook recebe janela/beta.
- **`stats-cache.json`:** tem um campo `contextWindow`, mas é sempre `0` (não preenchido).
- **statusline JSON:** **tem** `context_window.context_window_size` exato — porém captá-lo exige
  registrar um statusline (barra visível na TUI + conflito com statusline existente). Fora de
  escopo; fica como "statusline bridge (opt-in)" no roadmap.

Conclusão: heurística local zero-config é a melhor opção.

### Regra

```
contextLimitFor(model, observedTokens = 0):
  base = supportsOneMillion(model) ? 1_000_000 : 200_000
  return observedTokens > base ? 1_000_000 : base
```

`supportsOneMillion(model)` é true quando o id:
- contém `1m` (case-insensitive), **ou**
- casa `/(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)/i` — geração 4–19 de opus/sonnet.

O `(?!\d)` evita o falso positivo do formato antigo `claude-3-5-sonnet-20241022` (cuja substring
`sonnet-20` **não** casa, pois `20` não é `[4-9]` nem `1\d`). `haiku` e Claude 3.x → 200k.

A evidência observada (`observedTokens > base`) é a rede de segurança: qualquer modelo cujo contexto
já passou de 200k é, por definição, ≥1M. **Sempre eleva, nunca rebaixa.**

`contextForFile` passa os tokens calculados: `limit: contextLimitFor(last.model, tokens)`.

### Limitação aceita

Rodar `opus`/`sonnet` 4+ **sem** o 1M ativo (janela real 200k) mostraria `/1M` e um % subestimado —
o erro menos alarmante, e o `autocompact` do Claude Code ainda protege. Precisão exata fica para o
"statusline bridge (opt-in)" futuro.

---

## Parte 2 — Indicador de eficiência do cache

### O que mostrar (layout aprovado: coexistência)

Na área "Tokens", **abaixo** do indicador de contexto e **acima** da tabela, separado por uma
divisória. O indicador de contexto e a tabela permanecem inalterados. Bloco novo:

- Linha: rótulo **Cache** + badge **`{pct}% reaproveitado`**.
- **Barra empilhada**: três segmentos proporcionais — `read` (verde), `creation` (azul),
  `input novo` (cinza).
- **Legenda**: `lido {read} · criado {creation} · novo {input}` (via `formatCompact`).

### Métrica

Agregada da sessão inteira (main + sub-agents):

```
read     = Σ cache_read_input_tokens
creation = Σ cache_creation_input_tokens
input    = Σ input_tokens            (entrada não-cacheada)
total    = read + creation + input
rate     = read / total              (fração lida do cache)
pct      = Math.round(rate * 100)
```

### Cor do badge (semáforo de eficiência) — decidido: semáforo

`cacheLevel(rate)` em `format.ts`, análogo a `contextLevel` mas com sentido **invertido** (mais é melhor):
`'good'` ≥ 0.75 (verde) · `'mid'` 0.50–0.75 (amber) · `'low'` < 0.50 (vermelho).
Cor via `--vscode-charts-green/yellow/red`. `pct = Math.round(rate * 100)`.

Nota: o badge de cache e o de contexto têm semáforos de **sentido oposto** (contexto: alto = ruim;
cache: alto = bom). Validado no preview que os rótulos ("ctx" vs "reaproveitado") + a barra empilhada
desambiguam; decisão confirmada de manter o semáforo no cache.

### Dados

Novo tipo em `src/types.ts`:

```ts
export interface CacheStats {
  input: number;     // entrada não-cacheada (Σ input_tokens)
  read: number;      // Σ cache_read_input_tokens
  creation: number;  // Σ cache_creation_input_tokens
}
// SessionUsage ganha:  cache?: CacheStats
```

O parser agrega os três componentes separadamente ao varrer os transcripts (main + sub-agents).
A coluna "Cache" da tabela continua sendo `read + creation` (inalterada) via `ModelUsage.cache`.

### Edge cases

- `total === 0` (sessão sem usage) → `cache` indefinido → bloco oculto (`{#if cache}`).
- `read === 0, creation === 0` mas `input > 0` (cache frio no início) → `0% reaproveitado` (legítimo).

---

## Arquivos afetados

- `src/types.ts` — `CacheStats` + `SessionUsage.cache?`.
- `src/services/usageParser.ts` — `contextLimitFor(model, observedTokens)` + `supportsOneMillion`; agregação de `CacheStats`; `contextForFile` passa os tokens.
- `src/webview/format.ts` — `cacheLevel(rate)`.
- `src/webview/lib/UsageTable.svelte` — bloco de cache (badge + barra empilhada + legenda).
- Testes: `tests/services/usageParser.test.ts`, `tests/webview/format.test.ts`.

## Plano de testes (TDD)

**`contextLimitFor` (Parte 1):**
- `('claude-opus-4-8', 426_000)` → 1M (o bug: evidência eleva).
- `('claude-opus-4-8', 50_000)` → 1M (família opus-4+).
- `('claude-sonnet-4-6', 0)` → 1M (família sonnet-4+).
- `('claude-3-5-sonnet-20241022', 0)` → 200k (não casa o regex; formato antigo).
- `('claude-haiku-4-5', 0)` → 200k.
- `('claude-opus-4-8[1m]', 0)` → 1M (sufixo).
- `('foo', 250_000)` → 1M (evidência); `('foo', 10_000)` → 200k.

**Extração de contexto:** `context.limit` reflete a regra (ex.: transcript opus-4-8 com contexto 426k → limit 1M).

**`CacheStats` (Parte 2):** parser agrega `input`/`read`/`creation` separados de main + sub-agents; `cache` indefinido quando não há usage.

**`cacheLevel` (Parte 2):** `good`/`mid`/`low` nas bordas 0.75 e 0.50.

A UI (`UsageTable.svelte`) é verificada por `tsc` + build + preview visual (skill `preview-webview`), sem teste unitário (consistente com o projeto).
