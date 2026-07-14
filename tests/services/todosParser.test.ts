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

  function todoWriteEntry(todos: object[], opts: { isSidechain?: boolean; timestamp?: string } = {}): object {
    return {
      isSidechain: opts.isSidechain ?? false,
      ...(opts.timestamp ? { timestamp: opts.timestamp } : {}),
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

  // Real-world Agent dispatch: only `description` is set (the optional `name`
  // param is usually omitted). This is the common shape produced by the Agent
  // tool; `name` only appears when the caller explicitly sets it.
  function agentToolUseDesc(toolUseId: string, description: string, prompt: string): object {
    return {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Agent', id: toolUseId, input: { description, subagent_type: 'general-purpose', prompt } },
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

  function writeSubAgentMeta(sessionId: string, cwd: string, agentId: string, meta: object): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(cwd), sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  }

  // Sub-agent cujo transcript também DISPARA outro agente (para testes de aninhamento).
  function writeSubAgentWithDispatch(
    sessionId: string, cwd: string, agentId: string, prompt: string,
    dispatch: { toolUseId: string; description: string; childPrompt: string; completedAgentId?: string },
  ): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(cwd), sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    const lines: object[] = [
      { type: 'user', isSidechain: true, agentId, message: { role: 'user', content: prompt } },
      {
        type: 'assistant', isSidechain: true, agentId,
        message: { content: [{ type: 'tool_use', name: 'Agent', id: dispatch.toolUseId, input: { description: dispatch.description, prompt: dispatch.childPrompt } }] },
      },
    ];
    if (dispatch.completedAgentId) {
      lines.push({
        type: 'user', isSidechain: true, agentId,
        message: { content: [{ type: 'tool_result', tool_use_id: dispatch.toolUseId, content: 'done' }] },
      });
    }
    fs.writeFileSync(path.join(dir, `agent-${agentId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n'));
  }

  function taskCreateToolUse(toolUseId: string, subject: string, activeForm: string, opts: { isSidechain?: boolean } = {}): object {
    return {
      isSidechain: opts.isSidechain ?? false,
      message: {
        content: [
          { type: 'tool_use', name: 'TaskCreate', id: toolUseId, input: { subject, description: subject, activeForm } },
        ],
      },
    };
  }

  function taskCreateResult(toolUseId: string, taskId: string, subject: string, opts: { isSidechain?: boolean } = {}): object {
    return {
      isSidechain: opts.isSidechain ?? false,
      type: 'user',
      toolUseResult: { task: { id: taskId, subject } },
      message: {
        content: [
          { type: 'tool_result', tool_use_id: toolUseId, content: `Task #${taskId} created successfully: ${subject}` },
        ],
      },
    };
  }

  function taskUpdateToolUse(toolUseId: string, taskId: string, status: string, opts: { isSidechain?: boolean; timestamp?: string } = {}): object {
    return {
      isSidechain: opts.isSidechain ?? false,
      ...(opts.timestamp ? { timestamp: opts.timestamp } : {}),
      message: {
        content: [
          { type: 'tool_use', name: 'TaskUpdate', id: toolUseId, input: { taskId, status } },
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

  it('includes a sub-agent dispatched with only a description (no name)', () => {
    const prompt = 'Map the legacy architecture';
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main task', activeForm: 'Main task', status: 'in_progress' }]),
      agentToolUseDesc('tool-1', 'Mapear arquitetura e backend', prompt),
      agentResult('tool-1', 'aaa111'),
    ]);
    writeSubAgent('s1', CWD, 'aaa111', prompt, [
      { content: 'sub task', activeForm: 'Sub task', status: 'in_progress' },
    ]);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(2);
    expect(agents[1].isMain).toBe(false);
    expect(agents[1].name).toBe('Mapear arquitetura e backend');
    expect(agents[1].agentId).toBe('aaa111');
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

  it('legacy: a rejected invocation does not consume the prompt match of a live retry', () => {
    const prompt = 'Retry with same prompt';
    writeTranscript('s1', CWD, [
      todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
      agentToolUse('t-rej', 'retry-agent', prompt),
      agentRejection('t-rej'),
      agentToolUse('t-ok', 'retry-agent', prompt),
      agentResult('t-ok', 'live001'),
    ]);
    writeSubAgent('s1', CWD, 'live001', prompt, null);
    const agents = parser.listForSession('s1', CWD);
    expect(agents).toHaveLength(2);
    expect(agents[1].agentId).toBe('live001');
    expect(agents[1].status).toBe('completed');
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

  describe('TodoWrite timing', () => {
    it('captures startedAt and completedAt across the snapshot sequence', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'task a', activeForm: 'Doing a', status: 'in_progress' }], { timestamp: '2026-06-12T10:00:00.000Z' }),
        todoWriteEntry([{ content: 'task a', activeForm: 'Doing a', status: 'completed' }], { timestamp: '2026-06-12T10:01:00.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBe(Date.parse('2026-06-12T10:00:00.000Z'));
      expect(todo.completedAt).toBe(Date.parse('2026-06-12T10:01:00.000Z'));
    });

    it('keeps the first in_progress timestamp (first-write-wins) across snapshots', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:00:00.000Z' }),
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:05:00.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBe(Date.parse('2026-06-12T10:00:00.000Z'));
    });

    it('matches tasks by content even when the list is reordered', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([
          { content: 'first', activeForm: 'First', status: 'in_progress' },
          { content: 'second', activeForm: 'Second', status: 'pending' },
        ], { timestamp: '2026-06-12T10:00:00.000Z' }),
        todoWriteEntry([
          { content: 'second', activeForm: 'Second', status: 'in_progress' },
          { content: 'first', activeForm: 'First', status: 'completed' },
        ], { timestamp: '2026-06-12T10:02:00.000Z' }),
      ]);
      const todos = parser.listForSession('s1', CWD)[0].todos;
      const first = todos.find(t => t.content === 'first')!;
      const second = todos.find(t => t.content === 'second')!;
      expect(first.startedAt).toBe(Date.parse('2026-06-12T10:00:00.000Z'));
      expect(first.completedAt).toBe(Date.parse('2026-06-12T10:02:00.000Z'));
      expect(second.startedAt).toBe(Date.parse('2026-06-12T10:02:00.000Z'));
    });

    it('records only completedAt when a task skips in_progress', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'pending' }], { timestamp: '2026-06-12T10:00:00.000Z' }),
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'completed' }], { timestamp: '2026-06-12T10:03:00.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBeUndefined();
      expect(todo.completedAt).toBe(Date.parse('2026-06-12T10:03:00.000Z'));
    });

    it('leaves timing undefined when snapshots have no timestamp', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }]),
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'completed' }]),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBeUndefined();
      expect(todo.completedAt).toBeUndefined();
    });

    it('resets timing to the current round when the same content is reused (no leak)', () => {
      writeTranscript('s1', CWD, [
        // rodada 1: mesma content, in_progress -> completed
        todoWriteEntry([{ content: 'task X', activeForm: 'X', status: 'in_progress' }], { timestamp: '2026-06-12T21:08:53.000Z' }),
        todoWriteEntry([{ content: 'task X', activeForm: 'X', status: 'completed' }], { timestamp: '2026-06-12T21:09:04.000Z' }),
        // rodada 2: reaberta como pending (fronteira), depois in_progress -> completed ~14min depois
        todoWriteEntry([{ content: 'task X', activeForm: 'X', status: 'pending' }], { timestamp: '2026-06-12T21:22:40.000Z' }),
        todoWriteEntry([{ content: 'task X', activeForm: 'X', status: 'in_progress' }], { timestamp: '2026-06-12T21:22:48.000Z' }),
        todoWriteEntry([{ content: 'task X', activeForm: 'X', status: 'completed' }], { timestamp: '2026-06-12T21:22:59.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      // deve refletir a 2ª rodada, não vazar o tempo antigo (21:08:53)
      expect(todo.startedAt).toBe(Date.parse('2026-06-12T21:22:48.000Z'));
      expect(todo.completedAt).toBe(Date.parse('2026-06-12T21:22:59.000Z'));
    });

    it('resets timing when a completed task reopens in_progress with NO pending step', () => {
      writeTranscript('s1', CWD, [
        // rodada 1: in_progress -> completed
        todoWriteEntry([{ content: 'task Y', activeForm: 'Y', status: 'in_progress' }], { timestamp: '2026-06-12T21:43:28.000Z' }),
        todoWriteEntry([{ content: 'task Y', activeForm: 'Y', status: 'completed' }], { timestamp: '2026-06-12T21:43:37.000Z' }),
        // rodada 2: reabre DIRETO em in_progress (completed -> in_progress, sem pending)
        todoWriteEntry([{ content: 'task Y', activeForm: 'Y', status: 'in_progress' }], { timestamp: '2026-06-12T21:48:49.000Z' }),
        todoWriteEntry([{ content: 'task Y', activeForm: 'Y', status: 'completed' }], { timestamp: '2026-06-12T21:48:59.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBe(Date.parse('2026-06-12T21:48:49.000Z'));
      expect(todo.completedAt).toBe(Date.parse('2026-06-12T21:48:59.000Z'));
    });

    it('resets timing when a reused content reappears in_progress after being absent', () => {
      writeTranscript('s1', CWD, [
        // rodada 1: a task aparece in_progress e fica (sem concluir), depois some da lista
        todoWriteEntry([{ content: 'task Z', activeForm: 'Z', status: 'in_progress' }], { timestamp: '2026-06-12T10:00:00.000Z' }),
        todoWriteEntry([{ content: 'outra coisa', activeForm: 'O', status: 'in_progress' }], { timestamp: '2026-06-12T10:01:00.000Z' }),
        // rodada 2: a mesma content reaparece in_progress 10 min depois
        todoWriteEntry([{ content: 'task Z', activeForm: 'Z', status: 'in_progress' }], { timestamp: '2026-06-12T10:10:00.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos.find(t => t.content === 'task Z')!;
      expect(todo.startedAt).toBe(Date.parse('2026-06-12T10:10:00.000Z'));
    });
  });

  describe('sourceLine (todos clicáveis)', () => {
    it('points to the line of the LAST status transition (TodoWrite)', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'pending' }], { timestamp: '2026-06-12T10:00:00.000Z' }),     // linha 0
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:01:00.000Z' }), // linha 1
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'completed' }], { timestamp: '2026-06-12T10:02:00.000Z' }),   // linha 2
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(2);
    });

    it('keeps the transition line when later snapshots repeat the status', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:00:00.000Z' }), // linha 0 (transição)
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }], { timestamp: '2026-06-12T10:05:00.000Z' }), // linha 1 (repete)
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(0);
    });

    it('reused content in a new round points to the new round', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'in_progress' }], { timestamp: '2026-06-12T10:00:00.000Z' }), // linha 0
        todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'completed' }], { timestamp: '2026-06-12T10:01:00.000Z' }),   // linha 1
        todoWriteEntry([{ content: 'x', activeForm: 'X', status: 'in_progress' }], { timestamp: '2026-06-12T10:10:00.000Z' }), // linha 2 (reabre)
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(2);
    });

    it('is undefined when snapshots have no timestamp', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'in_progress' }]),
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBeUndefined();
    });

    it('pending task keeps the line where it entered the list (TodoWrite)', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'pending' }], { timestamp: '2026-06-12T10:00:00.000Z' }), // linha 0 (nova)
        todoWriteEntry([{ content: 'a', activeForm: 'A', status: 'pending' }], { timestamp: '2026-06-12T10:01:00.000Z' }), // linha 1 (repete)
      ]);
      expect(parser.listForSession('s1', CWD)[0].todos[0].sourceLine).toBe(0);
    });
  });

  describe('TaskCreate/TaskUpdate schema (AGENT_TEAMS)', () => {
    it('reconstructs todos from a stream of TaskCreate calls (all pending)', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'first task', 'Doing first'),
        taskCreateResult('tu-1', '1', 'first task'),
        taskCreateToolUse('tu-2', 'second task', 'Doing second'),
        taskCreateResult('tu-2', '2', 'second task'),
        taskCreateToolUse('tu-3', 'third task', 'Doing third'),
        taskCreateResult('tu-3', '3', 'third task'),
      ]);
      const agents = parser.listForSession('s1', CWD);
      expect(agents).toHaveLength(1);
      expect(agents[0].todos).toEqual([
        { content: 'first task', activeForm: 'Doing first', status: 'pending', sourceLine: 0 },
        { content: 'second task', activeForm: 'Doing second', status: 'pending', sourceLine: 2 },
        { content: 'third task', activeForm: 'Doing third', status: 'pending', sourceLine: 4 },
      ]);
    });

    it('applies TaskUpdate status changes by taskId', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'a', 'A'),
        taskCreateResult('tu-1', '1', 'a'),
        taskCreateToolUse('tu-2', 'b', 'B'),
        taskCreateResult('tu-2', '2', 'b'),
        taskUpdateToolUse('tu-3', '1', 'in_progress'),
        taskUpdateToolUse('tu-4', '1', 'completed'),
        taskUpdateToolUse('tu-5', '2', 'in_progress'),
      ]);
      const agents = parser.listForSession('s1', CWD);
      expect(agents[0].todos).toEqual([
        { content: 'a', activeForm: 'A', status: 'completed', sourceLine: 5 },
        { content: 'b', activeForm: 'B', status: 'in_progress', sourceLine: 6 },
      ]);
    });

    it('falls back to parsing Task #N from the result content when toolUseResult is absent', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'only task', 'Only'),
        {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'tu-1', content: 'Task #7 created successfully: only task' },
            ],
          },
        },
        taskUpdateToolUse('tu-2', '7', 'completed'),
      ]);
      const agents = parser.listForSession('s1', CWD);
      expect(agents[0].todos).toEqual([
        { content: 'only task', activeForm: 'Only', status: 'completed', sourceLine: 2 },
      ]);
    });

    it('ignores TaskUpdate referring to an unknown taskId', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'a', 'A'),
        taskCreateResult('tu-1', '1', 'a'),
        taskUpdateToolUse('tu-2', '99', 'completed'),
      ]);
      const agents = parser.listForSession('s1', CWD);
      expect(agents[0].todos).toEqual([
        { content: 'a', activeForm: 'A', status: 'pending', sourceLine: 0 },
      ]);
    });

    it('ignores TaskUpdate with invalid status', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'a', 'A'),
        taskCreateResult('tu-1', '1', 'a'),
        taskUpdateToolUse('tu-2', '1', 'whatever'),
      ]);
      const agents = parser.listForSession('s1', CWD);
      expect(agents[0].todos[0].status).toBe('pending');
    });

    it('treats Task* on the main thread (non-sidechain) as the main agent list', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'main task', 'Doing main', { isSidechain: false }),
        taskCreateResult('tu-1', '1', 'main task'),
        taskCreateToolUse('tu-2', 'sub task', 'Doing sub', { isSidechain: true }),
        taskCreateResult('tu-2', '2', 'sub task', { isSidechain: true }),
      ]);
      const agents = parser.listForSession('s1', CWD);
      expect(agents).toHaveLength(1);
      expect(agents[0].isMain).toBe(true);
      expect(agents[0].todos).toEqual([
        { content: 'main task', activeForm: 'Doing main', status: 'pending', sourceLine: 0 },
      ]);
    });

    it('uses the most recent schema when both TodoWrite and TaskCreate exist', () => {
      // TodoWrite first (older), then TaskCreate (newer) — TaskCreate wins.
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'legacy', activeForm: 'Legacy', status: 'in_progress' }]),
        taskCreateToolUse('tu-1', 'new schema', 'New'),
        taskCreateResult('tu-1', '1', 'new schema'),
      ]);
      const agents = parser.listForSession('s1', CWD);
      expect(agents[0].todos).toEqual([
        { content: 'new schema', activeForm: 'New', status: 'pending', sourceLine: 1 },
      ]);
    });

    it('records startedAt and completedAt from TaskUpdate timestamps', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'a', 'A'),
        taskCreateResult('tu-1', '1', 'a'),
        taskUpdateToolUse('tu-2', '1', 'in_progress', { timestamp: '2026-06-12T10:00:00.000Z' }),
        taskUpdateToolUse('tu-3', '1', 'completed', { timestamp: '2026-06-12T10:02:30.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBe(Date.parse('2026-06-12T10:00:00.000Z'));
      expect(todo.completedAt).toBe(Date.parse('2026-06-12T10:02:30.000Z'));
    });

    it('keeps the first timestamp for each status transition (first-write-wins)', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'a', 'A'),
        taskCreateResult('tu-1', '1', 'a'),
        taskUpdateToolUse('tu-2', '1', 'in_progress', { timestamp: '2026-06-12T10:00:00.000Z' }),
        taskUpdateToolUse('tu-3', '1', 'in_progress', { timestamp: '2026-06-12T10:05:00.000Z' }),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBe(Date.parse('2026-06-12T10:00:00.000Z'));
    });

    it('leaves timing undefined when TaskUpdate entries have no timestamp', () => {
      writeTranscript('s1', CWD, [
        taskCreateToolUse('tu-1', 'a', 'A'),
        taskCreateResult('tu-1', '1', 'a'),
        taskUpdateToolUse('tu-2', '1', 'in_progress'),
        taskUpdateToolUse('tu-3', '1', 'completed'),
      ]);
      const todo = parser.listForSession('s1', CWD)[0].todos[0];
      expect(todo.startedAt).toBeUndefined();
      expect(todo.completedAt).toBeUndefined();
    });

    it('renders sub-agent task lists in the new schema', () => {
      const prompt = 'Explore something';
      writeTranscript('s1', CWD, [
        taskCreateToolUse('main-1', 'Aguardando subagent', 'Aguardando'),
        taskCreateResult('main-1', '1', 'Aguardando subagent'),
        agentToolUse('agent-tu-1', 'subagent-x', prompt),
        agentResult('agent-tu-1', 'agg111'),
      ]);
      // Sub-agent file using new schema
      const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), 's1', 'subagents');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'agent-agg111.jsonl'), [
        JSON.stringify({ type: 'user', isSidechain: true, agentId: 'agg111', message: { role: 'user', content: prompt } }),
        JSON.stringify(taskCreateToolUse('sub-tu-1', 'sub item', 'Doing sub item', { isSidechain: true })),
        JSON.stringify(taskCreateResult('sub-tu-1', '1', 'sub item', { isSidechain: true })),
        JSON.stringify(taskUpdateToolUse('sub-tu-2', '1', 'in_progress', { isSidechain: true })),
      ].join('\n'));
      const agents = parser.listForSession('s1', CWD);
      const subAgent = agents.find(a => a.name === 'subagent-x');
      expect(subAgent).toBeDefined();
      expect(subAgent!.todos).toEqual([
        { content: 'sub item', activeForm: 'Doing sub item', status: 'in_progress', sourceLine: 3 },
      ]);
    });
  });

  describe('meta.json matching (toolUseId)', () => {
    it('matches by toolUseId even when the file prompt differs from the invocation prompt', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_A', 'Investigar parser', 'PROMPT DA INVOCAÇÃO'),
        agentResult('toolu_A', 'aaa111'),
      ]);
      // O prompt gravado no arquivo é DIFERENTE do da invocação — o matching
      // por prompt falharia; o toolUseId do meta.json resolve.
      writeSubAgent('s1', CWD, 'aaa111', 'prompt reescrito pelo harness', [
        { content: 'sub', activeForm: 'Sub', status: 'pending' },
      ]);
      writeSubAgentMeta('s1', CWD, 'aaa111', {
        agentType: 'general-purpose', description: 'Investigar parser',
        toolUseId: 'toolu_A', spawnDepth: 1,
      });
      const agents = parser.listForSession('s1', CWD);
      expect(agents).toHaveLength(2);
      expect(agents[1].agentId).toBe('aaa111');
      expect(agents[1].name).toBe('Investigar parser');
      expect(agents[1].status).toBe('completed');
    });

    it('propagates agentType, depth and parentAgentId from the meta', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_B', 'Explorar código', 'p1'),
      ]);
      writeSubAgent('s1', CWD, 'bbb222', 'p1', null);
      writeSubAgentMeta('s1', CWD, 'bbb222', {
        agentType: 'Explore', description: 'Explorar código',
        toolUseId: 'toolu_B', spawnDepth: 1,
      });
      const sub = parser.listForSession('s1', CWD)[1];
      expect(sub.agentType).toBe('Explore');
      expect(sub.depth).toBe(1);
      expect(sub.parentAgentId).toBe('s1');
      expect(sub.status).toBe('running');
    });

    it('falls back to prompt matching when the meta.json is corrupted', () => {
      const prompt = 'Auditar build';
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUse('toolu_C', 'audit-build', prompt),
        agentResult('toolu_C', 'ccc333'),
      ]);
      writeSubAgent('s1', CWD, 'ccc333', prompt, null);
      const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), 's1', 'subagents');
      fs.writeFileSync(path.join(dir, 'agent-ccc333.meta.json'), '{broken');
      const agents = parser.listForSession('s1', CWD);
      expect(agents).toHaveLength(2);
      expect(agents[1].name).toBe('audit-build');
      expect(agents[1].agentType).toBeUndefined();
    });

    it('excludes a meta-matched agent whose invocation was rejected', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_D', 'Rejeitado', 'p'),
        agentRejection('toolu_D'),
      ]);
      writeSubAgent('s1', CWD, 'ddd444', 'p', null);
      writeSubAgentMeta('s1', CWD, 'ddd444', { toolUseId: 'toolu_D', spawnDepth: 1 });
      expect(parser.listForSession('s1', CWD)).toHaveLength(1);
    });

    it('does not attach tree fields to legacy (prompt-matched) agents', () => {
      const prompt = 'Sessão antiga';
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUse('toolu_E', 'legacy', prompt),
        agentResult('toolu_E', 'eee555'),
      ]);
      writeSubAgent('s1', CWD, 'eee555', prompt, null);
      const sub = parser.listForSession('s1', CWD)[1];
      expect(sub.agentType).toBeUndefined();
      expect(sub.parentAgentId).toBeUndefined();
      expect(sub.depth).toBeUndefined();
    });

    it('parents a depth-2 agent to the sub-agent that dispatched it', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_P', 'Pai', 'p-pai'),
      ]);
      writeSubAgentWithDispatch('s1', CWD, 'pai111', 'p-pai',
        { toolUseId: 'toolu_F', description: 'Filho aninhado', childPrompt: 'p-filho' });
      writeSubAgentMeta('s1', CWD, 'pai111', { agentType: 'general-purpose', toolUseId: 'toolu_P', spawnDepth: 1 });
      writeSubAgent('s1', CWD, 'filho22', 'p-filho', null);
      writeSubAgentMeta('s1', CWD, 'filho22', { agentType: 'Explore', description: 'Filho aninhado', toolUseId: 'toolu_F', spawnDepth: 2 });

      const agents = parser.listForSession('s1', CWD);
      const filho = agents.find(a => a.agentId === 'filho22')!;
      expect(filho).toBeDefined();
      expect(filho.parentAgentId).toBe('pai111');
      expect(filho.name).toBe('Filho aninhado');
      expect(filho.depth).toBe(2);
      expect(filho.status).toBe('running');  // sem tool_result no transcript do pai
    });

    it('marks a depth-2 agent completed from the tool_result in the parent transcript', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
        agentToolUseDesc('toolu_P', 'Pai', 'p-pai'),
      ]);
      writeSubAgentWithDispatch('s1', CWD, 'pai111', 'p-pai',
        { toolUseId: 'toolu_F', description: 'Filho', childPrompt: 'p-filho', completedAgentId: 'filho22' });
      writeSubAgentMeta('s1', CWD, 'pai111', { toolUseId: 'toolu_P', spawnDepth: 1 });
      writeSubAgent('s1', CWD, 'filho22', 'p-filho', null);
      writeSubAgentMeta('s1', CWD, 'filho22', { toolUseId: 'toolu_F', spawnDepth: 2 });

      const filho = parser.listForSession('s1', CWD).find(a => a.agentId === 'filho22')!;
      expect(filho.status).toBe('completed');
    });

    it('includes an orphan meta agent (toolUseId not found anywhere) without parent or status', () => {
      writeTranscript('s1', CWD, [
        todoWriteEntry([{ content: 'main', activeForm: 'Main', status: 'in_progress' }]),
      ]);
      writeSubAgent('s1', CWD, 'orfao1', 'p-x', [
        { content: 'trabalho', activeForm: 'Trabalhando', status: 'completed' },
      ]);
      writeSubAgentMeta('s1', CWD, 'orfao1', { agentType: 'general-purpose', description: 'Sessão compactada', toolUseId: 'toolu_GONE', spawnDepth: 1 });

      const agents = parser.listForSession('s1', CWD);
      const orfao = agents.find(a => a.agentId === 'orfao1')!;
      expect(orfao).toBeDefined();
      expect(orfao.name).toBe('Sessão compactada');
      expect(orfao.parentAgentId).toBeUndefined();
      expect(orfao.status).toBeUndefined();
      expect(orfao.todos).toHaveLength(1);
    });
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
