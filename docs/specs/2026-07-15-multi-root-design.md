# Multi-root: seguir a pasta ativa — design

**Roadmap:** item 9 · Issues upstream: #58044, #36949, #12808, #18814

## Problema

Em workspace multi-root a extensão usa só `workspaceFolders[0]`: sessões do Claude Code
rodando em outras pastas do mesmo workspace ficam invisíveis (limitação nº 1 do README).
O hook já grava no bridge a `cwd` **real** de cada sessão — o dado existe; a extensão é
que não olha para ele.

## Decisões

1. **Detecção automática (default):** o resolver passa a receber **todas** as pastas do
   workspace e retorna a união dos registros do bridge. A escolha da sessão exibida não
   muda: `SnapshotService.listSessions()` já ordena por mtime do transcript DESC — com a
   união, o painel passa naturalmente a seguir a sessão mais ativa **entre as pastas**.
2. **Override explícito (opt-in):** setting `claudeTodos.activeFolder` (nome da pasta ou
   caminho absoluto). Vazio = automático. Valor que não casa com nenhuma pasta atual →
   fallback para automático (nunca quebra o painel).
3. **Desambiguação no picker:** com mais de uma pasta em jogo, cada item do seletor de
   sessão mostra o basename da pasta (`abcd1234 · minha-pasta · 5 min atrás`). Fixar uma
   sessão (pin) já fixa implicitamente a pasta — não é preciso um picker de pasta separado.
4. **`openTodoSource` resolve a cwd pela sessão** (via `listSessions()`), não mais por
   `workspaceFolders[0]` — um clique num todo de sessão de outra pasta abre o transcript
   certo. Ids desconhecidos caem no aviso `todo.sourceMissing` (validação mais estrita que
   a atual).
5. **Dashboard 7 dias segue a pasta da sessão exibida** (`snapshotService.activeCwd()`),
   mantendo painel e dashboard consistentes. Sem sessão nenhuma, cai na primeira pasta
   (comportamento atual).
6. **`SessionResolver.resolve()` é removido** — sem consumidor em produção (só testes).

## Fora de escopo

- Agregar todas as pastas num painel único (estratégia (d) da investigação) — as issues
  pedem a pasta *ativa*, não a soma; mexeria no modelo de dados do webview.
- Picker dedicado de pasta — o pin de sessão + setting cobrem o override.

## Riscos

- **Oscilação** entre pastas com sessões ativas simultâneas: mitigado pelo pin (usuário
  fixa a sessão) e pelo setting (usuário fixa a pasta). O desempate automático é o mtime
  do transcript, estável entre renders consecutivos.
- **Case no Windows:** comparação de path do setting é case-insensitive no win32 (mesma
  regra do `BridgeFile.allForCwd`).
