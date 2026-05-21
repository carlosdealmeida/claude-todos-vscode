import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeFile } from '../../src/services/bridgeFile';

describe('BridgeFile', () => {
  let tmpDir: string;
  let bridgePath: string;
  let bridge: BridgeFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
    bridgePath = path.join(tmpDir, 'sessions.json');
    bridge = new BridgeFile(bridgePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty list when file does not exist', () => {
    expect(bridge.readAll()).toEqual([]);
  });

  it('appends a new record', () => {
    bridge.append({
      cwd: '/home/user/proj',
      sessionId: 'sess-1',
      terminalPid: 1234,
      startedAt: 1000,
    });
    expect(bridge.readAll()).toHaveLength(1);
    expect(bridge.readAll()[0].sessionId).toBe('sess-1');
  });

  it('returns most recent record for a cwd', () => {
    bridge.append({ cwd: '/p', sessionId: 'old', terminalPid: 1, startedAt: 1000 });
    bridge.append({ cwd: '/p', sessionId: 'new', terminalPid: 2, startedAt: 2000 });
    bridge.append({ cwd: '/q', sessionId: 'other', terminalPid: 3, startedAt: 3000 });
    expect(bridge.latestForCwd('/p')?.sessionId).toBe('new');
    expect(bridge.latestForCwd('/q')?.sessionId).toBe('other');
    expect(bridge.latestForCwd('/missing')).toBeNull();
  });

  it('prunes records older than max age', () => {
    const now = Date.now();
    bridge.append({ cwd: '/p', sessionId: 'old', terminalPid: 1, startedAt: now - 10 * 86400_000 });
    bridge.append({ cwd: '/p', sessionId: 'new', terminalPid: 2, startedAt: now });
    bridge.prune(7 * 86400_000);
    expect(bridge.readAll()).toHaveLength(1);
    expect(bridge.readAll()[0].sessionId).toBe('new');
  });

  it('handles corrupt file by treating as empty', () => {
    fs.writeFileSync(bridgePath, 'not json{{{');
    expect(bridge.readAll()).toEqual([]);
  });

  it('matches cwd case-insensitively on win32', () => {
    if (process.platform !== 'win32') return;
    bridge.append({ cwd: 'c:\\foo\\bar', sessionId: 's1', terminalPid: 1, startedAt: 1000 });
    expect(bridge.latestForCwd('C:\\foo\\bar')?.sessionId).toBe('s1');
    expect(bridge.latestForCwd('c:\\FOO\\BAR')?.sessionId).toBe('s1');
  });
});
