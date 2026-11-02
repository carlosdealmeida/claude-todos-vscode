// R6: ciclo de vida dos sub-agents assíncronos. Módulo PURO (sem fs): recebe as
// linhas de UM transcript — o de quem disparou os agentes — e devolve, por
// agentId, o último evento visto. Lançamento e retomada = rodando; a
// <task-notification> = parado, ou esperando quando o agente só parou até o
// próprio trabalho em background voltar. Formatos medidos no disco em 2026-10-04
// (spec docs/specs/2026-10-05-subagents-background-e-janela-fable-design.md).

export type LifecycleState = 'running' | 'waiting' | 'stopped';

export interface LifecycleEntry {
  state: LifecycleState;
  at: number; // epoch ms do record; 0 sem timestamp
}

// R6, achado 3. O agente em espera acorda sozinho, sem novo evento de ciclo de
// vida, mas pode nunca acordar: dos 58 despertares medidos em 2026-11-02, 54 vieram
// em até 30 min, e 9 agentes nunca voltaram. Passado esse silêncio, conta como parado.
export const WAITING_SILENCE_MS = 30 * 60_000;

// A ponte grava o fim do turno junto com o aviso de espera: medido de -10 s a
// +1,8 s da notificação, em 665 agentes.
const SAME_EVENT_MS = 5_000;

// Pré-filtro: só linhas com uma destas marcas passam pelo JSON.parse — o
// transcript principal pode ter dezenas de milhares de linhas.
const MARKERS = ['async_launched', 'Async agent launched', 'resumedAgentId', '<task-notification>'];
const LAUNCH_TEXT = 'Async agent launched';
const LAUNCH_ID = /agentId: ([\w-]+)/;
const TASK_ID = /<task-id>([^<]+)<\/task-id>/;
const NOTIFICATION = '<task-notification>';
// Só o primeiro <summary> é o da notificação; o <result> pode citar outra inteira.
const SUMMARY = /<summary>([^<]*)<\/summary>/;
const WAITING_SUMMARY_END = 'is waiting on its own background work';

interface RawEntry {
  type?: unknown;
  timestamp?: unknown;
  toolUseResult?: unknown;
  attachment?: unknown;
  message?: { content?: unknown };
}

// agentId e estado de um texto que É uma <task-notification> (começa por ela);
// null para qualquer outro texto, inclusive um que só a mencione no meio.
function notified(text: string): { id: string; state: LifecycleState } | null {
  if (!text.startsWith(NOTIFICATION)) return null;
  const id = TASK_ID.exec(text)?.[1];
  if (!id) return null;
  const waiting = SUMMARY.exec(text)?.[1].endsWith(WAITING_SUMMARY_END) === true;
  return { id, state: waiting ? 'waiting' : 'stopped' };
}

function epochOf(ts: unknown): number {
  if (typeof ts !== 'string') return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

// Texto de um tool_result: string, ou a concatenação dos blocos { type: 'text' }.
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(b => (b !== null && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string'
      ? (b as { text: string }).text
      : ''))
    .join('\n');
}

// O resultado de uma retomada é o JSON do SendMessage, com resumedAgentId no
// nível de cima (medido: 69 de 69 no disco). Um registro de transcript colado
// como saída de ferramenta (cat, grep) tem o campo aninhado e não conta.
function resumedAgentIdOf(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const id = (parsed as { resumedAgentId?: unknown }).resumedAgentId;
      if (typeof id === 'string') return id;
    }
  } catch { /* não é um JSON único: saída de ferramenta comum */ }
  return null;
}

export function collectAgentLifecycle(lines: string[]): Map<string, LifecycleEntry> {
  const out = new Map<string, LifecycleEntry>();
  for (const line of lines) {
    if (!line || !MARKERS.some(m => line.includes(m))) continue;
    let entry: RawEntry;
    try { entry = JSON.parse(line) as RawEntry; } catch { continue; }
    const at = epochOf(entry.timestamp);

    // Parada entregue no meio de um turno do main: attachment queued_command
    // com o texto da notificação em `prompt` (medido: 15 de 112 paradas no disco,
    // 13 delas só nesse formato).
    if (entry.type === 'attachment') {
      const attachment = entry.attachment as { type?: unknown; prompt?: unknown } | null | undefined;
      if (attachment?.type === 'queued_command' && typeof attachment.prompt === 'string') {
        const event = notified(attachment.prompt);
        if (event) out.set(event.id, { state: event.state, at });
      }
      continue;
    }
    // A cópia em queue-operation (content no nível de cima) fica de fora aqui.
    if (entry.type !== 'user') continue;
    const content = entry.message?.content;

    // Parada entregue entre turnos: mensagem do usuário, em string.
    if (typeof content === 'string') {
      const event = notified(content);
      if (event) out.set(event.id, { state: event.state, at });
      continue;
    }
    if (!Array.isArray(content)) continue;

    // Transcript enriquecido (o principal): só os campos estruturados valem.
    const result = entry.toolUseResult;
    if (result !== undefined && result !== null) {
      if (typeof result === 'object') {
        const { status, agentId, resumedAgentId } = result as Record<string, unknown>;
        if (status === 'async_launched' && typeof agentId === 'string') out.set(agentId, { state: 'running', at });
        if (typeof resumedAgentId === 'string') out.set(resumedAgentId, { state: 'running', at });
      }
      continue;
    }

    // Sem toolUseResult (transcripts de sub-agent): o mesmo dado vem no texto.
    for (const block of content) {
      if (block === null || typeof block !== 'object' || (block as { type?: unknown }).type !== 'tool_result') continue;
      const text = textOf((block as { content?: unknown }).content).trimStart();
      if (text.startsWith(LAUNCH_TEXT)) {
        const id = LAUNCH_ID.exec(text)?.[1];
        if (id) out.set(id, { state: 'running', at });
      } else if (text.startsWith('{')) {
        const id = resumedAgentIdOf(text);
        if (id) out.set(id, { state: 'running', at });
      }
    }
  }
  return out;
}

// Uma parada logo depois do aviso de espera é o fim do mesmo turno, não o fim do
// agente; uma parada anterior ao aviso perde para ele de qualquer jeito.
function stopOfSameTurn(waiting: LifecycleEntry, other: LifecycleEntry): boolean {
  return waiting.state === 'waiting' && other.state === 'stopped'
    && other.at - waiting.at <= SAME_EVENT_MS;
}

// Junta os mapas de transcripts diferentes (o principal e os de cada
// sub-agent) e a ponte: para o mesmo agentId vence o evento mais recente; no
// empate, o primeiro mapa. A exceção é o aviso de espera (stopOfSameTurn).
export function mergeLifecycles(maps: Map<string, LifecycleEntry>[]): Map<string, LifecycleEntry> {
  const out = new Map<string, LifecycleEntry>();
  for (const map of maps) {
    for (const [id, entry] of map) {
      const current = out.get(id);
      if (current === undefined || stopOfSameTurn(entry, current)
        || (!stopOfSameTurn(current, entry) && entry.at > current.at)) {
        out.set(id, entry);
      }
    }
  }
  return out;
}
