# Contribuindo

**Português** · [English](CONTRIBUTING.en.md) · [Español](CONTRIBUTING.es.md)

## Setup

```bash
npm install
npm test
npm run build
```

Os testes usam [Vitest](https://vitest.dev/). O build usa esbuild (extensão + hook) e Vite (webview Svelte).

## Estrutura do projeto

```
src/
  extension.ts             # ponto de entrada — conecta serviços, providers, comandos
  hooks/sessionStart.ts    # script de hook independente, empacotado à parte
  services/
    bridgeFile.ts          # leitura/escrita de ~/.claude/.vscode-todos-bridge/sessions.json
    todosParser.ts         # lê TodoWrite de ~/.claude/projects/*.jsonl
    sessionResolver.ts     # cwd do workspace -> sessões candidatas do bridge
    snapshotService.ts     # compõe resolver + parser, ignora sessões fantasma
    todosWatcher.ts        # fs.watch nos diretórios bridge + projects
    hookInstaller.ts       # edições idempotentes em ~/.claude/settings.json
    projectDir.ts          # codifica o cwd para o nome de diretório de projeto do Claude Code
  providers/
    todosViewProvider.ts   # WebviewView da Barra de Atividades
    todosPanelProvider.ts  # WebviewPanel do editor
  webview/                 # webview Svelte 5 (build com Vite)
tests/services/            # testes unitários, um por serviço
```

## Checklist de smoke test manual

Rode `F5` no VSCode (ou instale o `.vsix` gerado) e verifique:

- [ ] A Barra de Atividades mostra o ícone do Claude Todos
- [ ] Clicar abre a visão
- [ ] O primeiro uso pede para instalar os hooks
- [ ] Após aceitar, `~/.claude/settings.json` contém as entradas `SessionStart` e `UserPromptSubmit` apontando para o `sessionStart.js` desta extensão
- [ ] Numa janela nova de host de extensão, execute `claude` num terminal — o arquivo bridge ganha um novo registro
- [ ] Use `TodoWrite` na sessão do Claude Code — a visão atualiza em ~500ms
- [ ] `Ctrl+Alt+T` abre o painel no editor; visão e painel atualizam em sincronia
- [ ] Alternar o tema do VSCode entre escuro↔claro → as cores trocam corretamente
- [ ] Fechar a pasta → a visão mostra o estado vazio
- [ ] Abrir outra pasta sem sessão do Claude → "Waiting for a Claude Code session"
- [ ] Duas janelas do VSCode, duas pastas diferentes, duas sessões `claude` → cada uma vê apenas os próprios todos
- [ ] Sessão fantasma no bridge (registro cujo transcript não existe) é ignorada, e a próxima válida é usada

## Release

Veja [RELEASING.md](RELEASING.md) para o processo completo — marque um release `v*`, o workflow gera o `.vsix`, e ele é enviado ao Marketplace manualmente.

## Estilo de código

- Por padrão, sem comentários. Só adicione um quando o *porquê* não for óbvio.
- Prefira serviços enxutos e sem dependências. O motivo de não haver helpers de framework de teste (factories, fixtures, etc.) é que cada serviço é pequeno o bastante para ser testado diretamente.
- TDD ao adicionar um serviço: escreva o teste que falha, depois a implementação, depois o check verde.
