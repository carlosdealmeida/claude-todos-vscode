import { describe, it, expect, vi } from 'vitest';
import { SnapshotService } from '../../src/services/snapshotService';
import type { PendingQuestion } from '../../src/types';

const usageStub = {
  usageForSession: () => ({ byModel: [], byAgent: [] }),
};

function makeParser(opts: {
  mtimes: Record<string, number | null>;
  titles?: Record<string, string | null>;
  awaitingInput?: 'question' | 'plan' | null;
  pendingQuestions?: PendingQuestion[];
}) {
  const agentsFor = (sessionId: string) => [
    { sessionId, agentId: sessionId, name: 'Main agent', isMain: true, todos: [], updatedAt: 0 },
  ];
  return {
    transcriptMtime: (sessionId: string, _cwd: string) => opts.mtimes[sessionId] ?? null,
    transcriptActivityAt: (sessionId: string, _cwd: string) => opts.mtimes[sessionId] ?? null,
    readSessionTitle: (sessionId: string, _cwd: string) => opts.titles?.[sessionId] ?? null,
    listForSession: (sessionId: string) => agentsFor(sessionId),
    listSessionDetail: (sessionId: string) => ({
      agents: agentsFor(sessionId),
      awaitingInput: opts.awaitingInput ?? null,
      pendingQuestions: opts.pendingQuestions ?? [],
    }),
  };
}

// Parser sem agentes com tasks (sessão que ainda não chamou TodoWrite/TaskCreate).
function makeParserNoAgents(mtimes: Record<string, number | null>) {
  return {
    transcriptMtime: (sessionId: string, _cwd: string) => mtimes[sessionId] ?? null,
    transcriptActivityAt: (sessionId: string, _cwd: string) => mtimes[sessionId] ?? null,
    readSessionTitle: (_sessionId: string, _cwd: string) => null,
    listForSession: (_sessionId: string) => [],
    listSessionDetail: (_sessionId: string) => ({ agents: [], awaitingInput: null, pendingQuestions: [] }),
  };
}

const newModelUsage = {
  usageForSession: () => ({
    byModel: [],
    byAgent: [{ agentId: 'a', name: 'Main agent', isMain: true, models: [], currentModel: 'claude-fable-5-1', currentVersion: '2.1.261' }],
  }),
};
const resolverA = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };

describe('SnapshotService', () => {
  it('returns null when no session has a transcript', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({ mtimes: { a: null } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.build()).toBeNull();
  });

  it('picks the session with the most recent transcript mtime', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'old', terminalPid: null, startedAt: 9 },
        { cwd: '/p', sessionId: 'new', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({ mtimes: { old: 1000, new: 5000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    const snap = svc.build()!;
    expect(snap.sessionId).toBe('new');
    expect(snap.pinned).toBe(false);
  });

  it('honors a pinned session that still has a transcript', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'new', terminalPid: null, startedAt: 1 },
        { cwd: '/p', sessionId: 'pinnedone', terminalPid: null, startedAt: 2 },
      ],
    };
    const parser = makeParser({ mtimes: { new: 5000, pinnedone: 1000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    svc.setPinnedSession('pinnedone');
    const snap = svc.build()!;
    expect(snap.sessionId).toBe('pinnedone');
    expect(snap.pinned).toBe(true);
  });

  it('falls back to auto when the pinned session has no transcript', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'new', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({ mtimes: { new: 5000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    svc.setPinnedSession('gone');
    const snap = svc.build()!;
    expect(snap.sessionId).toBe('new');
    expect(snap.pinned).toBe(false);
  });

  it('uses the ai-title, with a fallback when absent', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'wxyz5678aaaa', terminalPid: null, startedAt: 2 },
        { cwd: '/p', sessionId: 'abcd1234efgh', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({
      mtimes: { wxyz5678aaaa: 5000, abcd1234efgh: 4000 },
      titles: { wxyz5678aaaa: 'Minha sessão' },
    });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    const sessions = svc.listSessions();
    expect(sessions[0].title).toBe('Minha sessão');
    expect(sessions[1].title).toBe('Session · abcd1234');
  });

  it('listSessions is sorted by mtime descending', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'mid', terminalPid: null, startedAt: 1 },
        { cwd: '/p', sessionId: 'newest', terminalPid: null, startedAt: 1 },
        { cwd: '/p', sessionId: 'oldest', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({ mtimes: { mid: 2000, newest: 3000, oldest: 1000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.listSessions().map(s => s.sessionId)).toEqual(['newest', 'mid', 'oldest']);
  });

  it('computes usage even when there are no todos, synthesizing the main agent', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'sess', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = {
      transcriptMtime: () => 1000,
      transcriptActivityAt: () => 1000,
      readSessionTitle: () => null,
      listForSession: () => [], // no TodoWrite yet → no agents
      listSessionDetail: () => ({ agents: [], awaitingInput: null, pendingQuestions: [] }),
    };
    let receivedAgents: any[] | undefined;
    const usage = {
      usageForSession: (_s: string, _c: string, agents: any[]) => {
        receivedAgents = agents;
        return { byModel: [{ model: 'claude-opus-4-8', input: 1, output: 2, cache: 3 }], byAgent: [] };
      },
    };
    const svc = new SnapshotService(resolver as any, parser as any, usage as any);
    const snap = svc.build()!;

    // visible agents stay empty (UI shows the "awaiting tasks" state)
    expect(snap.agents).toEqual([]);
    // but usage still computed, from a synthesized main agent
    expect(snap.usage?.byModel[0].model).toBe('claude-opus-4-8');
    expect(receivedAgents).toEqual([
      expect.objectContaining({ agentId: 'sess', isMain: true }),
    ]);
  });

  it('activeCwd returns the cwd of the session that would be displayed', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/work/api', sessionId: 'api-1', terminalPid: null, startedAt: 1 },
        { cwd: '/work/web', sessionId: 'web-1', terminalPid: null, startedAt: 2 },
      ],
    };
    const parser = makeParser({ mtimes: { 'api-1': 1000, 'web-1': 5000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.activeCwd()).toBe('/work/web');
  });

  it('activeCwd honors the pinned session', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/work/api', sessionId: 'api-1', terminalPid: null, startedAt: 1 },
        { cwd: '/work/web', sessionId: 'web-1', terminalPid: null, startedAt: 2 },
      ],
    };
    const parser = makeParser({ mtimes: { 'api-1': 1000, 'web-1': 5000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    svc.setPinnedSession('api-1');
    expect(svc.activeCwd()).toBe('/work/api');
  });

  it('activeCwd returns null when there is no session', () => {
    const resolver = { resolveCandidates: () => [] };
    const parser = makeParser({ mtimes: {} });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.activeCwd()).toBeNull();
  });

  it('attaches usage from the usageParser', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({ mtimes: { a: 1000 } });
    const usage = {
      usageForSession: () => ({
        byModel: [{ model: 'claude-opus-4-8', input: 1, output: 2, cache: 3 }],
        byAgent: [],
      }),
    };
    const svc = new SnapshotService(resolver as any, parser as any, usage as any);
    const snap = svc.build()!;
    expect(snap.usage?.byModel[0].model).toBe('claude-opus-4-8');
  });

  it('exposes awaitingInput on the snapshot when the parser reports a pending wait', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({ mtimes: { a: 1000 }, awaitingInput: 'question' });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.build()!.awaitingInput).toBe('question');
  });

  it('omits awaitingInput when there is no pending wait', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
      ],
    };
    const parser = makeParser({ mtimes: { a: 1000 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect('awaitingInput' in svc.build()!).toBe(false);
  });

  it('propaga pendingQuestions quando ha pendencia', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({
      mtimes: { a: 10 },
      pendingQuestions: [{ kind: 'question', header: 'H', text: 'Q', line: 3 }],
    });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.build()?.pendingQuestions).toEqual([
      { kind: 'question', header: 'H', text: 'Q', line: 3 },
    ]);
  });

  it('omite pendingQuestions quando a lista e vazia', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { a: 10 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.build()).not.toHaveProperty('pendingQuestions');
  });

  const liveMap = (ids: Record<string, { name?: string; nameSource?: string }>) => () =>
    new Map(Object.entries(ids).map(([sessionId, extra]) => [
      sessionId, { pid: 1, sessionId, cwd: '/p', ...extra },
    ]));

  const namesStub = () => {
    const store: Record<string, string> = {};
    return {
      get: (id: string) => store[id],
      entries: () => ({ ...store }),
      remember: (id: string, name: string) => { store[id] = name; },
      prune: () => {},
    };
  };

  it('marca alive nas sessoes do registro vivo', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'morta', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, morta: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    const sessions = svc.listSessions();
    expect(sessions.find(s => s.sessionId === 'viva')?.alive).toBe(true);
    expect(sessions.find(s => s.sessionId === 'morta')?.alive).toBeUndefined();
  });

  it('listSessions mantem a ordem por mtime, sem promover vivas', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'morta', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, morta: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    expect(svc.listSessions().map(s => s.sessionId)).toEqual(['morta', 'viva']);
  });

  it('Auto prefere a sessao viva mesmo com mtime menor', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'morta', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, morta: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    expect(svc.build()?.sessionId).toBe('viva');
  });

  it('entre duas vivas, vence o maior mtime', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'b', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { a: 5, b: 9 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ a: {}, b: {} }), namesStub() as any);
    expect(svc.build()?.sessionId).toBe('b');
  });

  it('pin vence a preferencia por sessao viva', () => {
    const resolver = { resolveCandidates: () => [
      { cwd: '/p', sessionId: 'viva', terminalPid: null, startedAt: 1 },
      { cwd: '/p', sessionId: 'fixada', terminalPid: null, startedAt: 1 },
    ] };
    const parser = makeParser({ mtimes: { viva: 5, fixada: 1 } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ viva: {} }), namesStub() as any);
    svc.setPinnedSession('fixada');
    expect(svc.build()?.sessionId).toBe('fixada');
  });

  it('nome do usuario vence o aiTitle e e memorizado', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const names = namesStub();
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ s: { name: 'meu-nome', nameSource: 'user' } }), names as any);
    expect(svc.listSessions()[0].title).toBe('meu-nome');
    expect(names.get('s')).toBe('meu-nome');
  });

  it('nameSource derived e ignorado em favor do aiTitle', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ s: { name: 'proj-1c', nameSource: 'derived' } }), namesStub() as any);
    expect(svc.listSessions()[0].title).toBe('titulo derivado');
  });

  it('nome em cache sobrevive ao fim da sessao', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const names = namesStub();
    names.remember('s', 'nome-salvo');
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, () => new Map(), names as any);
    expect(svc.listSessions()[0].title).toBe('nome-salvo');
  });

  it('nome do usuario vivo vence um nome em cache diferente', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const names = namesStub();
    names.remember('s', 'nome-antigo-em-cache');
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any, liveMap({ s: { name: 'nome-vivo', nameSource: 'user' } }), names as any);
    expect(svc.listSessions()[0].title).toBe('nome-vivo');
  });

  it('usa o now injetado no construtor pro updatedAt gravado por remember (item 10)', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const remember = vi.fn();
    const names = { get: () => undefined, entries: () => ({}), remember, prune: () => {} };
    const svc = new SnapshotService(
      resolver as any, parser as any, usageStub as any,
      liveMap({ s: { name: 'nome-vivo', nameSource: 'user' } }), names as any,
      () => 424242,
    );
    svc.build();
    expect(remember).toHaveBeenCalledWith('s', 'nome-vivo', 424242);
  });

  it('sem now injetado, resolveTitle cai no relogio real (default)', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 } });
    const remember = vi.fn();
    const names = { get: () => undefined, entries: () => ({}), remember, prune: () => {} };
    const before = Date.now();
    const svc = new SnapshotService(
      resolver as any, parser as any, usageStub as any,
      liveMap({ s: { name: 'nome-vivo', nameSource: 'user' } }), names as any,
    );
    svc.build();
    const after = Date.now();
    const recordedNow = remember.mock.calls[0][2] as number;
    expect(recordedNow).toBeGreaterThanOrEqual(before);
    expect(recordedNow).toBeLessThanOrEqual(after);
  });

  it('sem registro vivo nem cache, o comportamento atual e preservado', () => {
    const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 's', terminalPid: null, startedAt: 1 }] };
    const parser = makeParser({ mtimes: { s: 5 }, titles: { s: 'titulo derivado' } });
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.listSessions()[0].title).toBe('titulo derivado');
    expect(svc.build()?.sessionId).toBe('s');
  });

  it('orders and picks sessions by conversation activity, not by file mtime (#87900)', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'bumped', terminalPid: null, startedAt: 1 },
        { cwd: '/p', sessionId: 'recent', terminalPid: null, startedAt: 2 },
      ],
    };
    const parser = {
      ...makeParser({ mtimes: { bumped: 9_000, recent: 5_000 } }),
      // metadado anexado depois empurrou o mtime de 'bumped'; a conversa e antiga
      transcriptActivityAt: (sessionId: string) => (sessionId === 'bumped' ? 1_000 : 5_000),
    };
    const svc = new SnapshotService(resolver as any, parser as any, usageStub as any);
    expect(svc.listSessions().map(s => s.sessionId)).toEqual(['recent', 'bumped']);
    expect(svc.listSessions()[0].updatedAt).toBe(5_000);
    expect(svc.build()!.sessionId).toBe('recent');
  });

  it('marks taskToolsOff when there are no task agents, the harness is >= 2.1.233, the model is new and the flag is absent', () => {
    const svc = new SnapshotService(
      resolverA as any, makeParserNoAgents({ a: 100 }) as any, newModelUsage as any,
      () => new Map(), undefined, () => 0, { read: () => 'absent' as const },
    );
    expect(svc.build()?.taskToolsOff).toBe(true);
  });

  it('does not mark taskToolsOff when the flag is on or explicitly off', () => {
    for (const state of ['on', 'off'] as const) {
      const svc = new SnapshotService(
        resolverA as any, makeParserNoAgents({ a: 100 }) as any, newModelUsage as any,
        () => new Map(), undefined, () => 0, { read: () => state },
      );
      expect(svc.build()?.taskToolsOff).toBeUndefined();
    }
  });

  it('does not mark taskToolsOff once the session has task agents', () => {
    const svc = new SnapshotService(
      resolverA as any, makeParser({ mtimes: { a: 100 } }) as any, newModelUsage as any,
      () => new Map(), undefined, () => 0, { read: () => 'absent' as const },
    );
    expect(svc.build()?.taskToolsOff).toBeUndefined();
  });

  it('does not mark taskToolsOff without a flag reader (hosts that do not inject one)', () => {
    const svc = new SnapshotService(resolverA as any, makeParserNoAgents({ a: 100 }) as any, newModelUsage as any);
    expect(svc.build()?.taskToolsOff).toBeUndefined();
  });
});
