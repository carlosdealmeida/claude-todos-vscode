import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  beforeEach(() => { claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-')); });
  afterEach(() => { fs.rmSync(claudeDir, { recursive: true, force: true }); });

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
});
