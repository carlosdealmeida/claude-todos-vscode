# Onboarding walkthrough + reposicionamento "observability" — design

**Roadmap:** item 18 · Motivação: (a) reduzir abandono de quem instala e não configura o
hook; (b) o README vende "veja seus todos" enquanto a extensão já entrega observability
completa (árvore de agentes, tempos, tokens/contexto/cache, dashboard 7 dias,
notificações, tasks clicáveis) — e agora está em **dois** marketplaces (VS Code + Open VSX).

## 18a — Walkthrough nativo (tour completo)

`contributes.walkthroughs` com um walkthrough `claudeTodos.gettingStarted`, 5 passos:

| # | Passo | Ação/botão | completionEvents |
|---|---|---|---|
| 1 | Instalar o hook de sessão | `command:claudeTodos.installHook` | `onCommand:claudeTodos.installHook` |
| 2 | Iniciar uma sessão do Claude Code | instrução (rodar `claude` em qualquer terminal na pasta do workspace) | — (check manual) |
| 3 | Abrir o painel | `command:claudeTodos.openPanel` (menciona `Ctrl+Alt+T`) | `onCommand:claudeTodos.openPanel` |
| 4 | Escolher a sessão | `command:claudeTodos.pickSession` (menciona `Ctrl+Alt+S`) | `onCommand:claudeTodos.pickSession` |
| 5 | Explorar árvore + dashboard | instrução (expandir sub-agents, bloco "Últimos 7 dias") | — (check manual) |

- **Mídia:** reutiliza `media/icon.svg` em todos os passos (v1 sem arte dedicada — YAGNI;
  arte por passo é melhoria futura se o funil justificar).
- **i18n:** título/descrição do walkthrough e de cada passo via `%keys%` nos 3
  `package.nls*.json` (mesma limitação dos títulos de comando: seguem o display language
  do VS Code).

## 18b — Reposicionamento + dois marketplaces + higiene (READMEs ×3)

Reescrita coordenada de `README.md`, `README.en.md`, `README.es.md`:

1. **Reposicionamento.** Tagline nova — *"Observability para seus agentes Claude Code:
   tasks, árvore de agentes, tokens e cache ao vivo, restrito ao workspace"* — e uma seção
   de features que conta a história completa, nesta ordem: árvore de agentes ao vivo →
   tempos por task → tokens/contexto/cache → dashboard 7 dias (por modelo e por tipo de
   agente) → notificações → tasks clicáveis → i18n. O princípio de privacidade
   (escopo-por-workspace, 100% local) permanece em destaque.
2. **Dois canais como iguais.**
   - Badges de **versão dinâmicos** para ambos: `visual-studio-marketplace/v/...` e
     `open-vsx/v/...` (o badge atual do Marketplace é estático e sem versão).
   - Instalação organizada por editor: VS Code → Marketplace · Cursor/Windsurf/VSCodium →
     Open VSX · `.vsix` do GitHub Release como fallback.
3. **Higiene de conteúdo defasado.**
   - Tabela de comandos completa (inclui `Choose Session` · `Ctrl+Alt+S`).
   - Tabela de settings completa (`claudeDir`, `autoInstallHook`, `language`,
     `notifications`, `activeFolder`).
   - Remover contagens que envelhecem ("51 testes em 6 suítes" → só `npm test`).
   - Mencionar o walkthrough na instalação (Get Started abre automaticamente).

## Manifesto (marketplace listing)

- `package.json` `keywords` += `observability`, `monitoring`, `token usage`, `dashboard`,
  `multi-agent` (limite do marketplace: manter ≤ 30? — na prática vsce alerta acima de 30;
  ficamos bem abaixo).
- `extension.description` (nos 3 nls): de "Live view of Claude Code TodoWrite tool…" para
  "Live observability for your Claude Code agents: tasks, agent tree, tokens and cache —
  scoped to the current workspace" (+ traduções pt-br/es).

## Fora de escopo

- Arte/screenshots novos por passo do walkthrough (reavaliação futura).
- Regravar o GIF de demonstração do README (o atual continua válido).

## Testes/validação

- `npm run build` + `npx vsce package` validam o manifesto (walkthrough/keys nls).
- Walkthrough conferido manualmente num Extension Development Host (F5) — passos, botões
  e completionEvents.
- READMEs: revisão de links (badges, stores) e consistência entre os 3 idiomas.
