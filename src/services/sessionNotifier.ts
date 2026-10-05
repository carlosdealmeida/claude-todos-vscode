// Máquina de estados das notificações de sessão. Módulo PURO: não importa
// `vscode` e todo tempo é injetado via `now` — o host (extension.ts) alimenta
// pelo watcher e por um timer, e decide COMO exibir; aqui só decidimos O QUE
// disparar e quando, com as regras anti-ruído.

import type { AwaitingInput } from '../types';

export type NotificationKind = 'idle' | 'allComplete' | 'awaitingInput';

export interface NotifierInput {
  sessionId: string;    // sessão exibida no painel
  mtime: number;        // marcador de atividade: timestamp da última mensagem de conversa (0 se indisponível)
  allComplete: boolean; // main agent: todos.length > 0 && todas completed
  awaitingInput?: AwaitingInput | null;  // pergunta/plano pendente no transcript
  // R6: algum sub-agent rodando (inclusive em background). Conta como
  // atividade: o main pode estar em silêncio só esperando por ele.
  subAgentRunning?: boolean;
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
  private prevAwaiting: AwaitingInput | null = null;
  private subAgentRunning = false;

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
      this.prevAwaiting = input.awaitingInput ?? null;
      this.subAgentRunning = input.subAgentRunning === true;
      return [];
    }

    const out: NotificationKind[] = [];

    // allComplete: só na TRANSIÇÃO false -> true; nova task pendente rearma.
    if (input.allComplete && !this.prevAllComplete) out.push('allComplete');
    this.prevAllComplete = input.allComplete;

    // awaitingInput: transição para pendente (ou troca de kind) = aviso novo;
    // mesma pendência repetida não re-dispara.
    const awaiting = input.awaitingInput ?? null;
    if (awaiting !== null && awaiting !== this.prevAwaiting) out.push('awaitingInput');
    this.prevAwaiting = awaiting;

    const running = input.subAgentRunning === true;
    if (input.mtime !== this.lastMtime || running) {
      // Atividade: mensagem nova no main ou sub-agent rodando. Se o silêncio
      // anterior já tinha vencido IDLE_MS, abre uma NOVA rajada (o ciclo de
      // idle rearma). Sub-agent rodando mantém a rajada viva, então o idle do
      // fim inclui o trabalho dos agentes mesmo se o main fechar rápido.
      if (input.now - this.lastChangeAt >= IDLE_MS) this.activeSince = input.now;
      this.lastMtime = input.mtime;
      this.lastChangeAt = input.now;
      this.idleNotified = false;
    } else if (
      awaiting === null
      && !this.idleNotified
      && this.lastChangeAt - this.activeSince >= ACTIVITY_MIN_MS
      && input.now - this.lastChangeAt >= IDLE_MS
    ) {
      // Rajada longa o suficiente + silêncio vencido: o agente parou e espera.
      this.idleNotified = true;
      out.push('idle');
    }

    this.subAgentRunning = running;
    return out;
  }

  // O host mantém o timer rodando só enquanto um disparo de idle é possível
  // SEM nova atividade (rajada mínima já cumprida e silêncio ainda não vencido).
  shouldPoll(now: number): boolean {
    if (this.sessionId === null) return false;
    // Com sub-agent rodando o timer não pode parar: um comando longo e
    // silencioso do agente partiria a rajada e o idle do fim nunca sairia.
    if (this.subAgentRunning) return true;
    return !this.idleNotified
      && this.lastChangeAt - this.activeSince >= ACTIVITY_MIN_MS
      && now - this.lastChangeAt < IDLE_MS;
  }
}
