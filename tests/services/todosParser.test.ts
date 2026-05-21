import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TodosParser } from '../../src/services/todosParser';

describe('TodosParser', () => {
  let tmpDir: string;
  let parser: TodosParser;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todos-test-'));
    parser = new TodosParser(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTodos(sessionId: string, agentId: string, todos: any[]) {
    const file = path.join(tmpDir, `${sessionId}-agent-${agentId}.json`);
    fs.writeFileSync(file, JSON.stringify(todos));
  }

  it('returns empty array when no files match session', () => {
    expect(parser.listForSession('nope')).toEqual([]);
  });

  it('parses main agent (agentId === sessionId)', () => {
    writeTodos('s1', 's1', [
      { content: 'task 1', status: 'in_progress', activeForm: 'Doing task 1' },
    ]);
    const agents = parser.listForSession('s1');
    expect(agents).toHaveLength(1);
    expect(agents[0].isMain).toBe(true);
    expect(agents[0].todos[0].content).toBe('task 1');
  });

  it('parses sub-agents alongside main', () => {
    writeTodos('s1', 's1', [{ content: 'main', status: 'pending', activeForm: 'Main' }]);
    writeTodos('s1', 'sub-a', [{ content: 'sub a', status: 'completed', activeForm: 'Sub a' }]);
    writeTodos('s1', 'sub-b', [{ content: 'sub b', status: 'in_progress', activeForm: 'Sub b' }]);
    const agents = parser.listForSession('s1');
    expect(agents).toHaveLength(3);
    expect(agents.filter(a => a.isMain)).toHaveLength(1);
    expect(agents.filter(a => !a.isMain)).toHaveLength(2);
  });

  it('ignores files from other sessions', () => {
    writeTodos('s1', 's1', []);
    writeTodos('s2', 's2', []);
    expect(parser.listForSession('s1')).toHaveLength(1);
  });

  it('skips invalid todo entries within a file', () => {
    writeTodos('s1', 's1', [
      { content: 'ok', status: 'pending', activeForm: 'Ok' },
      { content: 'missing-status' },
      null,
      { content: 'bad-status', status: 'invalid', activeForm: 'x' },
    ]);
    const agents = parser.listForSession('s1');
    expect(agents[0].todos).toHaveLength(1);
    expect(agents[0].todos[0].content).toBe('ok');
  });

  it('returns empty agent on corrupt file', () => {
    fs.writeFileSync(path.join(tmpDir, 's1-agent-s1.json'), 'not json');
    const agents = parser.listForSession('s1');
    expect(agents).toHaveLength(1);
    expect(agents[0].todos).toEqual([]);
  });

  it('orders agents: main first, then sub-agents by updatedAt asc', async () => {
    writeTodos('s1', 'sub-a', []);
    await new Promise(r => setTimeout(r, 10));
    writeTodos('s1', 's1', []);
    await new Promise(r => setTimeout(r, 10));
    writeTodos('s1', 'sub-b', []);
    const agents = parser.listForSession('s1');
    expect(agents[0].isMain).toBe(true);
    expect(agents[1].agentId).toBe('sub-a');
    expect(agents[2].agentId).toBe('sub-b');
  });
});
