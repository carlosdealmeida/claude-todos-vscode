import { describe, it, expect } from 'vitest';
import { SnapshotService } from '../../src/services/snapshotService';

const usageStub = {
  usageForSession: () => ({ byModel: [], byAgent: [] }),
};

function makeParser(opts: {
  mtimes: Record<string, number | null>;
  titles?: Record<string, string | null>;
}) {
  return {
    transcriptMtime: (sessionId: string, _cwd: string) => opts.mtimes[sessionId] ?? null,
    readSessionTitle: (sessionId: string, _cwd: string) => opts.titles?.[sessionId] ?? null,
    listForSession: (sessionId: string) => [
      { sessionId, agentId: sessionId, name: 'Main agent', isMain: true, todos: [], updatedAt: 0 },
    ],
  };
}

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
      readSessionTitle: () => null,
      listForSession: () => [], // no TodoWrite yet → no agents
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
});
