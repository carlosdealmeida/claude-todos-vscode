import { describe, it, expect, vi } from 'vitest';
import { SessionResolver } from '../../src/services/sessionResolver';
import type { BridgeFile } from '../../src/services/bridgeFile';

function fakeBridge(records: any[]): BridgeFile {
  return {
    readAll: () => records,
    latestForCwd: (cwd: string) => {
      const matches = records.filter(r => r.cwd === cwd);
      return matches.length ? matches.reduce((a, b) => a.startedAt > b.startedAt ? a : b) : null;
    },
    append: vi.fn(),
    prune: vi.fn(),
  } as unknown as BridgeFile;
}

describe('SessionResolver', () => {
  it('returns null when no workspace', () => {
    const resolver = new SessionResolver(fakeBridge([]), () => null);
    expect(resolver.resolve()).toBeNull();
  });

  it('returns latest sessionId for current cwd', () => {
    const bridge = fakeBridge([
      { cwd: '/proj', sessionId: 's-old', terminalPid: 1, startedAt: 1000 },
      { cwd: '/proj', sessionId: 's-new', terminalPid: 2, startedAt: 2000 },
    ]);
    const resolver = new SessionResolver(bridge, () => '/proj');
    expect(resolver.resolve()?.sessionId).toBe('s-new');
  });

  it('returns null when cwd has no record', () => {
    const resolver = new SessionResolver(fakeBridge([]), () => '/unknown');
    expect(resolver.resolve()).toBeNull();
  });
});
