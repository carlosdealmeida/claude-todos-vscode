# Claude Todos para VSCode

**Português** · [English](README.en.md) · [Español](README.es.md)

[![VS Code Marketplace](https://img.shields.io/badge/VS_Code_Marketplace-Claude_Todos-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos)
[![CI](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosdealmeida/claude-todos-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Visualização ao vivo do `TodoWrite` do Claude Code, restrita ao workspace aberto na janela atual do VSCode. O painel mostra o agente principal e seus sub-agents lado a lado. Duas janelas do VSCode em projetos diferentes nunca veem os todos uma da outra.

![Painel Claude Todos: agente principal e sub-agents com as tasks avançando de pending → in_progress → completed ao vivo, com tempos por task](screenshots/claude-todos-demo.gif)

## Como funciona

![Painel Claude Todos atualizando ao vivo durante uma sessão do Claude Code](screenshots/panel-live-during-smoke-test.png)

O painel **Claude Todos** (na Barra de Atividades, à esquerda) lê os transcripts que o próprio Claude Code já grava em disco e mostra o agente principal e seus sub-agents lado a lado, com cada item transicionando `pending → in_progress → completed` em tempo real conforme o agente trabalha.

Não importa **onde** o `claude` esteja rodando: pode ser o terminal integrado do VSCode, qualquer terminal externo (Windows Terminal, iTerm, gnome-terminal) ou até a CLI do Claude Code em outra janela. Desde que o diretório de trabalho da sessão bata com o workspace aberto no VSCode, o painel reflete.

## Instalação

1. Instale a extensão (arquivo `.vsix` ou pelo VSCode Marketplace, quando publicado).
2. No primeiro uso, aceite o aviso para instalar os hooks em `~/.claude/settings.json` — a extensão adiciona dois: `SessionStart` e `UserPromptSubmit`. Hooks existentes são preservados.
3. Abra uma pasta e execute `claude` em qualquer terminal. A visão **Claude Todos** (Barra de Atividades) é populada assim que o Claude chama `TodoWrite`.

**Sessões que já estavam em execução** quando você instalou os hooks são detectadas na próxima mensagem que você enviar a elas (é para isso que serve o `UserPromptSubmit`). Sessões novas são rastreadas imediatamente.

## Comandos

| Comando | Atalho padrão |
|---|---|
| Claude Todos: Open in Editor | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Claude Todos: Refresh | — |
| Claude Todos: Install Session Hook | — |

## Configurações

| Configuração | Padrão | Efeito |
|---|---|---|
| `claudeTodos.claudeDir` | `""` (detecção automática via `os.homedir()`) | Sobrescreve a localização de `~/.claude`. |
| `claudeTodos.autoInstallHook` | `true` | Mostra o aviso de primeira execução pedindo para instalar os hooks. |

## Privacidade e fluxo de dados

Esta extensão é **totalmente local**. Nada é enviado para nenhum servidor.

| Arquivo | Como é acessado | Por quê |
|---|---|---|
| `~/.claude/settings.json` | Lido + escrito (uma vez, com permissão) | Adiciona dois comandos de hook em `hooks.SessionStart` e `hooks.UserPromptSubmit`. Outros hooks e configurações são preservados. |
| `~/.claude/.vscode-todos-bridge/sessions.json` | Escrito pelo script de hook embarcado | Registra `{cwd, sessionId, terminalPid, startedAt}` para a extensão saber qual sessão do Claude pertence a qual janela do VSCode. Limitado a 200 entradas. |
| `~/.claude/projects/{cwd-encoded}/{sessionId}.jsonl` | Apenas leitura | Transcript da sessão do próprio Claude Code. A extensão o percorre do fim para o início para achar o último evento `TodoWrite`. |
| `~/.claude/todos/` | Não é tocado | Localização legada do Claude Code 1.x. Ignorada. |

A extensão nunca modifica seus transcripts e nunca apaga nada.

## Requisitos

- VSCode 1.85 ou mais recente
- Claude Code 2.x (qualquer versão que escreva transcripts em `~/.claude/projects/`)
- Node.js 20+ no `PATH` (o script de hook é um pequeno programa Node)

## Compilando a partir do código-fonte

```bash
git clone <repo-url>
cd claude-todos-vscode
npm install
npm test         # vitest — 51 testes em 6 suítes de serviço
npm run build    # esbuild para a extensão + hook, vite para o webview Svelte
npx vsce package # gera claude-todos-<versão>.vsix
```

Para rodar a extensão em um host de desenvolvimento: abra a pasta no VSCode e pressione F5 (usa `.vscode/launch.json`).

## Limitações conhecidas

- Workspaces multi-root usam apenas a primeira pasta.
- O script de hook precisa estar acessível pelo caminho armazenado em `~/.claude/settings.json`. Se você apagar a extensão manualmente sem desinstalá-la, esses comandos de hook permanecem como no-ops — remova-os à mão ou reinstale e use `Claude Todos: Install Session Hook` novamente.

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para o checklist de smoke-test e o plano de testes manuais.

## Licença

[MIT](LICENSE)
