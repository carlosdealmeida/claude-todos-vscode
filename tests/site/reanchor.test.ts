import { describe, it, expect } from 'vitest';
import { reanchor } from '../../site/src/demo/reanchor';
import type { SessionSnapshot } from '../../src/types';

function snap(): SessionSnapshot {
  return {
    sessionId: 's1',
    cwd: '/repo',
    title: 'demo',
    pinned: false,
    agents: [{
      sessionId: 's1',
      agentId: 's1',
      name: 'Main agent',
      isMain: true,
      updatedAt: 1000,
      todosUpdatedAt: 900,
      todos: [
        { content: 'a', status: 'completed', activeForm: 'Fazendo a', startedAt: 100, completedAt: 500 },
        { content: 'b', status: 'in_progress', activeForm: 'Fazendo b', startedAt: 600 },
        { content: 'c', status: 'pending', activeForm: 'Fazendo c' },
      ],
    }],
  };
}

describe('reanchor', () => {
  it('shifts every timestamp by delta', () => {
    const out = reanchor(snap(), 10_000);
    const agent = out.agents[0];
    expect(agent.updatedAt).toBe(11_000);
    expect(agent.todosUpdatedAt).toBe(10_900);
    expect(agent.todos[0].startedAt).toBe(10_100);
    expect(agent.todos[0].completedAt).toBe(10_500);
    expect(agent.todos[1].startedAt).toBe(10_600);
  });

  it('leaves absent timestamps absent', () => {
    const out = reanchor(snap(), 10_000);
    expect('startedAt' in out.agents[0].todos[2]).toBe(false);
    expect(out.agents[0].todos[2].status).toBe('pending');
  });

  it('does not mutate the input', () => {
    const input = snap();
    reanchor(input, 10_000);
    expect(input.agents[0].updatedAt).toBe(1000);
    expect(input.agents[0].todos[0].startedAt).toBe(100);
  });

  it('accepts a negative delta', () => {
    const out = reanchor(snap(), -100);
    expect(out.agents[0].todos[0].startedAt).toBe(0);
  });
});
