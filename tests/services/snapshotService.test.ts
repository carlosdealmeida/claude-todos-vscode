import { describe, it, expect, vi } from 'vitest';
import { SnapshotService } from '../../src/services/snapshotService';

describe('SnapshotService', () => {
  it('returns null snapshot when no session resolved', () => {
    const resolver = { resolve: () => null };
    const parser = { listForSession: vi.fn() };
    const svc = new SnapshotService(resolver as any, parser as any);
    expect(svc.build()).toBeNull();
    expect(parser.listForSession).not.toHaveBeenCalled();
  });

  it('builds snapshot from session and agents', () => {
    const resolver = {
      resolve: () => ({ cwd: '/p', sessionId: 's1', terminalPid: 1, startedAt: 0 }),
    };
    const parser = {
      listForSession: () => [
        { sessionId: 's1', agentId: 's1', isMain: true, todos: [], updatedAt: 0 },
      ],
    };
    const svc = new SnapshotService(resolver as any, parser as any);
    const snap = svc.build()!;
    expect(snap.sessionId).toBe('s1');
    expect(snap.cwd).toBe('/p');
    expect(snap.agents).toHaveLength(1);
  });
});
