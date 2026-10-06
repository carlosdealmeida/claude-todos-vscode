import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeLiveReader, engineAtLeast, lifecycleFromBridge } from '../../src/services/bridgeLive';
import { applyEvent, emptyFile, toText, type BridgeEvent, type BridgeFile } from '../../src/bridgeMod/state';

const SID = 'aaaa1111-2222-3333-4444-555566667777';
const T = 1_791_215_940_722;

function fileWith(sessionId: string, events: BridgeEvent[], engine = '2.1.289'): BridgeFile {
  let f = applyEvent(emptyFile(sessionId, T), { kind: 'engine', version: engine });
  for (const ev of events) f = applyEvent(f, ev);
  return f;
}

describe('BridgeLiveReader', () => {
  let claudeDir: string;
  let live: string;
  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-live-'));
    live = path.join(claudeDir, '.vscode-todos-bridge', 'live');
    fs.mkdirSync(live, { recursive: true });
  });
  afterEach(() => fs.rmSync(claudeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

  const write = (sessionId: string, text: string, mtime?: Date) => {
    const p = path.join(live, `${sessionId}.json`);
    fs.writeFileSync(p, text);
    if (mtime) fs.utimesSync(p, mtime, mtime);
  };

  it('returns undefined for a missing file or an unsafe id', () => {
    const r = new BridgeLiveReader(claudeDir);
    expect(r.forSession(SID)).toBeUndefined();
    expect(r.forSession('../evil')).toBeUndefined();
  });

  it('reads a valid file', () => {
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 5, reason: 'answer' }]), T + 6));
    expect(new BridgeLiveReader(claudeDir).forSession(SID)?.turn).toEqual({ state: 'idle', at: T + 5, reason: 'answer' });
  });

  // Review Focus 2
  it('keeps the last good reading while the file is half-written', () => {
    const r = new BridgeLiveReader(claudeDir);
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 5 }]), T + 6));
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
    write(SID, '{"schema":1,"sessionId":"aaaa');
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
  });

  it('ignores another schema and a file that names another session', () => {
    write(SID, JSON.stringify({ ...emptyFile(SID, T), schema: 2 }));
    expect(new BridgeLiveReader(claudeDir).forSession(SID)).toBeUndefined();
    write(SID, toText(emptyFile('bbbb', T), T));
    expect(new BridgeLiveReader(claudeDir).forSession(SID)).toBeUndefined();
  });

  it('rereads only when mtime or size change', () => {
    const r = new BridgeLiveReader(claudeDir);
    const stamp = new Date('2026-10-05T12:00:00Z');
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 5 }]), T), stamp);
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
    // mesmo tamanho e mesmo mtime: vale o cache
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 7 }]), T), stamp);
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 7 }]), T), new Date('2026-10-05T12:00:05Z'));
    expect(r.forSession(SID)?.turn?.at).toBe(T + 7);
  });

  it('latestRateLimits picks the most recent reading across files with limits', () => {
    const limits = (pct: number) => [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2026-10-05T20:40:00.000Z' }];
    write('s1', toText(fileWith('s1', [{ kind: 'usage', at: T + 1, usage: { context: { window: 1e6 }, rateLimits: limits(10) } }]), T));
    write('s2', toText(fileWith('s2', [{ kind: 'usage', at: T + 9, usage: { context: { window: 1e6 }, rateLimits: limits(40) } }]), T));
    write('s3', toText(fileWith('s3', [{ kind: 'usage', at: T + 20, usage: { context: { window: 1e6 }, rateLimits: [] } }]), T));
    expect(new BridgeLiveReader(claudeDir).latestRateLimits()).toEqual({ readAt: T + 9, limits: limits(40) });
  });

  it('latestRateLimits keeps its answer for a short TTL', () => {
    let now = 10_000;
    const r = new BridgeLiveReader(claudeDir, () => now);
    const limits = (pct: number) => [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2026-10-05T20:40:00.000Z' }];
    write('s1', toText(fileWith('s1', [{ kind: 'usage', at: T + 1, usage: { context: { window: 1e6 }, rateLimits: limits(10) } }]), T));
    expect(r.latestRateLimits()?.limits).toEqual(limits(10));
    write('s2', toText(fileWith('s2', [{ kind: 'usage', at: T + 9, usage: { context: { window: 1e6 }, rateLimits: limits(40) } }]), T));
    now += 1_000;
    expect(r.latestRateLimits()?.limits).toEqual(limits(10));
    now += 1_500;
    expect(r.latestRateLimits()?.limits).toEqual(limits(40));
  });

  it('latestRateLimits does not hold its answer when the clock goes backwards', () => {
    let now = 50_000;
    const r = new BridgeLiveReader(claudeDir, () => now);
    const limits = (pct: number) => [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2026-10-05T20:40:00.000Z' }];
    write('s1', toText(fileWith('s1', [{ kind: 'usage', at: T + 1, usage: { context: { window: 1e6 }, rateLimits: limits(10) } }]), T));
    expect(r.latestRateLimits()?.limits).toEqual(limits(10));
    write('s2', toText(fileWith('s2', [{ kind: 'usage', at: T + 9, usage: { context: { window: 1e6 }, rateLimits: limits(40) } }]), T));
    now = 10_000;
    expect(r.latestRateLimits()?.limits).toEqual(limits(40));
  });

  it('latestRateLimits is undefined without the folder', () => {
    fs.rmSync(live, { recursive: true, force: true });
    expect(new BridgeLiveReader(claudeDir).latestRateLimits()).toBeUndefined();
  });

  it('prune removes files older than the window and keeps the rest', () => {
    write('old1', toText(emptyFile('old1', T), T), new Date('2026-08-01T00:00:00Z'));
    write('new1', toText(emptyFile('new1', T), T), new Date('2026-10-05T00:00:00Z'));
    new BridgeLiveReader(claudeDir).prune(30 * 86_400_000, Date.parse('2026-10-06T00:00:00Z'));
    expect(fs.readdirSync(live).sort()).toEqual(['new1.json']);
  });
});

describe('lifecycleFromBridge', () => {
  const agents: BridgeEvent[] = [
    { kind: 'spawn', at: T + 1, agentId: 'ag1' },
    { kind: 'agentEnd', at: T + 2, agentId: 'ag2', reason: 'answer' },
  ];

  it('maps the agent ends to lifecycle entries on 2.1.289 or newer', () => {
    expect(lifecycleFromBridge(fileWith(SID, agents, '2.1.289'))).toEqual(new Map([['ag2', { state: 'stopped', at: T + 2 }]]));
  });

  it('ignores a start whose end may have been lost: it must not revive a finished agent', () => {
    expect(lifecycleFromBridge(fileWith(SID, [{ kind: 'spawn', at: T + 1, agentId: 'fg1' }]))).toEqual(new Map());
  });

  it('ignores the agents of an older engine, an unknown version or a missing file', () => {
    expect(lifecycleFromBridge(fileWith(SID, agents, '2.1.286'))).toBeUndefined();
    expect(lifecycleFromBridge({ ...fileWith(SID, agents), engineVersion: undefined })).toBeUndefined();
    expect(lifecycleFromBridge(undefined)).toBeUndefined();
  });
});

describe('engineAtLeast', () => {
  it('compares numerically, part by part', () => {
    expect(engineAtLeast('2.1.289', [2, 1, 289])).toBe(true);
    expect(engineAtLeast('2.1.300', [2, 1, 289])).toBe(true);
    expect(engineAtLeast('2.2.0', [2, 1, 289])).toBe(true);
    expect(engineAtLeast('2.1.29', [2, 1, 289])).toBe(false);
    expect(engineAtLeast('2.1.288-beta', [2, 1, 289])).toBe(false);
    expect(engineAtLeast('nope', [2, 1, 289])).toBe(false);
    expect(engineAtLeast(undefined, [2, 1, 289])).toBe(false);
  });
});
