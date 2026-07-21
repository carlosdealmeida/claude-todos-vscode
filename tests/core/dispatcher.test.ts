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

  it('watch:true twice does not stack duplicate listeners', () => {
    let registrations = 0;
    let fire: (() => void) | null = null;
    const core = fakeCore({ onChange: (l: () => void) => { registrations++; fire = l; return { dispose: vi.fn() }; } });
    const events: CoreEvent[] = [];
    const dispatch = createDispatcher((e) => events.push(e), () => core);
    dispatch({ cmd: 'init', claudeDir: '/c', cwds: ['/p'] });
    dispatch({ cmd: 'watch', on: true });
    dispatch({ cmd: 'watch', on: true });
    expect(registrations).toBe(1);
    fire!();
    expect(events.filter(e => e.ev === 'snapshot')).toHaveLength(1);
  });

  it('watch:false disposes the subscription and re-watch works', () => {
    const dispose = vi.fn();
    let fire: (() => void) | null = null;
    const core = fakeCore({ onChange: (l: () => void) => { fire = l; return { dispose }; } });
    const events: CoreEvent[] = [];
    const dispatch = createDispatcher((e) => events.push(e), () => core);
    dispatch({ cmd: 'init', claudeDir: '/c', cwds: ['/p'] });
    dispatch({ cmd: 'watch', on: true });
    dispatch({ cmd: 'watch', on: false });
    expect(dispose).toHaveBeenCalledTimes(1);
    dispatch({ cmd: 'watch', on: true }); // re-watch após desligar volta a funcionar
    fire!();
    expect(events.filter(e => e.ev === 'snapshot')).toHaveLength(1);
  });

  it('re-init disposes the previous core and its watch subscription', () => {
    const coreDispose = vi.fn();
    const subDispose = vi.fn();
    const core1 = fakeCore({ dispose: coreDispose, onChange: () => ({ dispose: subDispose }) });
    const core2 = fakeCore();
    const cores = [core1, core2];
    const dispatch = createDispatcher(() => {}, () => cores.shift()!);
    dispatch({ cmd: 'init', claudeDir: '/c', cwds: ['/p'] });
    dispatch({ cmd: 'watch', on: true });
    dispatch({ cmd: 'init', claudeDir: '/c', cwds: ['/q'] });
    expect(subDispose).toHaveBeenCalledTimes(1);
    expect(coreDispose).toHaveBeenCalledTimes(1);
  });
});

describe('correlation id', () => {
  const init = { cmd: 'init', claudeDir: '/c', cwds: ['/p'] };

  it('echoes the id on the direct response', () => {
    const events = run([init, { cmd: 'getSnapshot', id: 'r1' }]);
    expect(events.at(-1)).toMatchObject({ ev: 'snapshot', id: 'r1' });
  });

  it('omits the id when the command has none (retrocompat)', () => {
    const events = run([init, { cmd: 'getSnapshot' }]);
    expect(events.at(-1)).not.toHaveProperty('id');
  });

  it('watch pushes never carry an id', () => {
    let fire: (() => void) | null = null;
    const core = fakeCore({ onChange: (l: () => void) => { fire = l; return { dispose: vi.fn() }; } });
    const events: CoreEvent[] = [];
    const dispatch = createDispatcher((e) => events.push(e), () => core);
    dispatch(init as any);
    dispatch({ cmd: 'watch', on: true, id: 'w1' } as any);
    fire!();
    expect(events.at(-1)).toMatchObject({ ev: 'snapshot' });
    expect(events.at(-1)).not.toHaveProperty('id');
  });

  it('echoes the id on error events too', () => {
    expect(run([{ cmd: 'getSnapshot', id: 'e1' }]).at(-1))
      .toEqual({ ev: 'error', message: 'not initialized', id: 'e1' });
    expect(run([init, { cmd: 'nope', id: 'e2' } as any]).at(-1))
      .toEqual({ ev: 'error', message: 'unknown command: nope', id: 'e2' });
  });

  it('echoes the id on sessions, projectUsage and todoSource', () => {
    expect(run([init, { cmd: 'listSessions', id: 'a' }]).at(-1)).toMatchObject({ ev: 'sessions', id: 'a' });
    expect(run([init, { cmd: 'getProjectUsage', id: 'b' }]).at(-1)).toMatchObject({ ev: 'projectUsage', id: 'b' });
    expect(run([init, { cmd: 'resolveTodoSource', sessionId: 's', agentId: 's', line: 2, id: 'c' }]).at(-1))
      .toMatchObject({ ev: 'todoSource', id: 'c' });
  });
});
