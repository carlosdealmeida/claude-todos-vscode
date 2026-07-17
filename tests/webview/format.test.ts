import { describe, it, expect } from 'vitest';
import { formatCompact, shortModel, modelBadge, contextLevel, cacheLevel, formatDuration, summarizeTiming, completedTaskDurations, agentTotalTokens, agentTypeTone, listStaleness } from '../../src/webview/format';
import type { Todo, TodoStatus, AgentUsage } from '../../src/types';

function todo(status: TodoStatus, startedAt?: number, completedAt?: number): Todo {
  const t: Todo = { content: status, activeForm: status, status };
  if (startedAt !== undefined) t.startedAt = startedAt;
  if (completedAt !== undefined) t.completedAt = completedAt;
  return t;
}

describe('formatCompact', () => {
  it('formats values below 1000 as-is', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(433)).toBe('433');
    expect(formatCompact(999)).toBe('999');
  });
  it('formats thousands with a comma decimal and k suffix', () => {
    expect(formatCompact(1000)).toBe('1k');
    expect(formatCompact(7361)).toBe('7,4k');
    expect(formatCompact(24580)).toBe('24,6k');
  });
  it('formats millions with M suffix', () => {
    expect(formatCompact(1_500_000)).toBe('1,5M');
    expect(formatCompact(2_000_000)).toBe('2M');
  });
  it('clamps negative/non-finite to 0', () => {
    expect(formatCompact(-5)).toBe('0');
    expect(formatCompact(NaN)).toBe('0');
  });
});

describe('formatDuration', () => {
  it('clamps zero, negative and non-finite to 0s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(NaN)).toBe('0s');
  });
  it('shows 0s for sub-second durations', () => {
    expect(formatDuration(500)).toBe('0s');
  });
  it('shows whole seconds below a minute', () => {
    expect(formatDuration(45_000)).toBe('45s');
  });
  it('shows minutes and seconds below an hour', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(134_000)).toBe('2m 14s');
  });
  it('shows hours and minutes from an hour up', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m');
    expect(formatDuration(3_900_000)).toBe('1h 5m');
  });
});

describe('completedTaskDurations', () => {
  it('uses the observed span when startedAt is present', () => {
    expect(completedTaskDurations([todo('completed', 0, 60_000)])).toEqual([60_000]);
  });

  it('infers the start from the previous task completion when startedAt is missing', () => {
    const todos = [todo('completed', 0, 60_000), todo('completed', undefined, 90_000)];
    expect(completedTaskDurations(todos)).toEqual([60_000, 30_000]);
  });

  it('yields zero for tasks completed in the same batch', () => {
    const todos = [
      todo('completed', 0, 60_000),
      todo('completed', undefined, 60_000),
      todo('completed', undefined, 60_000),
    ];
    expect(completedTaskDurations(todos)).toEqual([60_000, 0, 0]);
  });

  it('returns undefined for tasks that are not completed', () => {
    const todos = [todo('pending'), todo('in_progress', 0), todo('completed', 0, 60_000)];
    expect(completedTaskDurations(todos)).toEqual([undefined, undefined, 60_000]);
  });

  it('yields zero for a first task that lacks a start', () => {
    expect(completedTaskDurations([todo('completed', undefined, 50_000)])).toEqual([0]);
  });
});

describe('summarizeTiming', () => {
  it('counts inferred durations in elapsed but not in the estimate average', () => {
    const todos = [todo('completed', 0, 60_000), todo('completed', undefined, 90_000), todo('pending')];
    const r = summarizeTiming(todos, 999_999);
    expect(r.elapsedMs).toBe(90_000);   // 60_000 observado + 30_000 inferido
    expect(r.estimateMs).toBe(60_000);  // média só do observado (60_000) × 1 pendente
  });

  it('sums completed task durations into elapsedMs', () => {
    const r = summarizeTiming([todo('completed', 0, 60_000)], 999_999);
    expect(r.elapsedMs).toBe(60_000);
  });

  it('includes the live elapsed of an in_progress task', () => {
    const r = summarizeTiming(
      [todo('completed', 0, 60_000), todo('in_progress', 100_000)],
      130_000,
    );
    expect(r.elapsedMs).toBe(90_000); // 60_000 + (130_000 - 100_000)
  });

  it('has no estimate without a measurable completed task', () => {
    const r = summarizeTiming([todo('in_progress', 0)], 30_000);
    expect(r.hasEstimate).toBe(false);
    expect(r.estimateMs).toBe(0);
    expect(r.elapsedMs).toBe(30_000);
  });

  it('estimates remaining as average completed duration times remaining count', () => {
    const r = summarizeTiming(
      [todo('completed', 0, 40_000), todo('completed', 40_000, 120_000), todo('pending'), todo('pending')],
      999_999,
    );
    expect(r.hasEstimate).toBe(true);
    expect(r.estimateMs).toBe(120_000); // avg (40_000+80_000)/2 = 60_000 * 2 restantes
    expect(r.elapsedMs).toBe(120_000);
  });

  it('counts the remaining estimate down as the in_progress task runs', () => {
    // avg concluída = 60s; pendente contribui 60s; a ativa contribui max(0, 60s - decorrido dela)
    const todos = [todo('completed', 0, 60_000), todo('in_progress', 1_000_000), todo('pending')];
    const early = summarizeTiming(todos, 1_020_000); // 20s na ativa → 40_000 + 60_000
    const later = summarizeTiming(todos, 1_050_000); // 50s na ativa → 10_000 + 60_000
    expect(early.estimateMs).toBe(100_000);
    expect(later.estimateMs).toBe(70_000);
    expect(later.estimateMs).toBeLessThan(early.estimateMs);
  });

  it('floors the active task share at zero when it exceeds the average', () => {
    const todos = [todo('completed', 0, 60_000), todo('in_progress', 1_000_000), todo('pending')];
    const over = summarizeTiming(todos, 1_200_000); // 200s na ativa (>60s) → 0 + 60_000 pendente
    expect(over.estimateMs).toBe(60_000);
  });

  it('clamps out-of-order timestamps to zero', () => {
    const r = summarizeTiming([todo('completed', 100_000, 50_000)], 999_999);
    expect(r.elapsedMs).toBe(0);
  });

  it('ignores tasks without startedAt in elapsed and estimate base', () => {
    const r = summarizeTiming(
      [todo('completed', undefined, 60_000), todo('in_progress', 0)],
      30_000,
    );
    expect(r.elapsedMs).toBe(30_000); // só a in_progress conta
    expect(r.hasEstimate).toBe(false); // nenhuma completed mensurável
  });
});

describe('shortModel', () => {
  it('strips the claude- prefix', () => {
    expect(shortModel('claude-opus-4-8')).toBe('opus-4-8');
  });
  it('strips a legacy date suffix', () => {
    expect(shortModel('claude-3-5-sonnet-20241022')).toBe('3-5-sonnet');
  });
  it('strips the date but keeps the [1m] suffix', () => {
    expect(shortModel('claude-sonnet-4-5-20250929[1m]')).toBe('sonnet-4-5[1m]');
  });
  it('passes through an already-short id', () => {
    expect(shortModel('opus-4-8')).toBe('opus-4-8');
  });
});

describe('modelBadge', () => {
  it('main: shows whenever a model exists', () => {
    expect(modelBadge('claude-opus-4-8', undefined, true)).toBe('opus-4-8');
  });
  it('main: null without a model', () => {
    expect(modelBadge(undefined, undefined, true)).toBeNull();
  });
  it('sub-agent: hidden when equal to the main model', () => {
    expect(modelBadge('claude-opus-4-8', 'claude-opus-4-8', false)).toBeNull();
  });
  it('sub-agent: shown when it differs from the main model', () => {
    expect(modelBadge('claude-sonnet-4-5', 'claude-opus-4-8', false)).toBe('sonnet-4-5');
  });
  it('sub-agent: shown when the main has no reference model', () => {
    expect(modelBadge('claude-sonnet-4-5', undefined, false)).toBe('sonnet-4-5');
  });
  it('sub-agent: null without a model', () => {
    expect(modelBadge(undefined, 'claude-opus-4-8', false)).toBeNull();
  });
});

describe('contextLevel', () => {
  it('is ok below 60%', () => {
    expect(contextLevel(0)).toBe('ok');
    expect(contextLevel(0.59)).toBe('ok');
  });
  it('is warn from 60% up to (but not including) 85%', () => {
    expect(contextLevel(0.60)).toBe('warn');
    expect(contextLevel(0.84)).toBe('warn');
  });
  it('is danger at 85% and above', () => {
    expect(contextLevel(0.85)).toBe('danger');
    expect(contextLevel(1)).toBe('danger');
  });
  it('treats values above 1 as danger', () => {
    expect(contextLevel(1.5)).toBe('danger');
  });
});

describe('cacheLevel', () => {
  it('is good at 75% and above', () => {
    expect(cacheLevel(1)).toBe('good');
    expect(cacheLevel(0.75)).toBe('good');
  });
  it('is mid from 50% up to (but not including) 75%', () => {
    expect(cacheLevel(0.74)).toBe('mid');
    expect(cacheLevel(0.50)).toBe('mid');
  });
  it('is low below 50%', () => {
    expect(cacheLevel(0.49)).toBe('low');
    expect(cacheLevel(0)).toBe('low');
  });
});

describe('agentTotalTokens', () => {
  const byAgent: AgentUsage[] = [
    {
      agentId: 'a1', name: 'sub', isMain: false,
      models: [
        { model: 'claude-opus-4-8', input: 100, output: 50, cache: 1000 },
        { model: 'claude-haiku-4-5', input: 10, output: 5, cache: 0 },
      ],
    },
    { agentId: 'vazio', name: 'v', isMain: false, models: [] },
  ];

  it('sums input + output + cache across models', () => {
    expect(agentTotalTokens(byAgent, 'a1')).toBe(1165);
  });

  it('returns null for an agent without usage or unknown agent', () => {
    expect(agentTotalTokens(byAgent, 'vazio')).toBeNull();
    expect(agentTotalTokens(byAgent, 'nope')).toBeNull();
    expect(agentTotalTokens(undefined, 'a1')).toBeNull();
  });

  it('sums a single-model agent', () => {
    const one: AgentUsage[] = [{ agentId: 'x', name: 'x', isMain: false, models: [{ model: 'claude-haiku-4-5', input: 7, output: 3, cache: 90 }] }];
    expect(agentTotalTokens(one, 'x')).toBe(100);
  });
});

describe('agentTypeTone', () => {
  it('maps known types to their tone, case-insensitive', () => {
    expect(agentTypeTone('Explore')).toBe('explore');
    expect(agentTypeTone('Plan')).toBe('plan');
    expect(agentTypeTone('general-purpose')).toBe('general');
  });

  it('falls back to neutral for custom types', () => {
    expect(agentTypeTone('claude-code-guide')).toBe('neutral');
    expect(agentTypeTone('statusline-setup')).toBe('neutral');
  });

  it('maps empty string to neutral', () => {
    expect(agentTypeTone('')).toBe('neutral');
  });
});

describe('listStaleness', () => {
  const NOW = Date.parse('2026-07-16T12:00:00.000Z');
  const base = {
    isMain: true,
    todosUpdatedAt: NOW - 17 * 60_000,
    todos: [todo('completed'), todo('in_progress')],
  };

  it('returns the age when every condition holds', () => {
    expect(listStaleness(base, true, NOW)).toBe(17 * 60_000);
  });

  it('returns null below the 5-minute threshold', () => {
    expect(listStaleness({ ...base, todosUpdatedAt: NOW - 4 * 60_000 }, true, NOW)).toBeNull();
  });

  it('returns null without a running sub-agent', () => {
    expect(listStaleness(base, false, NOW)).toBeNull();
  });

  it('returns null for non-main agents', () => {
    expect(listStaleness({ ...base, isMain: false }, true, NOW)).toBeNull();
  });

  it('returns null without todosUpdatedAt', () => {
    expect(listStaleness({ ...base, todosUpdatedAt: undefined }, true, NOW)).toBeNull();
  });

  it('returns null when the list is empty or fully completed', () => {
    expect(listStaleness({ ...base, todos: [] }, true, NOW)).toBeNull();
    expect(listStaleness({ ...base, todos: [todo('completed')] }, true, NOW)).toBeNull();
  });
});
