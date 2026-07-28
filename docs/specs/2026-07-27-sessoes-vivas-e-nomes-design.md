# Sessões vivas e nomes reais — design

**Roadmap:** item 5, fatias (a) e (c) · Issues:
[#28147](https://github.com/anthropics/claude-code/issues/28147) (`NOT_PLANNED`) indicadores de
atividade no picker · [#23275](https://github.com/anthropics/claude-code/issues/23275)
(`NOT_PLANNED`) nomear sessões · Reforços da varredura 2026-07-25:
[#80099](https://github.com/anthropics/claude-code/issues/80099) (guarda-chuva de ciclo de vida
de sessão no VS Code) e [#79571](https://github.com/anthropics/claude-code/issues/79571)
(*"não existe primitivo de liveness — silêncio é ambíguo"*).

As fatias (b) *não cortar a lista* e (d) *comando/atalho para trocar de sessão* saíram na
0.13.0. Restavam (a) e (c), destravadas pelo registro `~/.claude/sessions/{pid}.json`.

## Problema

O painel não sabe distinguir uma sessão **rodando agora** de uma que morreu há três dias — as
duas aparecem iguais no picker, ordenadas por mtime. Duas consequências:

1. O modo Auto escolhe por mtime, então fechar a sessão que acabou de rodar e abrir uma nova
   faz o painel continuar exibindo a **morta** (ela escreveu por último).
2. Na lista, o usuário identifica sessões por título derivado — sem saber quais ainda existem.

## As fontes, verificadas em disco (2026-07-27, CLI 2.1.220)

`~/.claude/sessions/{pid}.json`, um arquivo por processo vivo:

```json
{"pid":17268,"sessionId":"058965c9-...","cwd":"c:\\@work\\MyProjects\\claude-todos-vscode",
 "startedAt":1785201814978,"procStart":"639207878128117040","version":"2.1.220",
 "peerProtocol":1,"kind":"interactive","entrypoint":"claude-vscode",
 "name":"claude-todos-vscode-1c","nameSource":"derived"}
```

Três achados que mudaram o desenho:

- **`name` só é útil com `nameSource: "user"`.** Com `derived` ele é `{basename}-{sufixo}`
  (`claude-todos-vscode-1c`) — pior que o título atual, que vem da entrada `"type":"ai-title"`
  do transcript ([todosParser.ts:145](../../src/services/todosParser.ts#L145)) e é semântico.
- **O nome não sobrevive à sessão.** `nameSource` não existe em nenhum outro lugar de
  `~/.claude` (verificado); morreu o processo, sumiu o arquivo — e com ele o nome que o usuário
  escolheu via `/session-name`.
- **`~/.claude/daemon/roster.json` não existe** nesta máquina (só `pipe.key`), então a terceira
  fonte candidata do item 21 está fora. Sobra o registro por PID.

## Decisões

1. **`src/services/liveSessions.ts`: serviço novo e puro.**
   - Lê `~/.claude/sessions/*.json` e devolve um `Map<sessionId, LiveSession>` com
     `{pid, sessionId, cwd, name?, nameSource?}` — só o que este design consome. O registro
     traz mais campos (`startedAt`, `version`, `kind`, `entrypoint`, `procStart`); carregá-los
     sem uso só criaria superfície para manter.
   - Viva = o PID responde a `process.kill(pid, 0)`, tratando **`EPERM` como vivo** (processo
     de outro usuário existe, só não é sinalizável).
   - Arquivo malformado ou ilegível é ignorado item a item; nunca lança.
   - **Órfãos não são removidos.** O registro é espaço do CLI e nós somos read-only nele — a
     mesma regra que vale para transcripts.
   - **Fica em `services/`**, ao lado de `bridgeFile.ts` e `todosParser.ts`: nenhum arquivo
     desse diretório importa `vscode` (verificado), e é de lá que o `SessionCore` puxa tudo que
     o sidecar do JetBrains consome. Pôr em `core/` inverteria a camada — `snapshotService.ts`,
     que vive em `services/`, passaria a importar de `core/`.
2. **`SessionSummary` ganha `alive?: boolean`;** o picker de cada host decide como mostrar. No
   VS Code, o `description` do QuickPick passa de `{id8} · {tempo}` para
   `● {picker.alive} · {id8} · {tempo}` quando viva, mantendo o formato atual quando não
   ([extension.ts:117](../../src/extension.ts#L117)); no JetBrains, o picker nativo recebe o
   mesmo campo e monta a string equivalente. i18n: 1 chave (`picker.alive` = "ao vivo"),
   × 5 idiomas.
3. **Modo Auto prefere viva — e só ele.**
   - A preferência entra **apenas** no `choose()`
     ([snapshotService.ts:71](../../src/services/snapshotService.ts#L71)): pin > sessão viva de
     maior mtime > sessão de maior mtime.
   - `listSessions()` continua ordenando só por mtime, então **a ordem do picker não muda**.
     Agrupar vivas no topo foi descartado na fase de design: exigiria separadores no QuickPick
     e divergiria do picker nativo do JetBrains.
   - Sem risco de oscilação: sessão morta não escreve, então o desempate entre duas vivas
     continua sendo mtime, como hoje.
4. **Títulos: precedência explícita.**
   `name` do registro (somente se `nameSource === 'user'`) → nome em cache → `aiTitle` do
   transcript → `Session · {id8}`.
5. **Cache de nomes em arquivo, ao lado do bridge.**
   - Classe `SessionNames` em `src/services/sessionNames.ts` (mesma camada do `BridgeFile`,
     pelo mesmo motivo da decisão 1), gravando em
     `~/.claude/.vscode-todos-bridge/session-names.json`, no mesmo diretório que o
     `sessions.json` do bridge ([sessionCore.ts:39](../../src/core/sessionCore.ts#L39)).
     Formato: `{ [sessionId]: { name, updatedAt } }`.
   - **Por que não `workspaceState`:** ele é API do VS Code, e o core é compartilhado com o
     JetBrains desde a 0.16.0 — o sidecar Node não alcança o `PropertiesComponent`. O arquivo
     serve os dois hosts com o mesmo código, e ainda torna o nome visível de qualquer janela.
   - Escrita **só quando o nome muda** (comparação antes do write), via
     `atomicWriteFileSync`, para não gerar I/O a cada refresh.
   - Podado junto com o bridge, na mesma janela de 30 dias já aplicada por `BridgeFile.prune`
     no `activate` (e, desde a correção do review final, também no `init` do dispatcher do
     JetBrains — ver "Comportamentos do cache" abaixo).

## Comportamentos do cache (não documentados até o review final)

Dois efeitos colaterais do desenho acima, ambos aceitáveis mas que não estavam escritos em
lugar nenhum:

- **Precedência de 30 dias sem UI de limpeza.** Uma vez em cache, o nome tem prioridade sobre o
  `aiTitle` do transcript pelo mesmo período da poda (30 dias) — não há comando nem ação no
  picker pra apagar uma entrada individual antes disso. Rodar `/session-name` de novo
  sobrescreve (comportamento de `remember`); só "esquecer" o nome e voltar ao `aiTitle` exige
  esperar a poda.
- **`updatedAt` é "primeira observação", não "última".** `remember` só escreve quando o nome
  muda ([sessionNames.ts:47](../../src/services/sessionNames.ts#L47)), então `updatedAt` fica
  parado no instante em que aquele nome foi visto pela primeira vez — mesmo que a sessão
  continue viva e observada por semanas com o mesmo nome sem trocar. Na prática isso **encurta**
  a janela efetiva de retenção de sessões de vida longa sem troca de nome: a poda de 30 dias
  conta a partir da 1ª observação do nome, não da última atividade real da sessão.

## Limitação aceita: reuso de PID

Um PID reciclado pelo SO faz uma sessão morta parecer viva. O `procStart` do registro existe
justamente para desambiguar, mas compará-lo exige o tempo de criação real do processo — fora
do Node, via `wmic`/PowerShell no Windows, a cada refresh. Caro demais para um erro cujo efeito
é cosmético (marcador errado no picker; no pior caso o Auto prefere uma sessão parada, e o
usuário troca pelo picker). Documentado, não mitigado.

Se algum dia virar dor real, o caminho é comparar `procStart` **uma vez por PID** e memoizar,
não a cada refresh.

## Fora de escopo

- **Renomear sessão pela extensão.** O CLI já tem `/session-name`; duplicar criaria a pergunta
  de qual nome vence. O plano original de (c) é anterior a esse comando.
- **Remover arquivos órfãos** do registro do CLI (read-only).
- **Indicador de "ao vivo" no cabeçalho do painel** — o pedido é sobre escolher e achar
  sessões, que acontece no picker. Reavaliar se pedirem.
- **Agrupar/filtrar o picker por estado** (descartado na decisão 3).

## Testes

`liveSessions` é puro sobre um diretório: testes com diretório temporário cobrindo registro
válido, PID morto, arquivo malformado, diretório ausente e `EPERM` (mockando `process.kill`).

- `choose()`: viva com mtime menor vence morta com mtime maior; entre duas vivas vence mtime;
  sem nenhuma viva, comportamento atual preservado; pin continua tendo precedência sobre tudo.
- `resolveTitle`: os quatro níveis da precedência, incluindo `nameSource: 'derived'` sendo
  **ignorado** em favor do `aiTitle`.
- Cache: grava na primeira observação; não regrava com o mesmo nome; sobrevive ao
  desaparecimento do registro; poda remove entradas além de 30 dias.
- `listSessions()`: ordem por mtime **inalterada** (teste de regressão da decisão 3).
