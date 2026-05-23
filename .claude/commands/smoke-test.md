---
description: Roda o smoke test do painel Claude Todos (Main agent + 3 sub-agents nomeados, com task tracking ao vivo)
---

Smoke test do painel Claude Todos: quero ver o Main agent e sub-agents lado a lado, com tasks atualizando ao vivo.

> **Nota sobre tools de task tracking:** no ambiente atual do Claude Code (com `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), o tracking é feito via `TaskCreate` (cria uma task) e `TaskUpdate` (muda status pelo `taskId`). Em ambientes mais antigos, é `TodoWrite` (snapshot da lista inteira). **Use a que estiver disponível.** No `general-purpose`, `TaskCreate`/`TaskUpdate` ficam deferidas — é preciso carregá-las via `ToolSearch` antes da primeira chamada.

REGRAS OBRIGATÓRIAS:

1. **Main agent — crie a lista de coordenação agora**, com 3 itens (um por sub-agent):
   - Se `TodoWrite` estiver disponível, use-a com 3 itens.
   - Senão, use `TaskCreate` 3 vezes (uma por item). Marque cada uma como `completed` (via `TaskUpdate`) conforme o sub-agent correspondente retorna.

2. **Despache 3 sub-agents EM PARALELO** numa única mensagem, todos com a ferramenta `Agent`, `subagent_type` "general-purpose", cada um com um `name` próprio: `explorador-a`, `explorador-b`, `explorador-c`. Repita LITERALMENTE o bloco "INSTRUÇÕES OBRIGATÓRIAS DO SUB-AGENT" abaixo dentro do `prompt` de cada um (sem essas instruções o smoke test não valida).

3. Conforme cada sub-agent retorna, marque o item correspondente da sua lista como concluído.

---

## INSTRUÇÕES OBRIGATÓRIAS DO SUB-AGENT (copie no prompt de cada Agent)

Você é um sub-agent do smoke test do painel Claude Todos. OBRIGATORIAMENTE:

a. **PRIMEIRA ação:** carregue as ferramentas de task tracking que estão deferidas neste ambiente, chamando `ToolSearch` com `query: "select:TaskCreate,TaskUpdate"`. Aceite o schema retornado.

b. **SEGUNDA ação:** crie suas 3 tasks chamando `TaskCreate` **uma por uma** (três chamadas separadas), uma pra cada item abaixo. Use o campo `activeForm` no presente contínuo ("Listando...", "Contando...", "Resumindo...").

c. Execute cada item **um de cada vez**, nesta sequência exata:
   - Chame `TaskUpdate(taskId, status: "in_progress")` antes de começar
   - Execute a ação real (Glob, Read, Bash, etc.)
   - Chame `TaskUpdate(taskId, status: "completed")` ao terminar
   - Só então passe pro próximo item

d. Devolva um relatório curto (< 100 palavras) com o resultado dos 3 itens.

> Importante: NÃO pule a etapa (a) — sem ela `TaskCreate`/`TaskUpdate` não estarão disponíveis e o smoke test falha (cards aparecem mas sem TODOs internos).

---

## TAREFAS DE CADA SUB-AGENT (3 itens cada)

- **explorador-a:** (1) listar os arquivos em `src/services/` (2) contar quantas linhas tem `todosParser.ts` (3) resumir o que esse arquivo faz.
- **explorador-b:** (1) listar os arquivos em `src/webview/` (2) contar quantos componentes `.svelte` existem (3) resumir o que o painel renderiza.
- **explorador-c:** (1) ler o `package.json` (2) listar os scripts de build (3) resumir como a extensão é empacotada.

Comece agora.

---

**Pré-requisito:** o painel só reflete o código atual se a extensão tiver sido reconstruída (`npm run build`) e a janela recarregada (`Developer: Reload Window`), ou rodando num Extension Development Host (F5), ou instalada via `.vsix` recente.

**O que validar no painel durante a execução:**
- **Main agent** com 3 itens (Aguardando explorador-a/b/c), transicionando pra completed conforme os sub-agents retornam.
- Três cards indentados: `explorador-a`, `explorador-b`, `explorador-c`, **cada um com sua lista de 3 itens**.
- Badge "running" nos sub-agents ainda em execução.
- Status mudando `pending → in_progress → completed` ao vivo em cada item.

Se algum card de sub-agent aparecer com "No todos yet" e mesmo assim concluir o trabalho, o sub-agent provavelmente pulou a etapa (a) do prompt (não carregou `TaskCreate`/`TaskUpdate` via `ToolSearch`).
