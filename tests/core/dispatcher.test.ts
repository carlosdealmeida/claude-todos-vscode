import { describe, it, expect, vi } from 'vitest';
import { createDispatcher, type CoreEvent } from '../../src/core/dispatcher';

function fakeCore(over: Partial<Record<string, any>> = {}) {
  return {
    pruneBridge: vi.fn(), setPinnedSession: vi.fn(), dispose: vi.fn(),
    buildSnapshot: () => ({ sessionId: 's', cwd: '/p', title: 'T', pinned: false, agents: [] }),
    listSessions: () => [{ sessionId: 's', cwd: '/p', title: 'T', updatedAt: 1 }],
    activeCwd: () => '/p',
    getProjectUsage: () => ({ sessions: 1, byModel: [], byAgentType: [] }),
    resolveTodoSource: (_s: string, a: string) => a === 's' ? { filePath: '/p/s.jsonl', line: 2 } : null,
    onChange: (_l: () => void) => ({ dispose: vi.fn() }),
    observeForNotifications: () => ({ kinds: [], awaitingInput: null, title: 'T' }),
    shouldPollNotifications: () => false,
    ...over,
  } as any;
}

function run(cmds: any[], core = fakeCore()) {
  const events: CoreEvent[] = [];
  const dispatch = createDispatcher((e) => events.push(e), () => core);
  for (const c of cmds) dispatch(c);
  return events;
}

describe('createDispatcher', () => {
  it('errors when a command arrives before init', () => {
    expect(run([{ cmd: 'getSnapshot' }])).toEqual([{ ev: 'error', message: 'not initialized' }]);
  });

  it('getSnapshot emits the snapshot after init', () => {
    const events = run([{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }, { cmd: 'getSnapshot' }]);
    expect(events).toEqual([{ ev: 'snapshot', snapshot: { sessionId: 's', cwd: '/p', title: 'T', pinned: false, agents: [] } }]);
  });

  it('resolveTodoSource emits todoSource (or null filePath when unresolved)', () => {
    const base = [{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }];
    expect(run([...base, { cmd: 'resolveTodoSource', sessionId: 's', agentId: 's', line: 2 }]).at(-1))
      .toEqual({ ev: 'todoSource', filePath: '/p/s.jsonl', line: 2 });
    expect(run([...base, { cmd: 'resolveTodoSource', sessionId: 's', agentId: 'x', line: 0 }]).at(-1))
      .toEqual({ ev: 'todoSource', filePath: null });
  });

  it('listSessions and getProjectUsage emit their events', () => {
    const base = [{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }];
    expect(run([...base, { cmd: 'listSessions' }]).at(-1)).toEqual({ ev: 'sessions', sessions: [{ sessionId: 's', cwd: '/p', title: 'T', updatedAt: 1 }] });
    expect(run([...base, { cmd: 'getProjectUsage' }]).at(-1)).toEqual({ ev: 'projectUsage', usage: { sessions: 1, byModel: [], byAgentType: [] } });
  });

  it('watch:true wires onChange to emit snapshots', () => {
    let fire: (() => void) | null = null;
    const core = fakeCore({ onChange: (l: () => void) => { fire = l; return { dispose: vi.fn() }; } });
    const events: CoreEvent[] = [];
    const dispatch = createDispatcher((e) => events.push(e), () => core);
    dispatch({ cmd: 'init', claudeDir: '/c', cwds: ['/p'] });
    dispatch({ cmd: 'watch', on: true });
    fire!();
    expect(events.at(-1)).toEqual({ ev: 'snapshot', snapshot: { sessionId: 's', cwd: '/p', title: 'T', pinned: false, agents: [] } });
  });

  it('unknown command emits an error', () => {
    const events = run([{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }, { cmd: 'nope' } as any]);
    expect(events.at(-1)).toEqual({ ev: 'error', message: 'unknown command: nope' });
  });
});
