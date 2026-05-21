import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TodosParser } from '../../src/services/todosParser';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

describe('TodosParser', () => {
  let claudeDir: string;
  let parser: TodosParser;
  const CWD = '/home/user/proj';

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-test-'));
    parser = new TodosParser(claudeDir);
  });

  afterEach(() => {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  function writeTranscript(sessionId: string, cwd: string, lines: object[]): string {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(cwd));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n'));
    return file;
  }

  function todoWriteEntry(todos: object[], opts: { isSidechain?: boolean } = {}): object {
    return {
      isSidechain: opts.isSidechain ?? false,
      message: {
        content: [
          { type: 'tool_use', name: 'TodoWrite', input: { todos } },
        ],
      },
    };
  }

  it('returns empty when no transcript file exists', () => {
    expect(parser.listForSession('nope', CWD)).toEqual([]);
  });

  it('returns the last TodoWrite event from main thread', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'old', activeForm: 'Old', status: 'pending' }]),
      todoWriteEntry([
        { content: 'new1', activeForm: 'New 1', status: 'completed' },
        { content: 'new2', activeForm: 'New 2', status: 'in_progress' },
      ]),
    ]);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(1);
    expect(agents[0].isMain).toBe(true);
    expect(agents[0].todos).toHaveLength(2);
    expect(agents[0].todos[0].content).toBe('new1');
  });

  it('labels the main agent', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'task', activeForm: 'Task', status: 'pending' }]),
    ]);
    const agents = parser.listForSession('s1', CWD);
    expect(agents[0].name).toBe('Main agent');
    expect(agents[0].isMain).toBe(true);
  });

  it('ignores TodoWrite events from sidechains', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'pending' }]),
      todoWriteEntry([{ content: 'subagent', activeForm: 'Sub', status: 'pending' }], { isSidechain: true }),
    ]);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(1);
    expect(agents[0].todos[0].content).toBe('main');
  });

  it('returns empty when transcript has no TodoWrite events', () => {
    writeTranscript('s1', CWD, [
      { message: { content: [{ type: 'text', text: 'hello' }] } },
    ]);
    expect(parser.listForSession('s1', CWD)).toEqual([]);
  });

  it('skips invalid todos within an event', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([
        { content: 'ok', activeForm: 'Ok', status: 'pending' },
        { content: 'missing-status' },
        null,
        { content: 'bad-status', activeForm: 'x', status: 'invalid' },
      ] as any),
    ]);
    const agents = parser.listForSession('s1', CWD);
    expect(agents[0].todos).toHaveLength(1);
    expect(agents[0].todos[0].content).toBe('ok');
  });

  it('skips malformed JSONL lines', () => {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 's1.jsonl'),
      'this is not json\n' +
      JSON.stringify(todoWriteEntry([{ content: 'ok', activeForm: 'Ok', status: 'pending' }])),
    );
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(1);
    expect(agents[0].todos[0].content).toBe('ok');
  });

  it('falls back to lowercase cwd dir on win32-style path', () => {
    const upperCwd = 'C:\\@work\\proj';
    const lowerCwd = 'c:\\@work\\proj';
    // Write under lowercase encoded dir
    writeTranscript('s1', lowerCwd, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'pending' }]),
    ]);
    // Parser called with uppercase variant — should still find it on win32
    if (process.platform === 'win32') {
      const agents = parser.listForSession('s1', upperCwd);
      expect(agents).toHaveLength(1);
    }
  });
});
