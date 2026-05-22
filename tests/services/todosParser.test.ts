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

  function agentToolUse(toolUseId: string, name: string, prompt: string): object {
    return {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Agent', id: toolUseId, input: { name, prompt } },
        ],
      },
    };
  }

  function agentResult(toolUseId: string, agentId: string): object {
    return {
      type: 'user',
      toolUseResult: { agentId, status: 'completed' },
      message: {
        content: [
          { type: 'tool_result', tool_use_id: toolUseId, content: 'done' },
        ],
      },
    };
  }

  function agentRejection(toolUseId: string): object {
    return {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: toolUseId, content: 'The user rejected this tool use.' },
        ],
      },
    };
  }

  function writeSubAgent(
    sessionId: string,
    cwd: string,
    agentId: string,
    prompt: string,
    todos: object[] | null,
    mtimeMs?: number,
  ): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(cwd), sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    const lines: object[] = [
      { type: 'user', isSidechain: true, agentId, message: { role: 'user', content: prompt } },
    ];
    if (todos) {
      lines.push({
        isSidechain: true,
        agentId,
        message: { content: [{ type: 'tool_use', name: 'TodoWrite', input: { todos } }] },
      });
    }
    const filePath = path.join(dir, `agent-${agentId}.jsonl`);
    fs.writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n'));
    if (mtimeMs !== undefined) {
      fs.utimesSync(filePath, new Date(mtimeMs), new Date(mtimeMs));
    }
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

  it('includes a completed sub-agent with its todos', () => {
    const prompt = 'Audit the build config';
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main task', activeForm: 'Main task', status: 'in_progress' }]),
      agentToolUse('tool-1', 'audit-build', prompt),
      agentResult('tool-1', 'aaa111'),
    ]);
    writeSubAgent('s1', CWD, 'aaa111', prompt, [
      { content: 'sub task', activeForm: 'Sub task', status: 'completed' },
    ]);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(2);
    expect(agents[0].isMain).toBe(true);
    expect(agents[1].isMain).toBe(false);
    expect(agents[1].name).toBe('audit-build');
    expect(agents[1].agentId).toBe('aaa111');
    expect(agents[1].status).toBe('completed');
    expect(agents[1].todos).toHaveLength(1);
    expect(agents[1].todos[0].content).toBe('sub task');
  });

  it('marks a sub-agent with no result as running', () => {
    const prompt = 'Audit security';
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
      agentToolUse('tool-1', 'audit-sec', prompt),
    ]);
    writeSubAgent('s1', CWD, 'bbb222', prompt, null);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(2);
    expect(agents[1].status).toBe('running');
    expect(agents[1].todos).toEqual([]);
  });

  it('returns sub-agents in main-transcript invocation order', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'm', activeForm: 'M', status: 'in_progress' }]),
      agentToolUse('t1', 'first', 'prompt one'),
      agentResult('t1', 'a1'),
      agentToolUse('t2', 'second', 'prompt two'),
      agentResult('t2', 'a2'),
    ]);
    writeSubAgent('s1', CWD, 'a2', 'prompt two', null);
    writeSubAgent('s1', CWD, 'a1', 'prompt one', null);
    const agents = parser.listForSession('s1', CWD);
    expect(agents.map(a => a.name)).toEqual(['Main agent', 'first', 'second']);
  });

  it('excludes a rejected sub-agent invocation', () => {
    const prompt = 'Rejected task';
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
      agentToolUse('tool-1', 'audit-x', prompt),
      agentRejection('tool-1'),
    ]);
    writeSubAgent('s1', CWD, 'ccc333', prompt, null);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(1);
    expect(agents[0].isMain).toBe(true);
  });

  it('excludes a sub-agent file with no matching invocation', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
    ]);
    writeSubAgent('s1', CWD, 'ddd444', 'Orphan prompt', null);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(1);
  });

  it('sorts sub-agents: running, then with todos, then empty; recent first', () => {
    const todo = [{ content: 'x', activeForm: 'X', status: 'pending' }];
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
      agentToolUse('t-empty-old', 'empty-old', 'p empty old'),
      agentResult('t-empty-old', 'a-empty-old'),
      agentToolUse('t-empty-new', 'empty-new', 'p empty new'),
      agentResult('t-empty-new', 'a-empty-new'),
      agentToolUse('t-todos', 'has-todos', 'p todos'),
      agentResult('t-todos', 'a-todos'),
      agentToolUse('t-running', 'is-running', 'p running'),
    ]);
    writeSubAgent('s1', CWD, 'a-empty-old', 'p empty old', null, 1000);
    writeSubAgent('s1', CWD, 'a-empty-new', 'p empty new', null, 2000);
    writeSubAgent('s1', CWD, 'a-todos', 'p todos', todo, 1500);
    writeSubAgent('s1', CWD, 'a-running', 'p running', null, 1200);

    const agents = parser.listForSession('s1', CWD);
    expect(agents.map(a => a.name)).toEqual([
      'Main agent', 'is-running', 'has-todos', 'empty-new', 'empty-old',
    ]);
  });

  it('returns the transcript mtime, or null when absent', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'pending' }]),
    ]);
    expect(typeof parser.transcriptMtime('s1', CWD)).toBe('number');
    expect(parser.transcriptMtime('nope', CWD)).toBeNull();
  });

  it('reads the latest ai-title from the transcript', () => {
    writeTranscript('s1', CWD, [
      { type: 'ai-title', aiTitle: 'Primeiro título', sessionId: 's1' },
      todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'pending' }]),
      { type: 'ai-title', aiTitle: 'Título atual', sessionId: 's1' },
    ]);
    expect(parser.readSessionTitle('s1', CWD)).toBe('Título atual');
  });

  it('returns null when the transcript has no ai-title', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'pending' }]),
    ]);
    expect(parser.readSessionTitle('s1', CWD)).toBeNull();
  });

  it('does not emit duplicate sub-agent agentIds when prompts collide', () => {
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
      agentToolUse('t1', 'dup', 'same prompt'),
      agentResult('t1', 'aaa'),
      agentToolUse('t2', 'dup', 'same prompt'),
      agentResult('t2', 'bbb'),
    ]);
    writeSubAgent('s1', CWD, 'aaa', 'same prompt', null);
    writeSubAgent('s1', CWD, 'bbb', 'same prompt', null);
    const agents = parser.listForSession('s1', CWD);
    const ids = agents.map(a => a.agentId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
