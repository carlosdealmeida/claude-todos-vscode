import * as fs from 'fs';
import * as path from 'path';
import { encodeCwdToProjectDir } from './projectDir';
import type { AgentTodos, Todo, TodoStatus } from '../types';

const VALID_STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed'];

interface TranscriptEntry {
  isSidechain?: boolean;
  message?: {
    content?: Array<{
      type?: string;
      name?: string;
      input?: { todos?: unknown };
    }>;
  };
}

export class TodosParser {
  constructor(private readonly claudeDir: string) {}

  hasTranscript(sessionId: string, cwd: string): boolean {
    return this.transcriptPath(sessionId, cwd) !== null;
  }

  listForSession(sessionId: string, cwd: string): AgentTodos[] {
    const transcriptPath = this.transcriptPath(sessionId, cwd);
    if (!transcriptPath) return [];

    const todos = this.readLastMainTodoWrite(transcriptPath);
    if (!todos) return [];

    const stat = fs.statSync(transcriptPath);
    return [{
      sessionId,
      agentId: sessionId,
      name: 'Main agent',
      isMain: true,
      todos,
      updatedAt: stat.mtimeMs,
    }];
  }

  private transcriptPath(sessionId: string, cwd: string): string | null {
    const candidates = process.platform === 'win32'
      ? [cwd, cwd.toLowerCase(), cwd.charAt(0).toUpperCase() + cwd.slice(1).toLowerCase()]
      : [cwd];
    for (const candidate of new Set(candidates)) {
      const p = path.join(this.claudeDir, 'projects', encodeCwdToProjectDir(candidate), `${sessionId}.jsonl`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private readLastMainTodoWrite(transcriptPath: string): Todo[] | null {
    let lines: string[];
    try {
      lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n');
    } catch {
      return null;
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line || line.indexOf('"name":"TodoWrite"') < 0) continue;
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.isSidechain) continue;
        const content = entry.message?.content;
        if (!Array.isArray(content)) continue;
        for (let j = content.length - 1; j >= 0; j--) {
          const block = content[j];
          if (block?.type === 'tool_use' && block.name === 'TodoWrite') {
            const raw = block.input?.todos;
            if (Array.isArray(raw)) return raw.filter(this.isValidTodo);
          }
        }
      } catch { /* skip malformed line */ }
    }
    return null;
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
