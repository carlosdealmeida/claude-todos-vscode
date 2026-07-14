# Design — Notificações de sessão (ociosa / tasks completas)

**Data:** 2026-07-14
**Status:** aprovado, aguardando plano de implementação
**Origem:** roadmap item 14 (aposta de produto) — dor nº 1 de sessões longas: o agente termina
(ou para numa pergunta) e o usuário só percebe minutos depois

Toast nativo do VS Code quando a sessão exibida no painel fica ociosa após atividade, ou
quando todas as tasks do main agent completam. Ligado por padrão, suprimido enquanto a
janela tem foco.

---

## Decisões de escopo (validadas com o usuário)

1. **Gatilhos desta versão:** (a) **sessão ociosa** — o transcript para de mudar por um
   período após atividade contínua (cobre "terminou" e "travou numa pergunta": nos dois
   casos o Claude parou e espera o usuário); (b) **todas as tasks completaram** — transição
   do snapshot para 100% completed no main agent. Fora de escopo: notificação por sub-agent
   (ruidoso — sessões reais têm 15+ agentes).
2. **Supressão por foco:** toast só dispara com a janela do VS Code **sem foco**
   (`vscode.window.state.focused === false`). Quem está olhando o painel não precisa de toast.
3. **Default ligado:** setting novo `claudeTodos.notifications` (boolean, default `true`).
   O botão "Não notificar" no próprio toast desliga o setting globalmente (descoberta com
   porta de saída de um clique).
4. **Abordagem A:** máquina de estados **pura** + timer leve no host da extensão. A
   alternativa via hook `Stop` do Claude Code (detecção instantânea de fim de turno) fica
   como upgrade futuro por trás da mesma interface — exige mais consentimento de hook e
   não cobre quem recusou hooks.

---

## Arquitetura

**`src/services/sessionNotifier.ts` — módulo puro** (padrão `format.ts`/`tree.ts`: sem
importar `vscode`, tempo injetado, 100% testável em vitest):

```ts
export type NotificationKind = 'idle' | 'allComplete';

export class SessionNotifier {
  // Observa o estado corrente da sessão exibida. Chamada a cada onChange do
  // watcher E a cada tick do timer. Retorna as notificações a disparar AGORA
  // (no máximo uma de cada tipo por ciclo de atividade).
  observe(input: {
    sessionId: string;
    mtime: number;            // transcriptMtime da sessão exibida
    allComplete: boolean;     // main agent: todos.length > 0 && todas completed
    now: number;
  }): NotificationKind[];
}
```

**Estado interno por sessão exibida** (troca de `sessionId` zera tudo):
`{ lastMtime, lastChangeAt, activeSince, idleNotified, prevAllComplete }`.

**Regras:**

- **Atividade:** `mtime` mudou → `lastChangeAt = now`; se vinha parado, `activeSince = now`;
  `idleNotified = false` (rearma).
- **`idle`:** dispara quando `lastChangeAt - activeSince >= ACTIVITY_MIN_MS` (a sessão
  trabalhou por um período contínuo) **e** `now - lastChangeAt >= IDLE_MS` (silêncio) **e**
  `!idleNotified`. Marca `idleNotified = true` — só rearma com nova atividade.
- **`allComplete`:** dispara na TRANSIÇÃO `prevAllComplete === false → allComplete === true`
  (o flag já embute `todos.length > 0`). Atualiza `prevAllComplete` a cada observe — nova
  task pendente rearma.
- **Constantes fixas** (sem settings de tuning — YAGNI):
  `ACTIVITY_MIN_MS = 60_000`, `IDLE_MS = 45_000`.
- Os dois gatilhos são independentes; um `observe` pode retornar ambos (sessão completa as
  tasks e silencia) — o host decide exibir os dois ou priorizar (`allComplete` primeiro).

**Fiação no `extension.ts`:**

- O `watcher.onChange` existente passa a também alimentar o notifier (além do
  `pushSnapshot`), usando a **sessão exibida** — a mesma que `snapshotService.build()`
  escolhe (pinned ou mais recente). Dados: `transcriptMtime` + snapshot corrente.
- **Timer:** `setInterval` de 10s que só roda enquanto a última observação indicou sessão
  "em atividade" (silêncio ainda < IDLE_MS ou atividade em curso). Quando o notifier fica
  ocioso-e-notificado, o timer é desligado até o próximo `onChange` (custo zero em repouso).
  Necessário porque `fs.watch` só avisa quando algo MUDA — nunca quando PARA de mudar.
- **Gate no disparo:** `claudeTodos.notifications !== false` **e**
  `vscode.window.state.focused === false`. Checados na hora do toast (não na detecção),
  para o estado do notifier não depender do foco.

**Toast** (`vscode.window.showInformationMessage`):

- `idle`: `"{título}" — aguardando você` · `allComplete`: `"{título}" — todas as tasks concluídas`
  ({título} = título da sessão, mesmo do header do painel).
- Botões: **Abrir painel** → `claudeTodos.openPanel` · **Não notificar** → seta
  `claudeTodos.notifications = false` no escopo global
  (`ConfigurationTarget.Global`).
- Strings via catálogo i18n (en/pt-br/es), chaves novas: `notify.idle`, `notify.allComplete`,
  `notify.openPanel`, `notify.disable`.

**Manifesto (`package.json` + `package.nls.*`):** setting `claudeTodos.notifications`
(boolean, default `true`, descrição nos 3 idiomas).

---

## Casos de borda

| Caso | Comportamento |
|---|---|
| Usuário troca a sessão exibida (picker) | Estado do notifier zera; nada dispara na primeira observação da nova sessão. |
| Sessão nova sem atividade prévia | `idle` exige `ACTIVITY_MIN_MS` de atividade contínua antes — sessão parada não notifica nunca. |
| Rajadas curtas (uma pergunta rápida) | Atividade < 60s → sem `idle`. Evita toast a cada resposta curta. |
| VS Code com foco | Detecção roda normalmente, toast suprimido — se a janela perde o foco depois, NÃO notifica retroativamente (o gate é na hora do disparo). |
| `allComplete` numa sessão que já abriu 100% completa | `prevAllComplete` inicializa com o valor da primeira observação — sem toast de estreia. |
| Setting desligado | Notifier continua alimentado (barato), toasts suprimidos. Religar não dispara nada retroativo. |
| Duas janelas do VS Code no mesmo projeto | Cada janela notifica pela SUA sessão exibida (escopo por workspace preservado). Foco é por janela — a janela focada suprime, a outra notifica. |

---

## Testes

- **`sessionNotifier` (unit, tempo injetado):** ciclo completo idle (ativa 60s → silêncio
  45s → dispara 1x → silêncio continua → nada → atividade volta → rearma); rajada curta não
  dispara; allComplete na transição e rearme com nova task; primeira observação já-completa
  não dispara; troca de sessionId zera; observe retornando ambos os tipos.
- **Manifesto/i18n:** paridade das chaves novas nos 3 idiomas (teste existente cobre).
- **Smoke manual:** sessão real → desfocar a janela → esperar o silêncio → toast com os
  dois botões funcionando.
