import { describe, it, expect } from 'vitest';
import {
  applyEvent, emptyFile, liveDirFor, normalizeUsage, parseBridgeFile, restoreFile,
  sessionFilePath, toText, MAX_AGENTS,
} from '../../src/bridgeMod/state';

const SID = '5b69f6bc-5943-44c9-9385-753cc2b5fd2c';
const T = 1_791_215_940_722;

// O retorno real de $.session.usage() no spike de 2026-10-05 (Claude Code 2.1.289).
const REAL_USAGE = {
  startedAt: 1_791_077_671_828,
  context: { tokens: 137_849, window: 1_000_000, percent: 14 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-05T20:40:00.000Z' },
    { kind: 'seven_day', percentUsed: 2, resetsAt: '2026-10-12T12:00:00.000Z' },
  ],
  cost: { usd: 79.56 },
};

describe('applyEvent', () => {
  it('a spawn registers the agent as running with what the hook knows', () => {
    const f = applyEvent(emptyFile(SID, T), {
      kind: 'spawn', at: T + 1, agentId: 'a8a7e239c5bda24cb', type: 'Explore',
      description: 'spike', background: true, model: 'claude-haiku-4-5-20251001',
    });
    expect(f.agents['a8a7e239c5bda24cb']).toEqual({
      state: 'running', at: T + 1, type: 'Explore', description: 'spike', background: true,
      model: 'claude-haiku-4-5-20251001',
    });
  });

  it("an agent's turn end stops it and keeps what the spawn recorded", () => {
    let f = applyEvent(emptyFile(SID, T), { kind: 'spawn', at: T + 1, agentId: 'ag1', type: 'Explore' });
    f = applyEvent(f, { kind: 'agentEnd', at: T + 9, agentId: 'ag1', reason: 'answer' });
    expect(f.agents.ag1).toEqual({ state: 'stopped', at: T + 9, type: 'Explore', reason: 'answer' });
  });

  it('an agent born before the mod loaded gets its entry at the end', () => {
    const f = applyEvent(emptyFile(SID, T), { kind: 'agentEnd', at: T + 9, agentId: 'old1', reason: 'answer' });
    expect(f.agents.old1).toEqual({ state: 'stopped', at: T + 9, reason: 'answer' });
  });

  it('a new spawn of a stopped agent clears the old end reason', () => {
    let f = applyEvent(emptyFile(SID, T), { kind: 'agentEnd', at: T + 1, agentId: 'ag1', reason: 'aborted' });
    f = applyEvent(f, { kind: 'spawn', at: T + 2, agentId: 'ag1' });
    expect(f.agents.ag1).toEqual({ state: 'running', at: T + 2 });
  });

  it('the main turn end marks the turn idle; the session end marks it ended', () => {
    let f = applyEvent(emptyFile(SID, T), { kind: 'mainTurnEnd', at: T + 5, reason: 'answer' });
    expect(f.turn).toEqual({ state: 'idle', at: T + 5, reason: 'answer' });
    f = applyEvent(f, { kind: 'sessionEnd', at: T + 6, reason: 'clear' });
    expect(f.turn).toEqual({ state: 'ended', at: T + 6, reason: 'clear' });
  });

  it('a usage reading keeps context and rate limits and drops the cost', () => {
    const f = applyEvent(emptyFile(SID, T), { kind: 'usage', at: T + 3, usage: REAL_USAGE });
    expect(f.usage).toEqual({
      at: T + 3,
      context: { tokens: 137_849, window: 1_000_000, percent: 14 },
      rateLimits: REAL_USAGE.rateLimits,
    });
    expect(JSON.stringify(f)).not.toContain('usd');
  });

  it('a usage call that returned garbage leaves the previous reading alone', () => {
    const f1 = applyEvent(emptyFile(SID, T), { kind: 'usage', at: T + 3, usage: REAL_USAGE });
    const f2 = applyEvent(f1, { kind: 'usage', at: T + 4, usage: 'nope' });
    expect(f2.usage).toEqual(f1.usage);
  });

  it('records the engine version', () => {
    expect(applyEvent(emptyFile(SID, T), { kind: 'engine', version: '2.1.289' }).engineVersion).toBe('2.1.289');
  });

  it('does not mutate the previous state', () => {
    const before = emptyFile(SID, T);
    applyEvent(before, { kind: 'spawn', at: T, agentId: 'ag1' });
    expect(before.agents).toEqual({});
  });

  it(`keeps at most ${MAX_AGENTS} agents, the ones with the most recent event`, () => {
    let f = emptyFile(SID, T);
    for (let i = 0; i < MAX_AGENTS + 3; i++) f = applyEvent(f, { kind: 'spawn', at: T + i, agentId: `ag${i}` });
    expect(Object.keys(f.agents)).toHaveLength(MAX_AGENTS);
    expect(f.agents.ag0).toBeUndefined();
    expect(f.agents.ag2).toBeUndefined();
    expect(f.agents.ag3).toBeDefined();
    expect(f.agents[`ag${MAX_AGENTS + 2}`]).toBeDefined();
  });
});

describe('normalizeUsage', () => {
  it('drops malformed rate limits and a context without a window', () => {
    expect(normalizeUsage({
      context: { tokens: 10 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: '2', resetsAt: 'x' },
        { kind: 'seven_day', percentUsed: 5, resetsAt: '2026-10-12T12:00:00.000Z' },
      ],
    }, T)).toEqual({ at: T, rateLimits: [{ kind: 'seven_day', percentUsed: 5, resetsAt: '2026-10-12T12:00:00.000Z' }] });
  });

  it('returns undefined for a non-object', () => {
    expect(normalizeUsage(null, T)).toBeUndefined();
  });
});

describe('restoreFile', () => {
  it('restores the state written for the same session', () => {
    const written = applyEvent(emptyFile(SID, T), { kind: 'spawn', at: T + 1, agentId: 'ag1' });
    expect(restoreFile(toText(written, T + 2), SID, T + 3)).toEqual({ ...written, writtenAt: T + 2 });
  });

  it('starts empty for a missing file, a half-written file, another schema or another session', () => {
    const empty = emptyFile(SID, T + 3);
    expect(restoreFile(undefined, SID, T + 3)).toEqual(empty);
    expect(restoreFile('{"schema":1,"sessi', SID, T + 3)).toEqual(empty);
    expect(restoreFile(JSON.stringify({ ...emptyFile(SID, T), schema: 2 }), SID, T + 3)).toEqual(empty);
    expect(restoreFile(toText(emptyFile('other-session', T), T), SID, T + 3)).toEqual(empty);
  });
});

describe('parseBridgeFile', () => {
  it('drops invalid agents and keeps the valid ones', () => {
    const parsed = parseBridgeFile({
      schema: 1, sessionId: SID, writtenAt: T,
      agents: { ok: { state: 'stopped', at: T }, bad: { state: 'zombie', at: T }, '../x': { state: 'running', at: T } },
    });
    expect(parsed?.agents).toEqual({ ok: { state: 'stopped', at: T } });
  });

  it('rejects an unsafe session id', () => {
    expect(parseBridgeFile({ schema: 1, sessionId: '../etc', writtenAt: T, agents: {} })).toBeNull();
  });
});

describe('liveDirFor', () => {
  it('writes next to the mod folder the extension installed (Windows)', () => {
    expect(liveDirFor('C:\\Users\\carlo\\.claude\\.vscode-todos-bridge\\mod\\claude-todos-bridge', {}))
      .toBe('C:\\Users\\carlo\\.claude\\.vscode-todos-bridge\\live');
  });

  it('writes next to the mod folder the extension installed (POSIX, trailing slash)', () => {
    expect(liveDirFor('/home/u/.claude/.vscode-todos-bridge/mod/claude-todos-bridge/', {}))
      .toBe('/home/u/.claude/.vscode-todos-bridge/live');
  });

  it('falls back to CLAUDE_CONFIG_DIR, then USERPROFILE, then HOME', () => {
    const root = '/repo/dist/mod/claude-todos-bridge';
    expect(liveDirFor(root, { claudeConfigDir: '/cfg', userProfile: '/up', home: '/h' }))
      .toBe('/cfg/.vscode-todos-bridge/live');
    expect(liveDirFor(root, { userProfile: '/up', home: '/h' })).toBe('/up/.claude/.vscode-todos-bridge/live');
    expect(liveDirFor(root, { home: '/h/' })).toBe('/h/.claude/.vscode-todos-bridge/live');
  });

  it('returns null when nothing is known', () => {
    expect(liveDirFor('/repo/dist/mod/claude-todos-bridge', {})).toBeNull();
    expect(liveDirFor('/repo/dist/mod/claude-todos-bridge', { home: '' })).toBeNull();
  });
});

describe('sessionFilePath', () => {
  it('builds the per-session path with the separator of the folder', () => {
    expect(sessionFilePath('C:\\c\\.vscode-todos-bridge\\live', SID)).toBe(`C:\\c\\.vscode-todos-bridge\\live\\${SID}.json`);
    expect(sessionFilePath('/c/.vscode-todos-bridge/live', SID)).toBe(`/c/.vscode-todos-bridge/live/${SID}.json`);
  });

  it('refuses an unsafe session id', () => {
    expect(sessionFilePath('/c/live', '../../evil')).toBeNull();
  });
});
