---
description: Roda o smoke test do painel Claude Todos (Main agent + 3 sub-agents nomeados com TodoWrite)
---

Smoke test do painel Claude Todos: quero ver o Main agent e sub-agents lado a lado.

REGRAS OBRIGATÓRIAS:
1. Crie agora uma lista de TODOs com TodoWrite contendo 3 itens — um por
   sub-agent abaixo. Marque cada um como concluído conforme o sub-agent retorna.
2. Despache 3 sub-agents EM PARALELO numa única mensagem, todos com a
   ferramenta Agent, subagent_type "general-purpose", cada um com um "name"
   próprio: "explorador-a", "explorador-b", "explorador-c".
3. Cada sub-agent deve, OBRIGATORIAMENTE:
   a. Como PRIMEIRA ação, criar sua própria lista de TodoWrite com exatamente
      3 itens (a/b/c abaixo).
   b. Executar cada item de fato, marcando o TODO como in_progress antes e
      completed depois — um item de cada vez (uma chamada de TodoWrite por
      transição de estado).
   c. Devolver um relatório curto (< 100 palavras) no final.

TAREFAS DE CADA SUB-AGENT (3 itens cada):
 - explorador-a: (1) listar os arquivos em src/services/ (2) contar quantas
   linhas tem todosParser.ts (3) resumir o que esse arquivo faz.
 - explorador-b: (1) listar os arquivos em src/webview/ (2) contar quantos
   componentes .svelte existem (3) resumir o que o painel renderiza.
 - explorador-c: (1) ler o package.json (2) listar os scripts de build
   (3) resumir como a extensão é empacotada.

Comece agora.

---

**Pré-requisito:** o painel só reflete o código atual se a extensão tiver sido
reconstruída (`npm run build`) e a janela recarregada (Developer: Reload Window),
ou rodando num Extension Development Host (F5).

**O que validar no painel durante a execução:**
- Main agent com 3 TODOs.
- Três cards indentados: `explorador-a`, `explorador-b`, `explorador-c`, cada um
  com sua lista de 3 TODOs.
- Badge "running" nos sub-agents ainda em execução.
- TODOs mudando pending → in_progress → completed ao vivo.
