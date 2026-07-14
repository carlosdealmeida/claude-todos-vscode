# Notificações de Sessão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toast nativo do VS Code quando a sessão exibida fica ociosa após atividade ou completa todas as tasks — ligado por padrão, suprimido com a janela focada.

**Architecture:** Máquina de estados **pura** (`SessionNotifier`, sem `vscode`, tempo injetado) decide o que disparar; o `extension.ts` a alimenta pelo `watcher.onChange` existente e por um `setInterval` de 10s armado só durante atividade (o `fs.watch` não avisa quando algo *para* de mudar). Gate de setting+foco na hora do toast. Spec: [docs/specs/2026-07-14-session-notifications-design.md](../specs/2026-07-14-session-notifications-design.md).

**Tech Stack:** TypeScript, vitest, VS Code API (`showInformationMessage`, `window.state.focused`, `ConfigurationTarget.Global`). Sem dependências novas.

## Global Constraints

- Sem dependências novas em `package.json`.
- `sessionNotifier.ts` é módulo **puro**: não importa `vscode`; todo tempo vem por parâmetro (`now`).
- Constantes fixas: `ACTIVITY_MIN_MS = 60_000`, `IDLE_MS = 45_000` (sem settings de tuning).
- Strings de UI novas nos TRÊS idiomas (`en`, `pt-br`, `es`) em `src/i18n/messages.ts` (teste de paridade existe) e nos três `package.nls*.json`.
- Setting novo: `claudeTodos.notifications` (boolean, default `true`).
- Toast só dispara com `claudeTodos.notifications !== false` E `vscode.window.state.focused === false` — gate **na hora do disparo**, não na detecção.
- Prioridade quando os dois gatilhos saem no mesmo observe: exibir só `allComplete`.
- Comentários de código em português; commits em português, conventional style.
- Suíte: `npx vitest run <arquivo>` focado; `npm test` completo. No Windows a suíte pode terminar com ruído `EPERM ... kill` do teardown — conhecido, NÃO é falha; vale o `Tests N passed`.

---

### Task 1: `SessionNotifier` — máquina de estados pura

**Files:**
- Create: `src/services/sessionNotifier.ts`
- Test: `tests/services/sessionNotifier.test.ts`

**Interfaces:**
- Consumes: nada (módulo folha).
- Produces (Task 3 depende): `type NotificationKind = 'idle' | 'allComplete'`;
  `interface NotifierInput { sessionId: string; mtime: number; allComplete: boolean; now: number }`;
  `class SessionNotifier { observe(input: NotifierInput): NotificationKind[]; shouldPoll(now: number): boolean }`;
  constantes exportadas `ACTIVITY_MIN_MS` e `IDLE_MS`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/services/sessionNotifier.test.ts
import { describe, it, expect } from 'vitest';
import { SessionNotifier, ACTIVITY_MIN_MS, IDLE_MS } from '../../src/services/sessionNotifier';

const T0 = 1_000_000_000;
const MIN = 60_000;

describe('SessionNotifier', () => {
  // Simula uma rajada de atividade contínua: observações a cada 30s (< IDLE_MS,
  // logo a rajada é contínua), do instante `from` até `from + span`, usando o
  // próprio timestamp como mtime (cada observação vê um mtime NOVO). Retorna o
  // instante/mtime da última mudança — observar depois com `mtime` igual a esse
  // retorno simula silêncio.
  function burst(n: SessionNotifier, sessionId: string, from: number, span: number, allComplete = false): number {
    let t = from;
    for (; t <= from + span; t += 30_000) {
      expect(n.observe({ sessionId, mtime: t, allComplete, now: t })).toEqual([]);
    }
    return t - 30_000;
  }

  it('never notifies on the first observation, even if already complete', () => {
    const n = new SessionNotifier();
    expect(n.observe({ sessionId: 's1', mtime: 1, allComplete: true, now: T0 })).toEqual([]);
  });

  it('fires idle exactly once after sustained activity followed by silence', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const lastChange = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    // silêncio: mesmo mtime, 45s depois da última mudança
    expect(n.observe({ sessionId: 's1', mtime: lastChange, allComplete: false, now: lastChange + IDLE_MS }))
      .toEqual(['idle']);
    // silêncio continua — não repete
    expect(n.observe({ sessionId: 's1', mtime: lastChange, allComplete: false, now: lastChange + IDLE_MS + 60_000 }))
      .toEqual([]);
  });

  it('does not fire idle after a short burst', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const lastChange = burst(n, 's1', T0, 20_000); // só 20s de atividade (< ACTIVITY_MIN_MS)
    expect(n.observe({ sessionId: 's1', mtime: lastChange, allComplete: false, now: lastChange + IDLE_MS }))
      .toEqual([]);
  });

  it('rearms idle when activity resumes after firing', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    expect(n.observe({ sessionId: 's1', mtime: c1, allComplete: false, now: c1 + IDLE_MS })).toEqual(['idle']);
    // nova rajada (gap > IDLE_MS abre um novo ciclo) e novo silêncio
    const t2 = c1 + IDLE_MS + 120_000;
    const c2 = burst(n, 's1', t2, ACTIVITY_MIN_MS);
    expect(n.observe({ sessionId: 's1', mtime: c2, allComplete: false, now: c2 + IDLE_MS })).toEqual(['idle']);
  });

  it('fires allComplete only on the false -> true transition', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
    expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: true, now: T0 + 5_000 }))
      .toEqual(['allComplete']);
    expect(n.observe({ sessionId: 's1', mtime: 3, allComplete: true, now: T0 + 10_000 })).toEqual([]);
  });

  it('does not fire allComplete when the session is complete since the first observation', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 1, allComplete: true, now: T0 });
    expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: true, now: T0 + 5_000 })).toEqual([]);
  });

  it('rearms allComplete when a new pending task appears', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 1, allComplete: false, now: T0 });
    expect(n.observe({ sessionId: 's1', mtime: 2, allComplete: true, now: T0 + 5_000 })).toEqual(['allComplete']);
    expect(n.observe({ sessionId: 's1', mtime: 3, allComplete: false, now: T0 + 10_000 })).toEqual([]);
    expect(n.observe({ sessionId: 's1', mtime: 4, allComplete: true, now: T0 + 15_000 })).toEqual(['allComplete']);
  });

  it('resets all state when the displayed session changes', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    // troca de sessão: primeira observação da nova nunca notifica…
    expect(n.observe({ sessionId: 's2', mtime: 999, allComplete: true, now: c1 + 1_000 })).toEqual([]);
    // …e o silêncio herdado da s1 não vaza para a s2
    expect(n.observe({ sessionId: 's2', mtime: 999, allComplete: true, now: c1 + 1_000 + IDLE_MS })).toEqual([]);
  });

  it('can return both kinds in one observe, allComplete first', () => {
    const n = new SessionNotifier();
    n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
    const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
    // no mesmo instante: tasks completaram (transição) e o silêncio venceu
    expect(n.observe({ sessionId: 's1', mtime: c1, allComplete: true, now: c1 + IDLE_MS }))
      .toEqual(['allComplete', 'idle']);
  });

  describe('shouldPoll', () => {
    it('is false before any observation', () => {
      expect(new SessionNotifier().shouldPoll(T0)).toBe(false);
    });

    it('is true while counting silence and false after idle fires', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const c1 = burst(n, 's1', T0, ACTIVITY_MIN_MS);
      expect(n.shouldPoll(c1 + 10_000)).toBe(true);   // silêncio ainda contando
      n.observe({ sessionId: 's1', mtime: c1, allComplete: false, now: c1 + IDLE_MS }); // dispara idle
      expect(n.shouldPoll(c1 + IDLE_MS + 1_000)).toBe(false); // notificado — timer pode parar
    });

    it('is false after a short burst goes silent past IDLE_MS', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const c1 = burst(n, 's1', T0, 20_000);
      expect(n.shouldPoll(c1 + IDLE_MS + 1_000)).toBe(false); // nada vai disparar sem nova atividade
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/sessionNotifier.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/sessionNotifier'`

- [ ] **Step 3: Implementar**

```ts
// src/services/sessionNotifier.ts
// Máquina de estados das notificações de sessão. Módulo PURO: não importa
// `vscode` e todo tempo é injetado via `now` — o host (extension.ts) alimenta
// pelo watcher e por um timer, e decide COMO exibir; aqui só decidimos O QUE
// disparar e quando, com as regras anti-ruído.

export type NotificationKind = 'idle' | 'allComplete';

export interface NotifierInput {
  sessionId: string;    // sessão exibida no painel
  mtime: number;        // transcriptMtime da sessão (0 se indisponível)
  allComplete: boolean; // main agent: todos.length > 0 && todas completed
  now: number;          // epoch ms, injetado
}

// Atividade contínua mínima antes de "ociosa" fazer sentido (rajadas curtas —
// uma resposta rápida — não notificam) e silêncio mínimo para considerar que o
// agente parou e espera o usuário.
export const ACTIVITY_MIN_MS = 60_000;
export const IDLE_MS = 45_000;

export class SessionNotifier {
  private sessionId: string | null = null;
  private lastMtime = 0;
  private lastChangeAt = 0;   // instante da última mudança de mtime observada
  private activeSince = 0;    // início da rajada de atividade corrente
  private idleNotified = false;
  private prevAllComplete = false;

  // Observa o estado corrente. Chamada a cada onChange do watcher E a cada
  // tick do timer. Retorna as notificações a disparar AGORA (no máximo uma de
  // cada tipo por ciclo; allComplete vem primeiro).
  observe(input: NotifierInput): NotificationKind[] {
    if (input.sessionId !== this.sessionId) {
      // Troca (ou estreia) da sessão exibida: zera tudo. A primeira observação
      // só inicializa — nunca notifica (inclusive se já abriu 100% completa).
      this.sessionId = input.sessionId;
      this.lastMtime = input.mtime;
      this.lastChangeAt = input.now;
      this.activeSince = input.now;
      this.idleNotified = false;
      this.prevAllComplete = input.allComplete;
      return [];
    }

    const out: NotificationKind[] = [];

    // allComplete: só na TRANSIÇÃO false -> true; nova task pendente rearma.
    if (input.allComplete && !this.prevAllComplete) out.push('allComplete');
    this.prevAllComplete = input.allComplete;

    if (input.mtime !== this.lastMtime) {
      // Atividade. Se o silêncio anterior já tinha vencido IDLE_MS, esta
      // mudança abre uma NOVA rajada (o ciclo de idle rearma).
      if (input.now - this.lastChangeAt >= IDLE_MS) this.activeSince = input.now;
      this.lastMtime = input.mtime;
      this.lastChangeAt = input.now;
      this.idleNotified = false;
    } else if (
      !this.idleNotified
      && this.lastChangeAt - this.activeSince >= ACTIVITY_MIN_MS
      && input.now - this.lastChangeAt >= IDLE_MS
    ) {
      // Rajada longa o suficiente + silêncio vencido: o agente parou e espera.
      this.idleNotified = true;
      out.push('idle');
    }

    return out;
  }

  // O host mantém o timer de silêncio rodando só enquanto isto for true:
  // ainda há um disparo de idle possível sem nova atividade.
  shouldPoll(now: number): boolean {
    if (this.sessionId === null) return false;
    return !this.idleNotified && now - this.lastChangeAt < IDLE_MS;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/services/sessionNotifier.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Suíte completa + commit**

Run: `npm test` → Expected: tudo verde.

```bash
git add src/services/sessionNotifier.ts tests/services/sessionNotifier.test.ts
git commit -m "feat(notify): SessionNotifier — máquina de estados pura (idle + allComplete)"
```

---

### Task 2: i18n + setting no manifesto

**Files:**
- Modify: `src/i18n/messages.ts` (4 chaves × 3 idiomas)
- Modify: `package.json` (setting `claudeTodos.notifications`)
- Modify: `package.nls.json`, `package.nls.pt-br.json`, `package.nls.es.json`

**Interfaces:**
- Consumes: catálogo i18n existente (`createT` interpola `{title}` como as chaves atuais interpolam `{count}`).
- Produces (Task 3 depende): chaves `notify.idle` (com `{title}`), `notify.allComplete` (com `{title}`), `notify.openPanel`, `notify.disable`; setting `claudeTodos.notifications` boolean default `true` com descrição `%config.notifications.description%`.

- [ ] **Step 1: Chaves no catálogo (`src/i18n/messages.ts`)**

Em `en`, após `'agent.tokensTooltip'`:

```ts
    'notify.idle': '"{title}" — waiting for you',
    'notify.allComplete': '"{title}" — all tasks completed',
    'notify.openPanel': 'Open panel',
    'notify.disable': "Don't notify",
```

Em `pt-br`, mesma posição:

```ts
    'notify.idle': '"{title}" — aguardando você',
    'notify.allComplete': '"{title}" — todas as tasks concluídas',
    'notify.openPanel': 'Abrir painel',
    'notify.disable': 'Não notificar',
```

Em `es`, mesma posição:

```ts
    'notify.idle': '"{title}" — esperándote',
    'notify.allComplete': '"{title}" — todas las tareas completadas',
    'notify.openPanel': 'Abrir panel',
    'notify.disable': 'No notificar',
```

- [ ] **Step 2: Rodar o teste de paridade**

Run: `npx vitest run tests/i18n/messages.test.ts`
Expected: PASS (o teste compara os conjuntos de chaves dos 3 idiomas — se alguma faltar, ele acusa).

- [ ] **Step 3: Setting no `package.json`**

Em `contributes.configuration.properties`, após o bloco `claudeTodos.language`:

```json
        "claudeTodos.notifications": {
          "type": "boolean",
          "default": true,
          "description": "%config.notifications.description%"
        }
```

- [ ] **Step 4: Descrição nos três `package.nls*.json`**

`package.nls.json` (após `config.language.es`):

```json
  "config.notifications.description": "Show a notification when the tracked session goes idle after activity, or completes all tasks (only while the VS Code window is unfocused)."
```

`package.nls.pt-br.json`:

```json
  "config.notifications.description": "Notifica quando a sessão acompanhada fica ociosa após um período de atividade, ou completa todas as tasks (somente com a janela do VS Code sem foco)."
```

`package.nls.es.json`:

```json
  "config.notifications.description": "Notifica cuando la sesión seguida queda inactiva tras un período de actividad, o completa todas las tareas (solo con la ventana de VS Code sin foco)."
```

(Atenção à vírgula do item anterior em cada arquivo JSON.)

- [ ] **Step 5: Verificar e commitar**

Run: `npm test` → PASS. Run: `npm run build` → 3 alvos ok (valida que o package.json continua são).

```bash
git add src/i18n/messages.ts package.json package.nls.json package.nls.pt-br.json package.nls.es.json
git commit -m "feat(notify): chaves i18n e setting claudeTodos.notifications (default ligado)"
```

---

### Task 3: Fiação no `extension.ts` + roadmap

**Files:**
- Modify: `src/extension.ts`
- Modify: `docs/ROADMAP.md` (item 14)

**Interfaces:**
- Consumes: `SessionNotifier`, `NotificationKind` (Task 1); chaves i18n e setting (Task 2); já existentes: `snapshotService.build()`, `parser.transcriptMtime(sessionId, cwd)`, `watcher.onChange`, `createT`/`resolveLocale`, comando `claudeTodos.openPanel`.
- Produces: notificações funcionando de ponta a ponta.

- [ ] **Step 1: Imports e instância**

Em `src/extension.ts`, adicionar ao bloco de imports:

```ts
import { SessionNotifier, type NotificationKind } from './services/sessionNotifier';
```

Dentro de `activate`, logo após `const watcher = new TodosWatcher(claudeDir);`:

```ts
  const notifier = new SessionNotifier();
  let notifyTimer: NodeJS.Timeout | null = null;
```

- [ ] **Step 2: Funções de observação e toast**

Adicionar dentro de `activate`, antes de `const showSessionPicker`:

```ts
  const stopNotifyTimer = (): void => {
    if (notifyTimer) { clearInterval(notifyTimer); notifyTimer = null; }
  };

  const startNotifyTimer = (): void => {
    if (!notifyTimer) notifyTimer = setInterval(() => observeSession(), 10_000);
  };

  // Gate de exibição (setting + foco) na hora do disparo — a detecção roda
  // sempre, para o estado do notifier não depender do foco da janela.
  const maybeToast = (kinds: NotificationKind[], title: string): void => {
    if (kinds.length === 0) return;
    const enabled = vscode.workspace.getConfiguration('claudeTodos').get<boolean>('notifications', true);
    if (!enabled || vscode.window.state.focused) return;
    const t = createT(resolveLocale());
    // Os dois no mesmo observe: exibe só allComplete (menos ruído).
    const message = kinds.includes('allComplete')
      ? t('notify.allComplete', { title })
      : t('notify.idle', { title });
    void vscode.window.showInformationMessage(message, t('notify.openPanel'), t('notify.disable'))
      .then(choice => {
        if (choice === t('notify.openPanel')) {
          void vscode.commands.executeCommand('claudeTodos.openPanel');
        } else if (choice === t('notify.disable')) {
          void vscode.workspace.getConfiguration('claudeTodos')
            .update('notifications', false, vscode.ConfigurationTarget.Global);
        }
      });
  };

  // Alimenta o notifier com a sessão exibida (a mesma que o snapshot escolhe).
  // Chamada em cada onChange do watcher e em cada tick do timer; o timer só
  // fica armado enquanto um disparo de idle ainda é possível (shouldPoll).
  const observeSession = (): void => {
    const snapshot = snapshotService.build();
    if (!snapshot) { stopNotifyTimer(); return; }
    const mtime = parser.transcriptMtime(snapshot.sessionId, snapshot.cwd) ?? 0;
    const main = snapshot.agents.find(a => a.isMain);
    const allComplete = main !== undefined
      && main.todos.length > 0
      && main.todos.every(td => td.status === 'completed');
    const fired = notifier.observe({
      sessionId: snapshot.sessionId,
      mtime,
      allComplete,
      now: Date.now(),
    });
    maybeToast(fired, snapshot.title);
    if (notifier.shouldPoll(Date.now())) startNotifyTimer(); else stopNotifyTimer();
  };
```

(Ordem de declaração importa — `const` não faz hoisting de valor: `stopNotifyTimer` → `startNotifyTimer` → `maybeToast` → `observeSession`, exatamente como no bloco acima.)

- [ ] **Step 3: Ligar no watcher e na ativação**

Trocar a subscription existente do watcher por:

```ts
  context.subscriptions.push(
    watcher.onChange(() => {
      viewProvider.pushSnapshot();
      panelProvider.pushSnapshot();
      observeSession();
    }),
  );
```

E, na última linha de `activate` (após `void maybePromptInstallHook(...)`):

```ts
  context.subscriptions.push({ dispose: stopNotifyTimer });
  observeSession();
```

(A primeira chamada só inicializa o estado do notifier — a primeira observação de uma sessão nunca notifica, por regra da Task 1.)

- [ ] **Step 4: Verificar**

Run: `npm test` → PASS (nenhum teste novo aqui; o comportamento com `vscode` é coberto pelo módulo puro + smoke manual).
Run: `npm run build` → 3 alvos ok.
Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Smoke manual (descrever o resultado no report)**

Com a extensão em dev (F5) ou empacotada: abrir uma sessão do Claude Code, deixá-la trabalhar ≥ 60s, desfocar a janela do VS Code e esperar ~45s de silêncio → toast `"{título}" — aguardando você` com os botões **Abrir painel** (abre o painel) e **Não notificar** (seta o setting global). Se não for possível executar VS Code interativo no ambiente, marcar o smoke como **pendente para o controller** no report — não improvisar.

- [ ] **Step 6: Roadmap**

Em `docs/ROADMAP.md`, item 14, trocar a linha do heading por:

```
### 14. Notificações — sessão terminou / aguardando input 🚧 implementado — aguardando release 0.10.0
```

E acrescentar como último bullet do item:

```
- **Status (2026-07):** implementado — spec: [docs/specs/2026-07-14-session-notifications-design.md](specs/2026-07-14-session-notifications-design.md) · plano: [docs/plans/2026-07-14-session-notifications.md](plans/2026-07-14-session-notifications.md). `SessionNotifier` puro (idle após ≥60s de atividade + 45s de silêncio; allComplete na transição), timer de 10s armado só em atividade, gate de setting+foco no disparo, toast com "Abrir painel"/"Não notificar". Falta: release 0.10.0.
```

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts docs/ROADMAP.md
git commit -m "feat(notify): fiação no extension — timer de silêncio, gate de foco e toast"
```
