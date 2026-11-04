import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { alignTaskClock } from '../../site/src/demo/alignTaskClock';
import { createPlayer } from '../../site/src/demo/player';
import type { DemoScript } from '../../site/src/demo/types';
import type { SessionSnapshot } from '../../src/types';

const DIR = path.join(__dirname, '..', '..', 'site', 'src', 'demo', 'scripts');
const load = (file: string): DemoScript => JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
const DAY = 24 * 3_600_000;

function taskStamps(snapshot: SessionSnapshot): number[] {
  return snapshot.agents.flatMap((a) => [
    ...(a.todosUpdatedAt !== undefined ? [a.todosUpdatedAt] : []),
    ...a.todos.flatMap((t) => [t.startedAt, t.completedAt].filter((v): v is number => v !== undefined)),
  ]);
}

function frame(atMs: number, startedAt: number, completedAt: number, updatedAt: number) {
  return {
    atMs,
    snapshot: {
      sessionId: 's', cwd: '/r', title: 't', pinned: false,
      agents: [{
        sessionId: 's', agentId: 'a', name: 'a', isMain: true, updatedAt,
        todos: [{ content: 'c', activeForm: 'c', status: 'completed' as const, startedAt, completedAt }],
      }],
    } as SessionSnapshot,
  };
}

// O visitante do site le esses numeros como duracao de uma sessao: "333h" entrega
// que o transcript gravado tinha 14 dias, e horario no futuro daria duracao negativa.
describe.each(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')))('relogio das tasks em %s', (file) => {
  it('nenhuma task e mais velha que algumas horas nem esta no futuro', () => {
    const script = load(file);
    for (const f of alignTaskClock(script.recordedAt, script.frames)) {
      const now = script.recordedAt + f.atMs;
      for (const stamp of taskStamps(f.snapshot)) {
        expect(now - stamp, `frame ${f.atMs}`).toBeLessThan(2 * 3_600_000);
        expect(now - stamp, `frame ${f.atMs}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('alignTaskClock', () => {
  const OLD = 1_000_000 - 14 * DAY;

  it('transcript antigo: a task mais nova do frame fica na hora do frame, com as duracoes intactas', () => {
    const [f] = alignTaskClock(1_000_000, [frame(5_000, OLD, OLD + 200, 999_000)]);
    const todo = f.snapshot.agents[0].todos[0];
    expect(todo.completedAt).toBe(1_005_000);
    expect(todo.completedAt! - todo.startedAt!).toBe(200);
  });

  it('nao mexe no updatedAt, que ja esta no relogio da gravacao', () => {
    const [f] = alignTaskClock(1_000_000, [frame(5_000, OLD, OLD + 200, 999_000)]);
    expect(f.snapshot.agents[0].updatedAt).toBe(999_000);
  });

  it('roteiro feito a mao, com task recente de proposito, continua igual', () => {
    const recent = frame(5_000, 1_000_000 - 50 * 60_000, 1_000_000 - 4 * 60_000, 999_000);
    expect(alignTaskClock(1_000_000, [recent])).toEqual([recent]);
  });

  it('frame sem task continua igual', () => {
    const empty = { atMs: 0, snapshot: { sessionId: 's', cwd: '/r', title: 't', pinned: false, agents: [] } as SessionSnapshot };
    expect(alignTaskClock(1_000_000, [empty])).toEqual([empty]);
  });
});

describe('player com transcript antigo', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(50 * DAY); });
  afterEach(() => { vi.useRealTimers(); });

  it('emite a task com a idade da demo, e nao a do transcript', () => {
    const recordedAt = 30 * DAY;
    const script: DemoScript = {
      id: 'x', recordedAt, durationMs: 10_000, markers: [],
      frames: [frame(0, recordedAt - 14 * DAY, recordedAt - 14 * DAY + 200, recordedAt)],
      projectUsage: { sessions: 0, byModel: [], byAgentType: [] },
    };
    const seen: SessionSnapshot[] = [];
    const player = createPlayer(script, { onSnapshot: (s) => seen.push(s) });
    vi.advanceTimersByTime(1_000);
    player.destroy();
    const todo = seen[seen.length - 1].agents[0].todos[0];
    expect(Date.now() - todo.completedAt!).toBeLessThan(5_000);
  });
});
