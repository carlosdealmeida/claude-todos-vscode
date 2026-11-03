// Estados do painel que o harness fotografa. Sem DOM: usado pela pagina
// (entry.ts) e pelo runner (run.mts).
import type { AgentTodos, ProjectUsage, SessionSnapshot } from '../../src/types';

export interface ShotScript {
  frames: { atMs: number; snapshot: SessionSnapshot }[];
  projectUsage: ProjectUsage;
}

export const SHOT_CASES = ['live', 'full', 'alert', 'project', 'empty', 'awaiting', 'taskToolsOff', 'error'] as const;
export type ShotCase = (typeof SHOT_CASES)[number];

// O frame mais tardio com uma task em andamento: cobre os tres status.
function pickFrame(script: ShotScript): ShotScript['frames'][number] {
  const withWork = [...script.frames].reverse().find((f) =>
    f.snapshot.agents.some((a) => a.todos.some((t) => t.status === 'in_progress')),
  );
  return withWork ?? script.frames[script.frames.length - 1];
}

// Instante congelado: 30s depois do carimbo mais novo do frame. Nao usar
// recordedAt: a gravacao reproduziu um transcript antigo, 14 dias antes dele,
// e a task em andamento apareceria com 333h nos prints.
export function shotTime(script: ShotScript): number {
  const stamps = pickFrame(script).snapshot.agents.flatMap((a) =>
    a.todos.flatMap((t) => [t.startedAt ?? 0, t.completedAt ?? 0]),
  );
  return Math.max(...stamps) + 30_000;
}

function isoAfter(t: number, hours: number): string {
  return new Date(t + hours * 3_600_000).toISOString();
}

export function caseSnapshot(c: ShotCase, script: ShotScript): SessionSnapshot | null {
  const base = pickFrame(script).snapshot;
  const t = shotTime(script);
  switch (c) {
    case 'live':
    case 'project':
      return base;
    case 'empty':
    case 'error':
      return null;
    case 'awaiting':
      return { ...base, agents: [], usage: undefined };
    case 'taskToolsOff':
      return { ...base, agents: [], usage: undefined, taskToolsOff: true };
    case 'full': {
      // Tons de tipo de agente, sub-agent rodando, lista defasada e historico.
      const [main, a, b, c2] = base.agents;
      const agents: AgentTodos[] = [
        { ...main, todosUpdatedAt: t - 600_000 },
        { ...a, agentType: 'Explore', status: 'running' },
        { ...b, agentType: 'Plan' },
        { ...c2, agentType: 'revisor-custom' },
        { ...c2, agentId: 'shot-historico', name: 'historico', todos: [], status: 'completed' },
      ];
      return {
        ...base,
        agents,
        bridge: 'active',
        pendingQuestions: [
          { kind: 'question', header: 'Deploy', text: 'Publicar agora ou esperar a revisao?', line: 10 },
          { kind: 'plan', text: 'Migrar os tokens em duas etapas', line: 20 },
        ],
        usage: {
          ...base.usage!,
          context: { tokens: 130_000, limit: 200_000, source: 'mod' },
          cache: { input: 30, read: 60, creation: 10 },
          rateLimits: {
            readAt: t,
            limits: [
              { kind: 'five_hour', percentUsed: 42, resetsAt: isoAfter(t, 3) },
              { kind: 'seven_day', percentUsed: 71, resetsAt: isoAfter(t, 72) },
              { kind: 'spend_limit', percentUsed: 93, resetsAt: isoAfter(t, 240) },
            ],
          },
        },
      };
    }
    case 'alert':
      return {
        ...base,
        bridge: 'off',
        usage: {
          ...base.usage!,
          context: { tokens: 190_000, limit: 200_000 },
          cache: { input: 80, read: 10, creation: 10 },
        },
      };
  }
}
