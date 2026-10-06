import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionCore } from '../../src/core/sessionCore';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';
import { applyEvent, emptyFile, toText } from '../../src/bridgeMod/state';

const CWD = '/home/user/proj';
const SID = 'core-sess-a';

function assistant(model: string): object {
  return { type: 'assistant', message: { model, role: 'assistant', usage: { input_tokens: 5, output_tokens: 1 } } };
}

describe('SessionCore', () => {
  let claudeDir: string;
  // Cada SessionCore abre quatro fs.watch (projects/, .vscode-todos-bridge/, live/ e
  // sessions/): sem dispose() os handles seguem abertos e, no Windows, podem travar o rmSync.
  const cores: SessionCore[] = [];
  const track = (core: SessionCore): SessionCore => { cores.push(core); return core; };
  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
    vi.stubEnv('CLAUDE_CODE_ENABLE_TODO_TOOLS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const core of cores.splice(0)) core.dispose();
    fs.rmSync(claudeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
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
    return track(new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => 1_000_000 }));
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

  // Sessão viva com um agente lançado em background às 10:00:01 e sem notificação.
  // `startedAt` é o início do processo vivo, como no registro real.
  function writeLiveBackgroundSession(startedAt: number): void {
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
      JSON.stringify({ pid: process.pid, sessionId: SID, cwd: CWD, startedAt }));
  }

  it('keeps polling while a background sub-agent of a live session runs (R6)', () => {
    writeLiveBackgroundSession(Date.parse('2026-10-01T09:59:00.000Z')); // processo vivo desde antes do lançamento
    let now = 1_000_000;
    const core = track(new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now }));
    expect(core.buildSnapshot()?.agents.find(a => a.agentId === 'bg0001')?.status).toBe('running');
    core.observeForNotifications();   // a primeira observação só inicializa
    now += 10 * 60_000;               // 10 min sem mensagem nova no main
    expect(core.observeForNotifications().kinds).toEqual([]);
    expect(core.shouldPollNotifications()).toBe(true);
  });

  // Revisão final, Critical 1: a sessão foi retomada num processo novo; o agente
  // do processo anterior morreu com ele e não pode segurar o toast de ociosa.
  it('a session resumed in a new process does not keep an old background agent running (R6)', () => {
    writeLiveBackgroundSession(Date.parse('2026-10-02T08:00:00.000Z')); // processo atual começou depois
    let now = 1_000_000;
    const core = track(new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now }));
    expect(core.buildSnapshot()?.agents.find(a => a.agentId === 'bg0001')?.status).toBe('completed');
    core.observeForNotifications();
    now += 10 * 60_000;
    core.observeForNotifications();
    expect(core.shouldPollNotifications()).toBe(false);
  });

  // Ponte de dados (item 25)
  function writeBridgeFile(file: object): void {
    const live = path.join(claudeDir, '.vscode-todos-bridge', 'live');
    fs.mkdirSync(live, { recursive: true });
    fs.writeFileSync(path.join(live, `${SID}.json`), JSON.stringify(file));
  }

  function writeLiveRegistry(startedAt: number): void {
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: SID, cwd: CWD, startedAt }));
  }

  function writeMainWithMessagesAt(times: number[]): void {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), times.map(t =>
      JSON.stringify({ ...assistant('claude-opus-4-8'), timestamp: new Date(t).toISOString() })).join('\n') + '\n');
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
  }

  // Rajada de 60 s de atividade no main, observada pelo core.
  function burstThroughCore(T: number, setNow: (v: number) => void, core: SessionCore): void {
    setNow(T);
    writeMainWithMessagesAt([T]);
    core.observeForNotifications();                       // inicializa
    for (const dt of [30_000, 60_000]) {
      setNow(T + dt);
      writeMainWithMessagesAt([T, T + dt]);
      expect(core.observeForNotifications().kinds).toEqual([]);
    }
  }

  it('a turn end reported by the bridge fires the idle toast without the 45 s wait (item 25)', () => {
    const T = Date.parse('2026-10-05T10:00:00.000Z');
    writeLiveRegistry(T - 60_000);
    let now = T;
    const core = track(new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now }));
    burstThroughCore(T, v => { now = v; }, core);
    now = T + 61_000;
    writeBridgeFile({ schema: 1, sessionId: SID, engineVersion: '2.1.289', writtenAt: now, agents: {},
      turn: { state: 'idle', at: T + 60_500, reason: 'answer' } });
    expect(core.observeForNotifications().kinds).toEqual(['idle']);
  });

  // Review Focus 3
  it('ignores a turn end written before the live process started (item 25)', () => {
    const T = Date.parse('2026-10-05T10:00:00.000Z');
    writeLiveRegistry(T + 60_800);
    let now = T;
    const core = track(new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now }));
    burstThroughCore(T, v => { now = v; }, core);
    now = T + 61_000;
    writeBridgeFile({ schema: 1, sessionId: SID, engineVersion: '2.1.289', writtenAt: now, agents: {},
      turn: { state: 'idle', at: T + 60_500, reason: 'answer' } });
    expect(core.observeForNotifications().kinds).toEqual([]);
  });

  it('installs and uninstalls the bridge mod through settings.json (item 25)', () => {
    writeSession();
    const core = make();
    expect(core.buildSnapshot()?.bridge).toBe('off');
    expect(core.installBridgeMod()).toEqual({ changed: true, path: path.join(claudeDir, 'settings.json') });
    const modDir = path.join(claudeDir, '.vscode-todos-bridge', 'mod', 'claude-todos-bridge');
    expect(fs.existsSync(path.join(modDir, 'hooks', 'register.ts'))).toBe(true);
    expect(core.buildSnapshot()?.bridge).toBe('next-session');
    writeBridgeFile({ schema: 1, sessionId: SID, writtenAt: 1, agents: {} });
    expect(core.buildSnapshot()?.bridge).toBe('active');
    expect(core.uninstallBridgeMod().changed).toBe(true);
    expect(core.buildSnapshot()?.bridge).toBe('off');
    expect(JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'))).toEqual({});
  });

  it('pruneBridge also removes bridge files older than the window (item 25)', () => {
    writeBridgeFile({ schema: 1, sessionId: SID, writtenAt: 1, agents: {} });
    const file = path.join(claudeDir, '.vscode-todos-bridge', 'live', `${SID}.json`);
    const old = new Date('2026-09-01T00:00:00Z');
    fs.utimesSync(file, old, old);
    const core = track(new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => Date.parse('2026-10-06T00:00:00Z') }));
    core.pruneBridge(30 * 24 * 3600 * 1000);
    expect(fs.existsSync(file)).toBe(false);
  });

  // O cenário real: o transcript e a gravação do mod chegam como dois eventos do
  // watcher, e o snapshot do primeiro enche o memo dos limites. Com o relógio fixo o
  // memo nunca expira, então só o descarte a cada evento deixa o segundo ver 40%.
  it('a usage write from the mod reaches the next snapshot inside the memo window (item 25)', async () => {
    writeSession();
    const core = make();
    core.installBridgeMod(); // os limites só entram no snapshot com o mod instalado
    // live/ já existe: o construtor do TodosWatcher a cria
    const file = path.join(claudeDir, '.vscode-todos-bridge', 'live', `${SID}.json`);
    const writeModUsage = (at: number, pct: number, mtime: string) => {
      const limits = [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2099-01-01T00:00:00.000Z' }];
      let f = applyEvent(emptyFile(SID, at), { kind: 'engine', version: '2.1.289' });
      f = applyEvent(f, { kind: 'usage', at, usage: { context: { window: 1e6 }, rateLimits: limits } });
      fs.writeFileSync(file, toText(f, at));
      // as duas versões têm o mesmo tamanho: sem mtime novo o leitor serviria o cache
      fs.utimesSync(file, new Date(mtime), new Date(mtime));
    };
    const percent = () => core.buildSnapshot()?.usage?.rateLimits?.limits[0]?.percentUsed;

    writeModUsage(10, 10, '2026-10-06T12:00:00Z');
    expect(percent()).toBe(10); // enche o memo dos limites
    // como os hosts reais: o ouvinte entra depois do core
    let seen: number | undefined;
    core.onChange(() => { seen = percent(); });

    writeModUsage(20, 40, '2026-10-06T12:00:05Z');
    await vi.waitFor(() => { expect(seen).toBe(40); }, { timeout: 5_000, interval: 50 });
  }, 10_000);
});
