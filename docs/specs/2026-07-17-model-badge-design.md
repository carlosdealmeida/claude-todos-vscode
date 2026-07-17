# Badge de modelo por agente (main + nós da árvore) — design

**Roadmap:** item 20 · Origem: varredura 2026-07-16 — [#28986](https://github.com/anthropics/claude-code/issues/28986)
(58 reações, modelo ativo no painel do VS Code), [#76018](https://github.com/anthropics/claude-code/issues/76018)/
[#77367](https://github.com/anthropics/claude-code/issues/77367) (modelo por sub-agent),
[#76607](https://github.com/anthropics/claude-code/issues/76607) (painel nativo mostra o modelo
errado para sub-agents), [#62199](https://github.com/anthropics/claude-code/issues/62199)
(troca silenciosa de modelo).

## Problema

O painel mostra tipo, tokens e progresso por agente, mas não **qual modelo** está rodando em
cada um. O usuário não vê fallbacks automáticos nem trocas silenciosas (ex.: main em opus,
sub-agent caindo pra sonnet), e o painel nativo do Claude Code erra exatamente isso.

## Decisões

1. **Fonte: modelo da ÚLTIMA entrada com `usage` do transcript do agente ("modelo atual").**
   - `readFileUsage` ([usageParser.ts](../../src/services/usageParser.ts)) ganha um acumulador
     `lastModel` na mesma passada — custo zero de I/O. Entradas `<synthetic>` e (no main)
     `isSidechain` já são puladas; a regra vale igual para o `lastModel`.
   - `AgentUsage` ganha `currentModel?: string`, preenchido pelo `UsageParser.usageForSession`.
   - O `ProjectUsageService`, que reusa `readFileUsage`, ignora o campo novo.
   - Alternativas descartadas: modelo dominante por tokens (mente logo após a troca — o caso
     da #62199) e lista completa no badge (largura num painel estreito).
2. **Exibição: main sempre; sub-agent só quando difere.**
   - Cabeçalho do main: badge sempre que `currentModel` existir.
   - Sub-agents/nós da árvore: badge apenas quando o `currentModel` do nó difere do
     `currentModel` do main. Exceção que salta aos olhos (= a dor da #76607), sem repetir o
     texto N vezes no caso comum.
   - Se o main não tem `currentModel` (sem usage ainda), sub-agents com modelo conhecido
     mostram o badge (não há referência para comparar).
   - Regra em função pura testável `modelBadge(current, mainModel, isMain)` em
     [format.ts](../../src/webview/format.ts) → `string | null` (o texto do badge, ou nada).
3. **Formato do texto:** `shortModel(model)` — remove o prefixo `claude-` e sufixo de data
   legado (`-20\d{6}`); preserva o sufixo `[1m]` quando presente.
   Ex.: `claude-opus-4-8` → `opus-4-8`; `claude-sonnet-4-5-20250929[1m]` → `sonnet-4-5[1m]`.
4. **Fluxo de dados:** `App.svelte` deriva `mainModel` de `usage.byAgent` (nó `isMain`);
   `AgentTree` já recebe `usage` — passa `currentModel` do nó + `mainModel` ao
   `AgentSection`, que renderiza o badge ao lado do `type-badge` existente (mesma família
   visual, tom neutro; tooltip i18n lista todos os modelos usados pelo agente, na ordem de
   `AgentUsage.models`).
5. **i18n:** tooltip nova ×3 (en/pt-br/es). O texto do badge em si é o id do modelo (não
   traduz).

## Fora de escopo

- Aviso ativo de "modelo trocou" (toast) — o badge mudando já dá a visibilidade; notificação
  só se houver pedido.
- Badge na `UsageTable` (já mostra breakdown por modelo).

## Testes

- Parser: `lastModel` = última entrada válida (não-synthetic, não-sidechain no main); ausente
  em arquivo sem usage; multi-modelo pega o último, não o maior.
- `shortModel`: prefixo, data legada, sufixo `[1m]`, id já curto (passthrough).
- `modelBadge`: main com/sem modelo; sub igual ao main (null); sub diferente (mostra); main
  sem referência (sub mostra).
- Visual: preview-webview com main + sub-agent de modelo diferente.
