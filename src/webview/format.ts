import type { Todo, AgentUsage } from '../types';

// Compact token formatting for the panel: 7361 -> "7,4k", 24580 -> "24,6k".
// Uses a comma decimal separator to match pt-BR.
export function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  const units = [
    { v: 1_000_000, s: 'M' },
    { v: 1_000, s: 'k' },
  ];
  for (const u of units) {
    if (n >= u.v) {
      const rounded = Math.round((n / u.v) * 10) / 10;
      const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace('.', ',');
      return str + u.s;
    }
  }
  return String(Math.round(n));
}

// Duração compacta a partir de milissegundos: 45000 -> "45s", 134000 -> "2m 14s",
// 3900000 -> "1h 5m". Abaixo de 1s (ou inválido/negativo) -> "0s".
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return '0s';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m ${totalSec % 60}s`;
  const hours = Math.floor(totalMin / 60);
  return `${hours}h ${totalMin % 60}m`;
}

export interface TimingSummary {
  elapsedMs: number;     // tempo real decorrido conhecido (concluídas + parte ao vivo)
  estimateMs: number;    // estimativa do tempo restante (0 quando não estimável)
  hasEstimate: boolean;  // true só quando há base para estimar
}

interface CompletedDur {
  ms: number;
  observed: boolean;  // true = medido por um in_progress real; false = inferido
}

// Inferência sequencial das durações das tasks concluídas: usa o início observado
// quando existe; senão, assume que a task começou quando a anterior terminou
// (modelo de trabalho sequencial). Tasks concluídas em lote (mesmo instante) dão 0.
// Índice alinhado com `todos`; undefined para tasks não concluídas.
function sequentialCompleted(todos: Todo[]): (CompletedDur | undefined)[] {
  const out: (CompletedDur | undefined)[] = [];
  let cursor: number | undefined;
  for (const t of todos) {
    if (t.status === 'completed' && t.completedAt !== undefined) {
      if (t.startedAt !== undefined) {
        out.push({ ms: Math.max(0, t.completedAt - t.startedAt), observed: true });
      } else if (cursor !== undefined) {
        out.push({ ms: Math.max(0, t.completedAt - cursor), observed: false });
      } else {
        out.push({ ms: 0, observed: false });
      }
      cursor = t.completedAt;
    } else {
      out.push(undefined);
      if (t.status === 'in_progress' && t.startedAt !== undefined) cursor = t.startedAt;
    }
  }
  return out;
}

// Duração de cada task concluída (ms), com inferência sequencial. undefined para
// as não concluídas. Consumido pela UI para rotular cada item.
export function completedTaskDurations(todos: Todo[]): (number | undefined)[] {
  return sequentialCompleted(todos).map(d => d?.ms);
}

// Resume os tempos de uma lista de todos. `now` é injetado (não lido de Date.now)
// para manter a função pura e testável; o webview passa o relógio ao vivo.
export function summarizeTiming(todos: Todo[], now: number): TimingSummary {
  const seq = sequentialCompleted(todos);
  let elapsedMs = 0;
  let observedSum = 0;    // média da estimativa usa só durações realmente medidas
  let observedCount = 0;
  let unfinished = 0;

  todos.forEach((t, i) => {
    const d = seq[i];
    if (d) {
      elapsedMs += d.ms;
      if (d.observed) { observedSum += d.ms; observedCount++; }
    } else if (t.status === 'in_progress' && t.startedAt !== undefined) {
      elapsedMs += Math.max(0, now - t.startedAt);
    }
    if (t.status === 'pending' || t.status === 'in_progress') unfinished++;
  });

  // Estimativa em contagem regressiva: cada pendente custa a média; a task ativa
  // custa o que falta dela (média menos o que já rodou, sem ficar negativo), então
  // o total desce ao vivo conforme a ativa avança.
  const hasEstimate = observedCount >= 1 && unfinished >= 1;
  let estimateMs = 0;
  if (hasEstimate) {
    const avg = observedSum / observedCount;
    for (const t of todos) {
      if (t.status === 'pending') {
        estimateMs += avg;
      } else if (t.status === 'in_progress') {
        const elapsed = t.startedAt !== undefined ? Math.max(0, now - t.startedAt) : 0;
        estimateMs += Math.max(0, avg - elapsed);
      }
    }
  }
  return { elapsedMs, estimateMs, hasEstimate };
}

// "claude-opus-4-8" -> "opus-4-8"
export function shortModel(model: string): string {
  return model.startsWith('claude-') ? model.slice('claude-'.length) : model;
}

export type ContextLevel = 'ok' | 'warn' | 'danger';

// Maps a context-fill ratio (0..1+) to a traffic-light level:
// ok < 0.60 <= warn < 0.85 <= danger.
export function contextLevel(pct: number): ContextLevel {
  if (pct >= 0.85) return 'danger';
  if (pct >= 0.60) return 'warn';
  return 'ok';
}

export type CacheLevel = 'good' | 'mid' | 'low';

// Maps a cache-reuse ratio (0..1) to a traffic-light level. Inverted vs
// contextLevel: more reuse is better. good >= 0.75 > mid >= 0.50 > low.
export function cacheLevel(rate: number): CacheLevel {
  if (rate >= 0.75) return 'good';
  if (rate >= 0.50) return 'mid';
  return 'low';
}

// Total de tokens de um agente (input + output + cache somados entre modelos),
// para o contador do nó na árvore. null quando o agente não tem usage.
export function agentTotalTokens(byAgent: AgentUsage[] | undefined, agentId: string): number | null {
  const agent = byAgent?.find(a => a.agentId === agentId);
  if (!agent || agent.models.length === 0) return null;
  let total = 0;
  for (const m of agent.models) total += m.input + m.output + m.cache;
  return total;
}

export type AgentTypeTone = 'explore' | 'plan' | 'general' | 'neutral';

// Tom visual do badge de tipo do agente: tipos conhecidos ganham cor própria,
// custom caem no neutro. Case-insensitive (o harness usa "Explore"/"Plan").
export function agentTypeTone(agentType: string): AgentTypeTone {
  const t = agentType.toLowerCase();
  if (t === 'explore') return 'explore';
  if (t === 'plan') return 'plan';
  if (t.startsWith('general')) return 'general';
  return 'neutral';
}

export const STALE_LIST_THRESHOLD_MS = 5 * 60_000;

// Idade (ms) da lista do main quando ela está "defasada": o main não emite um
// evento de lista há ≥5min ENQUANTO algum sub-agent segue rodando — o progresso
// real pode estar nos cards dos sub-agents. Null quando qualquer condição falha
// (inclui lista vazia ou 100% concluída, que não enganam ninguém).
export function listStaleness(
  agent: { isMain: boolean; todos: Todo[]; todosUpdatedAt?: number },
  hasRunningSubAgent: boolean,
  now: number,
): number | null {
  if (!agent.isMain || agent.todosUpdatedAt === undefined) return null;
  if (agent.todos.length === 0) return null;
  if (!agent.todos.some(t => t.status !== 'completed')) return null;
  if (!hasRunningSubAgent) return null;
  const age = now - agent.todosUpdatedAt;
  return age >= STALE_LIST_THRESHOLD_MS ? age : null;
}
