# Claude Todos para VSCode e JetBrains

**Português** · [English](README.en.md) · [Español](README.es.md) · [简体中文](README.zh-cn.md) · [繁體中文](README.zh-tw.md)

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/CarlosJunior1992.claude-todos.svg?label=VS%20Code%20Marketplace&color=007ACC&style=flat)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos)
[![Open VSX](https://img.shields.io/open-vsx/v/CarlosJunior1992/claude-todos?label=Open%20VSX&color=c160ef)](https://open-vsx.org/extension/CarlosJunior1992/claude-todos)
[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/33074-claude-todos?label=JetBrains%20Marketplace&color=fe2857)](https://plugins.jetbrains.com/plugin/33074-claude-todos)
[![CI](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Observability para seus agentes Claude Code** — tasks, árvore de agentes, tempos, tokens e cache ao vivo, restrito ao workspace aberto na janela atual do VSCode. Tudo 100% local: duas janelas em projetos diferentes nunca veem os dados uma da outra.

![Painel Claude Todos: agente principal e sub-agents com as tasks avançando de pending → in_progress → completed ao vivo, com tempos por task](screenshots/claude-todos-demo.gif)

> ⚠️ **Claude Code 2.1.233 ou mais recente?** Nos modelos novos, as ferramentas de tasks (`TodoWrite`, `TaskCreate`) vêm **desligadas por padrão** e a lista deste painel fica vazia até você reativá-las — veja [Instalação](#instalação).

## O que você vê

- **Árvore de agentes ao vivo ("mission control")** — main → sub-agents → agentes aninhados, com badge de tipo (Explore, Plan, general-purpose…), status e tokens por agente.
- **Tasks em tempo real** — cada item transiciona `pending → in_progress → completed` conforme o agente trabalha; clicar numa task abre o transcript na linha da última mudança de status. Se o orquestrador para de atualizar a lista enquanto sub-agents seguem rodando, o painel sinaliza a defasagem.
- **Tempos por task** — duração de cada task concluída, tempo ao vivo da task em andamento e estimativa (rotulada como estimativa) do restante.
- **Tokens, contexto e cache** — tabela por modelo ou por agente, indicador da janela de contexto com semáforo e eficiência de cache (reaproveitado × criado × novo).
- **Dashboard "Últimos 7 dias"** — uso agregado do projeto, por modelo e por tipo de agente.
- **Notificações** — toast quando a sessão fica ociosa aguardando você, ou quando todas as tasks completam (só com a janela sem foco).
- **Perguntas pendentes** — uma faixa no topo do painel lista o que a sessão está esperando (uma pergunta do agente ou um plano aguardando aprovação), independente do foco da janela; clicar leva à linha do transcript.
- **Sessões ao vivo e nomes reais** — o seletor de sessão marca com "● ao vivo" as sessões cujo processo do Claude Code ainda está rodando, e o modo automático prioriza uma sessão viva; nomes definidos com `/session-name` aparecem no lugar do título derivado.
- **UI em 5 idiomas** — en, pt-br, es, zh-cn e zh-tw; segue o idioma do VS Code, com override via setting.

## Como funciona

![Painel Claude Todos atualizando ao vivo durante uma sessão do Claude Code](screenshots/panel-live-during-smoke-test.png)

O painel **Claude Todos** (na Barra de Atividades, à esquerda) lê os transcripts que o próprio Claude Code já grava em disco — nenhum proxy, nenhuma API — e reflete tudo em tempo real conforme o agente trabalha.

Não importa **onde** o `claude` esteja rodando: pode ser o terminal integrado do VSCode, qualquer terminal externo (Windows Terminal, iTerm, gnome-terminal) ou até a CLI do Claude Code em outra janela. Desde que o diretório de trabalho da sessão bata com o workspace aberto no VSCode, o painel reflete.

As tasks vêm das chamadas `TodoWrite` e `TaskCreate` que o agente grava no transcript. Árvore de agentes, tokens, contexto, notificações e perguntas pendentes vêm do restante do transcript e não dependem delas.

## Instalação

| Editor | Onde instalar |
|---|---|
| VS Code | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos) |
| Cursor · Windsurf · VSCodium | [Open VSX](https://open-vsx.org/extension/CarlosJunior1992/claude-todos) |
| IntelliJ IDEA · PyCharm · WebStorm · Rider · … (2024.2+) | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33074-claude-todos) |
| Qualquer um (offline) | `.vsix` (VS Code) / `.zip` (JetBrains) — [GitHub Release](https://github.com/carlosdealmeida/claude-todos-vscode/releases) |

> **Plugin JetBrains:** o mesmo painel roda nos IDEs da JetBrains — mesma árvore de
> agentes, tempos, tokens e dashboard, com toasts nativos, clique na task abrindo o
> transcript e picker de sessão. Requer **Node.js no PATH** (quem roda Claude Code já tem).
> O hook é o mesmo dos dois lados: instalar por um IDE já vale para o outro.

1. Instale a extensão (tabela acima). O guia **"Comece com o Claude Todos"** aparece na página *Welcome/Get Started* do editor e acompanha os passos abaixo.
2. No primeiro uso, aceite o aviso para instalar os hooks em `~/.claude/settings.json` — a extensão adiciona dois: `SessionStart` e `UserPromptSubmit`. Hooks existentes são preservados.
3. Abra uma pasta e execute `claude` em qualquer terminal. A visão **Claude Todos** (Barra de Atividades) é populada assim que a sessão tem atividade.

**Sessões que já estavam em execução** quando você instalou os hooks são detectadas na próxima mensagem que você enviar a elas (é para isso que serve o `UserPromptSubmit`). Sessões novas são rastreadas imediatamente.

### Ative as ferramentas de tasks (Claude Code 2.1.233 ou mais recente)

Desde a versão **2.1.233** (14/08/2026), o Claude Code desliga por padrão as ferramentas de lista de tasks — `TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList` e `TaskGet` — quando o modelo é Opus 4.8, Sonnet 5, Fable 5, Mythos 5 ou mais novo. A decisão é da Anthropic: está no [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) e foi confirmada como intencional em [#86929](https://github.com/anthropics/claude-code/issues/86929); a issue que acompanha o assunto é [#80015](https://github.com/anthropics/claude-code/issues/80015). Sem essas ferramentas o agente não registra tasks no transcript e a lista deste painel fica vazia. A árvore de agentes, os tokens, o contexto, o cache, as notificações e as perguntas pendentes continuam funcionando.

Para reativá-las, adicione a variável `CLAUDE_CODE_ENABLE_TODO_TOOLS` ao `~/.claude/settings.json`. Se a chave `env` já existir, acrescente a linha dentro dela:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"
  }
}
```

A chave `env` do `settings.json` vale para toda sessão do Claude Code, em qualquer modelo e superfície (terminal, extensão oficial do VS Code). Reinicie as sessões abertas: o conjunto de ferramentas é definido quando a sessão começa. Se o Claude responder que "não tem TaskCreate ou TodoWrite", é este o motivo. A extensão não altera essa configuração por você.

## Comandos

| Comando | Atalho padrão |
|---|---|
| Claude Todos: Open in Editor | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Claude Todos: Choose Session | `Ctrl+Alt+S` / `Cmd+Alt+S` |
| Claude Todos: Refresh | — |
| Claude Todos: Install Session Hook | — |

## Configurações

| Configuração | Padrão | Efeito |
|---|---|---|
| `claudeTodos.claudeDir` | `""` (detecção automática via `os.homedir()`) | Sobrescreve a localização de `~/.claude`. |
| `claudeTodos.autoInstallHook` | `true` | Mostra o aviso de primeira execução pedindo para instalar os hooks. |
| `claudeTodos.language` | `auto` | Idioma da UI do painel (`auto` \| `en` \| `pt-br` \| `es` \| `zh-cn` \| `zh-tw`). |
| `claudeTodos.notifications` | `true` | Toast quando a sessão fica ociosa ou completa todas as tasks (janela sem foco). |
| `claudeTodos.activeFolder` | `""` | Multi-root: pasta do workspace a acompanhar; vazio = seguir a sessão mais ativa. |

## Privacidade e fluxo de dados

Esta extensão é **totalmente local**. Nada é enviado para nenhum servidor.

| Arquivo | Como é acessado | Por quê |
|---|---|---|
| `~/.claude/settings.json` | Lido + escrito (uma vez, com permissão) | Adiciona dois comandos de hook em `hooks.SessionStart` e `hooks.UserPromptSubmit`. Outros hooks e configurações são preservados. |
| `~/.claude/.vscode-todos-bridge/sessions.json` | Escrito pelo script de hook embarcado | Registra `{cwd, sessionId, terminalPid, startedAt}` para a extensão saber qual sessão do Claude pertence a qual janela do VSCode. Limitado a 200 entradas. |
| `~/.claude/projects/{cwd-encoded}/…` | Apenas leitura | Transcripts da sessão e dos sub-agents (`.jsonl` + `.meta.json`), gravados pelo próprio Claude Code — fonte das tasks, árvore, tempos e tokens. |
| `~/.claude/todos/` | Não é tocado | Localização legada do Claude Code 1.x. Ignorada. |

A extensão nunca modifica seus transcripts e nunca apaga nada.

## Requisitos

- VSCode 1.85 ou mais recente
- Claude Code 2.x (qualquer versão que escreva transcripts em `~/.claude/projects/`). A partir da **2.1.233**, com modelos novos, a lista de tasks exige `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` — veja [Instalação](#instalação).
- Node.js 20+ no `PATH` (o script de hook é um pequeno programa Node)

## Compilando a partir do código-fonte

```bash
git clone <repo-url>
cd claude-todos-vscode
npm install
npm test         # vitest
npm run build    # esbuild para a extensão + hook, vite para o webview Svelte
npx vsce package # gera claude-todos-<versão>.vsix
```

Para rodar a extensão em um host de desenvolvimento: abra a pasta no VSCode e pressione F5 (usa `.vscode/launch.json`).

## Limitações conhecidas

- O script de hook precisa estar acessível pelo caminho armazenado em `~/.claude/settings.json`. Se você apagar a extensão manualmente sem desinstalá-la, esses comandos de hook permanecem como no-ops — remova-os à mão ou reinstale e use `Claude Todos: Install Session Hook` novamente.
- Se as ferramentas de tasks do Claude Code estiverem desligadas (padrão a partir da 2.1.233 nos modelos novos), a lista fica vazia e o painel mostra "Sessão ativa — aguardando tasks" mesmo com o agente trabalhando. O resto do painel não depende delas. Como reativar: [Instalação](#instalação).

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para o checklist de smoke-test e o plano de testes manuais.

## Licença

[MIT](LICENSE)
