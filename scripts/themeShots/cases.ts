// Estados do painel que o harness fotografa. Sem DOM: usado pela pagina
// (entry.ts) e pelo runner (run.mts).
import type { AgentTodos, ProjectUsage, SessionSnapshot } from '../../src/types';

export interface ShotScript {
  frames: { atMs: number; snapshot: SessionSnapshot }[];
  projectUsage: ProjectUsage;
}

// Cor que nenhum tema usa: se ela aparecer no painel, a cor do editor vazou.
export const LEAK_SENTINEL = 'rgb(255, 0, 255)';

export const SHOT_CASES =['live', 'full', 'alert', 'project', 'empty', 'awaiting', 'taskToolsOff', 'taskToolsBanner', 'error'] as const;
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

// So para as checagens de comportamento, fora das imagens: quatro medidores com
// valores longos e nomes de agente com o mesmo comeco, em painel estreito.
export function narrowSnapshot(script: ShotScript): SessionSnapshot {
  const base = pickFrame(script).snapshot;
  return {
    ...base,
    agents: base.agents.map((a, i) => (i === 0 ? a : { ...a, name: `revisor-de-longo-alcance-${i}` })),
    usage: {
      ...base.usage!,
      context: { tokens: 130_000, limit: 200_000, source: 'mod' },
      cache: { input: 30, read: 60, creation: 10 },
      byModel: [
        { model: 'claude-opus-5-5', input: 9_000_000, output: 5_300_000, cache: 900_000_000 },
        { model: 'claude-opus-4-7', input: 4_000_000, output: 2_000_000, cache: 128_000_000 },
      ],
    },
  };
}

// So para as checagens: listas longas, para a barra segmentada do Mission.
export function manyTasksSnapshot(script: ShotScript): SessionSnapshot {
  const base = pickFrame(script).snapshot;
  const lengths = [40, 120, 17];
  return {
    ...base,
    agents: base.agents.map((a, i) => {
      const length = lengths[i];
      if (length === undefined || a.todos.length === 0) return a;
      const done = Math.floor(length / 4);
      return {
        ...a,
        todos: Array.from({ length }, (_, n) => ({
          ...a.todos[0],
          status: n < done ? ('completed' as const) : n === done ? ('in_progress' as const) : ('pending' as const),
        })),
      };
    }),
  };
}

// So para as checagens: nenhum agente vivo, todos no historico.
export function noLiveSnapshot(script: ShotScript): SessionSnapshot {
  const base = pickFrame(script).snapshot;
  return {
    ...base,
    agents: base.agents.filter((a) => !a.isMain).map((a) => ({ ...a, status: 'completed' as const, todos: [] })),
  };
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
    case 'taskToolsBanner':
      return { ...base, agents: base.agents.map((a) => ({ ...a, todos: [] })), taskToolsOff: true };
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
