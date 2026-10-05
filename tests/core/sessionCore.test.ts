import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionCore } from '../../src/core/sessionCore';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

const CWD = '/home/user/proj';
const SID = 'core-sess-a';

function assistant(model: string): object {
  return { type: 'assistant', message: { model, role: 'assistant', usage: { input_tokens: 5, output_tokens: 1 } } };
}

describe('SessionCore', () => {
  let claudeDir: string;
  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
    vi.stubEnv('CLAUDE_CODE_ENABLE_TODO_TOOLS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  function writeSession(): void {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), JSON.stringify(assistant('claude-opus-4-8')));
    // registro do bridge para o resolver enxergar a sessão
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
  }

  function writeSessionOn(version: string, model: string): void {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), JSON.stringify({ ...assistant(model), version }));
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
  }

  function make(): SessionCore {
    return new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => 1_000_000 });
  }

  it('builds a snapshot for the active session', () => {
    writeSession();
    const snap = make().buildSnapshot();
    expect(snap?.sessionId).toBe(SID);
  });

  it('lists sessions and resolves the main transcript source', () => {
    writeSession();
    const core = make();
    expect(core.listSessions().map(s => s.sessionId)).toContain(SID);
    const src = core.resolveTodoSource(SID, SID, 3);
    expect(src?.filePath.endsWith(`${SID}.jsonl`)).toBe(true);
    expect(src?.line).toBe(3);
  });

  it('rejects an unsafe agentId in resolveTodoSource', () => {
    writeSession();
    expect(make().resolveTodoSource(SID, '../evil', 0)).toBeNull();
  });

  it('returns null snapshot title when there is no session', () => {
    expect(make().observeForNotifications()).toEqual({ kinds: [], awaitingInput: null, title: null });
  });

  it('getProjectUsage aggregates the active project', () => {
    writeSession();
    const usage = make().getProjectUsage();
    expect(usage?.byModel.some(m => m.model === 'claude-opus-4-8')).toBe(true);
  });

  it('hookStatus is false before install and true after installHook (idempotent)', () => {
    const core = make();
    const script = path.join(claudeDir, 'bridge-hook.js');
    expect(core.hookStatus(script)).toBe(false);

    core.installHook(script);
    expect(core.hookStatus(script)).toBe(true);

    core.installHook(script); // idempotente: não duplica
    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe(`node "${script}"`);
  });

  it('session activity follows the last conversation message, not metadata appended later (#87900)', () => {
    const T = Date.parse('2026-08-22T21:16:00.000Z');
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, `${SID}.jsonl`);
    fs.writeFileSync(file, JSON.stringify({ ...assistant('claude-opus-4-8'), timestamp: new Date(T).toISOString() }) + '\n');
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
    expect(make().listSessions()[0].updatedAt).toBe(T);
    // indexer/bridge anexam metadado sem timestamp e o mtime pula duas semanas
    fs.appendFileSync(file, JSON.stringify({ type: 'mode', mode: 'normal', sessionId: SID }) + '\n');
    const later = new Date(T + 14 * 86400_000);
    fs.utimesSync(file, later, later);
    expect(make().listSessions()[0].updatedAt).toBe(T);
  });

  it('enableTaskTools writes the env flag to <claudeDir>/settings.json and is idempotent', () => {
    const core = make();
    const first = core.enableTaskTools();
    expect(first).toEqual({ changed: true, path: path.join(claudeDir, 'settings.json') });
    expect(JSON.parse(fs.readFileSync(first.path, 'utf-8')))
      .toEqual({ env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } });
    expect(core.enableTaskTools().changed).toBe(false);
  });

  it('enableTaskTools preserves the hooks already in settings.json', () => {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [] }, model: 'opus' }));
    make().enableTaskTools();
    expect(JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8')))
      .toEqual({ hooks: { SessionStart: [] }, model: 'opus', env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } });
  });

  it('enableTaskTools throws on an invalid settings.json and leaves it untouched', () => {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{ broken');
    expect(() => make().enableTaskTools()).toThrow(/not valid JSON/);
    expect(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8')).toBe('{ broken');
  });

  it('snapshot marks taskToolsOff for a 2.1.233+ session on a new model, and clears it after enabling', () => {
    writeSessionOn('2.1.261', 'claude-fable-5-1');
    const core = make();
    expect(core.buildSnapshot()?.taskToolsOff).toBe(true);
    core.enableTaskTools();
    expect(core.buildSnapshot()?.taskToolsOff).toBeUndefined();
  });

  it('snapshot does not mark taskToolsOff before the cut or on a legacy model', () => {
    writeSessionOn('2.1.232', 'claude-fable-5-1');
    expect(make().buildSnapshot()?.taskToolsOff).toBeUndefined();
    writeSessionOn('2.1.261', 'claude-opus-4-7');
    expect(make().buildSnapshot()?.taskToolsOff).toBeUndefined();
  });

  it('keeps polling while a background sub-agent of a live session runs (R6)', () => {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    const subDir = path.join(projDir, SID, 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), [
      { type: 'assistant', timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'Agent', id: 'toolu_BG', input: { description: 'bg', prompt: 'p-bg', run_in_background: true } },
      ] } },
      { type: 'user', timestamp: '2026-10-01T10:00:01.000Z',
        toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'bg0001' },
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_BG', content: 'Async agent launched successfully.\nagentId: bg0001' }] } },
    ].map(l => JSON.stringify(l)).join('\n'));
    fs.writeFileSync(path.join(subDir, 'agent-bg0001.jsonl'),
      JSON.stringify({ type: 'user', isSidechain: true, agentId: 'bg0001', message: { role: 'user', content: 'p-bg' } }));
    fs.writeFileSync(path.join(subDir, 'agent-bg0001.meta.json'),
      JSON.stringify({ agentType: 'general-purpose', description: 'bg', toolUseId: 'toolu_BG', spawnDepth: 1 }));
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
    // registro vivo: o pid deste processo de teste está vivo
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: SID, cwd: CWD }));

    let now = 1_000_000;
    const core = new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now });
    expect(core.buildSnapshot()?.agents.find(a => a.agentId === 'bg0001')?.status).toBe('running');
    core.observeForNotifications();   // a primeira observação só inicializa
    now += 10 * 60_000;               // 10 min sem mensagem nova no main
    expect(core.observeForNotifications().kinds).toEqual([]);
    expect(core.shouldPollNotifications()).toBe(true);
  });
});
