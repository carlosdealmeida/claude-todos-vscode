import * as fs from 'fs';
import * as path from 'path';
import type { AgentTodos, Todo, TodoStatus } from '../types';

const VALID_STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed'];

export class TodosParser {
  constructor(private readonly todosDir: string) {}

  listForSession(sessionId: string): AgentTodos[] {
    if (!fs.existsSync(this.todosDir)) return [];

    const prefix = `${sessionId}-agent-`;
    const entries = fs.readdirSync(this.todosDir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.json'));

    const agents: AgentTodos[] = entries.map(filename => {
      const agentId = filename.slice(prefix.length, -'.json'.length);
      const filePath = path.join(this.todosDir, filename);
      const stat = fs.statSync(filePath);
      return {
        sessionId,
        agentId,
        isMain: agentId === sessionId,
        todos: this.readTodos(filePath),
        updatedAt: stat.mtimeMs,
      };
    });

    return agents.sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return a.updatedAt - b.updatedAt;
    });
  }

  private readTodos(filePath: string): Todo[] {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(this.isValidTodo);
    } catch {
      return [];
    }
  }

  private isValidTodo(item: unknown): item is Todo {
    if (!item || typeof item !== 'object') return false;
    const t = item as Record<string, unknown>;
    return typeof t.content === 'string'
      && typeof t.activeForm === 'string'
      && typeof t.status === 'string'
      && VALID_STATUSES.includes(t.status as TodoStatus);
  }
}
