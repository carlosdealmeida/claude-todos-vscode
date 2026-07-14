# Design — Uso agregado do projeto ("Últimos 7 dias")

**Data:** 2026-07-14
**Status:** aprovado, aguardando plano de implementação
**Origem:** roadmap item 16 (aposta de produto) — demanda comprovada pelo sucesso do `ccusage`,
que lê os mesmos JSONL

Bloco colapsável no painel com o uso agregado do workspace nos últimos 7 dias: número de
sessões, tokens por modelo e eficiência de cache. Agregação lazy (só ao expandir), com
memoização por arquivo.

---

## Decisões de escopo (validadas com o usuário)

1. **Superfície:** seção colapsável **no painel atual**, abaixo da `UsageTable` da sessão.
   Sem painel de editor dedicado (fica para o futuro se houver demanda).
2. **Período:** **7 dias corridos** ("Últimos 7 dias"), filtrados pelo `mtime` do transcript
   principal — sem ambiguidade de fuso/início de semana. Sem seletor de período (YAGNI).
3. **Conteúdo:** N sessões · tokens por modelo (input/output/cache, mesmo layout compacto da
   `UsageTable`) · % de cache reaproveitado agregado com o semáforo existente. **Fora:**
   top-sessões e custo em $ (decisão de roadmap mantida — tabela de preços envelhece).
4. **Escopo por workspace mantido como default e único** — nada de visão entre projetos
   (essa é a tensão do item 8, que exigirá opt-in explícito se um dia entrar).
5. **Abordagem A:** serviço novo + agregação **lazy** sob demanda com memo por arquivo.
   Rejeitadas: agregar em todo push do snapshot (paga a varredura completa mesmo colapsado)
   e índice persistido em disco (infraestrutura demais — YAGNI).

---

## Arquitetura

### `src/services/projectUsageService.ts` — serviço novo

```ts
export interface ProjectUsage {
  sessions: number;        // sessões com atividade na janela
  byModel: ModelUsage[];   // totais agregados por modelo (tipos existentes)
  cache?: CacheStats;      // agregado read/creation/input; undefined se zero
}

export class ProjectUsageService {
  constructor(claudeDir: string) {}
  // Varre o diretório encodado do projeto (cwdCandidates + encodeCwdToProjectDir,
  // helpers existentes), qualifica sessões por mtime do transcript principal
  // >= sinceMs, e soma o uso de cada uma (transcript + agent-*.jsonl da pasta
  // subagents). Erros de leitura em um arquivo não derrubam o agregado.
  usageForProject(cwd: string, sinceMs: number): ProjectUsage;
}
```

- **Qualificação:** sessão entra se `mtime(transcript principal) >= sinceMs`. Os subagents
  de uma sessão qualificada entram junto (mesmo que o arquivo do subagent seja mais antigo —
  o uso pertence à sessão). Sessões fora da janela são ignoradas por inteiro.
- **Memoização por arquivo:** `Map<path, { mtimeMs, size, models, cache }>` em memória.
  Antes de ler, `statSync`; se `(mtimeMs, size)` bate com o memo, reusa. Só a sessão ativa
  (que muda) é relida em expansões subsequentes. Entradas de arquivos que sumiram são
  removidas na varredura seguinte.
- **Leitura compartilhada:** a lógica de `modelsAndCacheForFile` do `usageParser` é extraída
  para função exportada (`readFileUsage(filePath, skipSidechain)` no próprio módulo
  `usageParser.ts`), usada pelos dois serviços — comportamento por sessão **inalterado**.
- **Sem `TodosParser`:** o agregado não precisa de nomes de agentes nem matching — só soma
  arquivos. O transcript principal soma com `skipSidechain: true`; cada `agent-*.jsonl` com
  `false` (mesma regra do uso por sessão).

### Protocolo webview ↔ extension

- `WebviewMessage` += `{ type: 'projectUsage' }` (pedido, disparado ao expandir).
- `ExtensionMessage` += `{ type: 'projectUsage'; usage: ProjectUsage | null }` (`null` =
  sem workspace). O snapshot existente **não muda**.
- No `extension.ts`, o handler responde chamando
  `projectUsageService.usageForProject(cwd, Date.now() - 7 * 24 * 3600 * 1000)` e faz
  `postMessage` para os dois providers (view + panel). Expansões repetidas re-pedem (dados
  frescos, memo torna barato).

### UI — `src/webview/lib/ProjectUsageSection.svelte`

- Bloco colapsável abaixo da `UsageTable`, **colapsado por padrão**, header
  "Últimos 7 dias · este projeto".
- Ao expandir: envia `projectUsage`, mostra estado de carregando leve até a resposta; re-pede
  a cada expansão.
- Conteúdo: linha de resumo (`{n} sessões`), tabela por modelo (mesmo layout/formatCompact
  da `UsageTable`), barra de cache agregada (mesmos componentes/semáforo do indicador de
  cache por sessão).
- Estado vazio (0 sessões na janela): texto leve "Sem atividade nos últimos 7 dias".
- i18n nos 3 idiomas (chaves novas: título do bloco, "{n} sessões", carregando, vazio).

---

## Casos de borda

| Caso | Comportamento |
|---|---|
| Sem workspace aberto | Resposta `null`; o bloco nem renderiza (painel já mostra EmptyState). |
| Transcript ilegível/corrompido no meio da varredura | Arquivo contribui zero; agregado segue com os demais. |
| Sessão ativa agora | Qualifica (mtime recente) e é relida a cada expansão — é o único custo recorrente. |
| Transcript de 19MB+ na janela | Primeira expansão paga a leitura; memo evita reler enquanto não mudar. |
| Worktrees do mesmo repo (cwd diferente) | Fora — o diretório encodado é por cwd exato, coerente com o escopo do painel. |
| Painel e editor abertos juntos | Ambos recebem a resposta (broadcast aos dois providers); cada um controla seu próprio colapso. |

---

## Testes

- **`projectUsageService`:** fixtures multi-sessão — dentro/fora da janela por mtime
  (`fs.utimesSync`), sessão com subagents somando junto, arquivo corrompido não derruba,
  memo reusada quando `(mtime, size)` não muda e invalidada quando muda, `sessions` conta
  certo, agregação por modelo/cache bate com valores calculados à mão.
- **`usageParser`:** testes existentes continuam verdes após a extração de `readFileUsage`
  (refactor sem mudança de comportamento).
- **i18n:** paridade das chaves novas (teste existente cobre).
- **Visual:** preview-webview com o bloco expandido/colapsado, tema dark/light.
