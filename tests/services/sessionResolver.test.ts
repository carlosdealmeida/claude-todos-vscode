import { describe, it, expect, vi } from 'vitest';
import { SessionResolver } from '../../src/services/sessionResolver';
import type { BridgeFile } from '../../src/services/bridgeFile';

function fakeBridge(records: any[]): BridgeFile {
  return {
    readAll: () => records,
    allForCwd: (cwd: string) =>
      records.filter(r => r.cwd === cwd).sort((a, b) => b.startedAt - a.startedAt),
    append: vi.fn(),
    prune: vi.fn(),
  } as unknown as BridgeFile;
}

describe('SessionResolver', () => {
  it('returns empty when there is no workspace folder', () => {
    const resolver = new SessionResolver(fakeBridge([]), () => []);
    expect(resolver.resolveCandidates()).toEqual([]);
  });

  it('returns all records for a single cwd, most recent first', () => {
    const bridge = fakeBridge([
      { cwd: '/proj', sessionId: 'a', terminalPid: 1, startedAt: 1000 },
      { cwd: '/proj', sessionId: 'b', terminalPid: 2, startedAt: 3000 },
      { cwd: '/other', sessionId: 'd', terminalPid: 4, startedAt: 9000 },
    ]);
    const resolver = new SessionResolver(bridge, () => ['/proj']);
    expect(resolver.resolveCandidates().map(r => r.sessionId)).toEqual(['b', 'a']);
  });

  it('unions records across multiple cwds', () => {
    const bridge = fakeBridge([
      { cwd: '/work/api', sessionId: 'api-1', terminalPid: 1, startedAt: 1000 },
      { cwd: '/work/web', sessionId: 'web-1', terminalPid: 2, startedAt: 2000 },
      { cwd: '/elsewhere', sessionId: 'x', terminalPid: 3, startedAt: 9000 },
    ]);
    const resolver = new SessionResolver(bridge, () => ['/work/api', '/work/web']);
    const ids = resolver.resolveCandidates().map(r => r.sessionId);
    expect(ids).toContain('api-1');
    expect(ids).toContain('web-1');
    expect(ids).not.toContain('x');
    expect(ids).toHaveLength(2);
  });
});
