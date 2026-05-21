import { describe, it, expect, vi } from 'vitest';
import { SnapshotService } from '../../src/services/snapshotService';

describe('SnapshotService', () => {
  it('returns null when there are no candidates', () => {
    const resolver = { resolveCandidates: () => [] };
    const parser = { hasTranscript: vi.fn(), listForSession: vi.fn() };
    const svc = new SnapshotService(resolver as any, parser as any);
    expect(svc.build()).toBeNull();
    expect(parser.hasTranscript).not.toHaveBeenCalled();
  });

  it('picks the most recent candidate that has a transcript', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'ghost', terminalPid: 1, startedAt: 3000 },
        { cwd: '/p', sessionId: 'real', terminalPid: 2, startedAt: 2000 },
        { cwd: '/p', sessionId: 'older', terminalPid: 3, startedAt: 1000 },
      ],
    };
    const parser = {
      hasTranscript: (sessionId: string) => sessionId !== 'ghost',
      listForSession: (sessionId: string, cwd: string) =>
        [{ sessionId, agentId: sessionId, isMain: true, todos: [], updatedAt: 0 }],
    };
    const svc = new SnapshotService(resolver as any, parser as any);
    const snap = svc.build()!;
    expect(snap.sessionId).toBe('real');
    expect(snap.cwd).toBe('/p');
  });

  it('returns null when no candidate has a transcript', () => {
    const resolver = {
      resolveCandidates: () => [
        { cwd: '/p', sessionId: 'a', terminalPid: 1, startedAt: 2000 },
        { cwd: '/p', sessionId: 'b', terminalPid: 2, startedAt: 1000 },
      ],
    };
    const parser = {
      hasTranscript: () => false,
      listForSession: vi.fn(),
    };
    const svc = new SnapshotService(resolver as any, parser as any);
    expect(svc.build()).toBeNull();
    expect(parser.listForSession).not.toHaveBeenCalled();
  });
});
