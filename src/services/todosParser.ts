import * as fs from 'fs';
import * as path from 'path';
import { encodeCwdToProjectDir } from './projectDir';
import type { AgentTodos, Todo, TodoStatus } from '../types';

const VALID_STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed'];

interface ContentBlock {
  type?: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  input?: { todos?: unknown; name?: unknown; prompt?: unknown };
}

interface TranscriptEntry {
  type?: string;
  isSidechain?: boolean;
  toolUseResult?: { agentId?: unknown };
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}

interface AgentInvocation {
  name: string;
  prompt: string;
  status: 'running' | 'completed';
}

export class TodosParser {
  constructor(private readonly claudeDir: string) {}

  hasTranscript(sessionId: string, cwd: string): boolean {
    return this.transcriptPath(sessionId, cwd) !== null;
  }

  listForSession(sessionId: string, cwd: string): AgentTodos[] {
    const transcriptPath = this.transcriptPath(sessionId, cwd);
    if (!transcriptPath) return [];

    const result: AgentTodos[] = [];

    const mainTodos = this.readLastTodoWrite(transcriptPath, true);
    if (mainTodos) {
      const stat = fs.statSync(transcriptPath);
      result.push({
        sessionId,
        agentId: sessionId,
        name: 'Main agent',
        isMain: true,
        todos: mainTodos,
        updatedAt: stat.mtimeMs,
      });
    }

    result.push(...this.listSubAgents(sessionId, cwd, transcriptPath));
    return result;
  }

  transcriptMtime(sessionId: string, cwd: string): number | null {
    const transcriptPath = this.transcriptPath(sessionId, cwd);
    if (!transcriptPath) return null;
    try {
      return fs.statSync(transcriptPath).mtimeMs;
    } catch {
      return null;
    }
  }

  readSessionTitle(sessionId: string, cwd: string): string | null {
    const transcriptPath = this.transcriptPath(sessionId, cwd);
    if (!transcriptPath) return null;
    let lines: string[];
    try {
      lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n');
    } catch {
      return null;
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line || line.indexOf('"type":"ai-title"') < 0) continue;
      try {
        const entry = JSON.parse(line) as { type?: string; aiTitle?: unknown };
        if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') {
          return entry.aiTitle;
        }
      } catch { /* skip malformed line */ }
    }
    return null;
  }

  private listSubAgents(sessionId: string, cwd: string, mainTranscriptPath: string): AgentTodos[] {
    const dir = this.subAgentsDir(sessionId, cwd);
    if (!dir) return [];

    const invocations = this.readAgentInvocations(mainTranscriptPath);
    if (invocations.length === 0) return [];

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
    } catch {
      return [];
    }

    const byPrompt = new Map<string, { agentId: string; todos: Todo[]; updatedAt: number }>();
    for (const file of files) {
      const filePath = path.join(dir, file);
      const prompt = this.readSubAgentPrompt(filePath);
      if (prompt === null) continue;
      const todos = this.readLastTodoWrite(filePath, false) ?? [];
      let updatedAt = 0;
      try { updatedAt = fs.statSync(filePath).mtimeMs; } catch { /* ignore */ }
      const agentId = file.slice('agent-'.length, -'.jsonl'.length);
      byPrompt.set(prompt, { agentId, todos, updatedAt });
    }

    const out: AgentTodos[] = [];
    for (const inv of invocations) {
      const match = byPrompt.get(inv.prompt);
      if (!match) continue;
      out.push({
        sessionId,
        agentId: match.agentId,
        name: inv.name,
        isMain: false,
        status: inv.status,
        todos: match.todos,
        updatedAt: match.updatedAt,
      });
    }
    out.sort((a, b) => {
      const ga = this.subAgentGroup(a);
      const gb = this.subAgentGroup(b);
      if (ga !== gb) return ga - gb;
      return b.updatedAt - a.updatedAt;
    });
    return out;
  }

  private subAgentGroup(agent: AgentTodos): number {
    if (agent.status === 'running') return 0;
    if (agent.todos.length > 0) return 1;
    return 2;
  }

  private readAgentInvocations(mainTranscriptPath: string): AgentInvocation[] {
    let lines: string[];
    try {
      lines = fs.readFileSync(mainTranscriptPath, 'utf-8').split('\n');
    } catch {
      return [];
    }

    const invocations = new Map<string, { name: string; prompt: string }>();
    const resultKind = new Map<string, 'completed' | 'rejected'>();

    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try {
        entry = JSON.parse(line) as TranscriptEntry;
      } catch {
        continue;
      }
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === 'tool_use' && block.name === 'Agent' && typeof block.id === 'string') {
          const name = block.input?.name;
          const prompt = block.input?.prompt;
          if (typeof name === 'string' && typeof prompt === 'string') {
            invocations.set(block.id, { name, prompt });
          }
        }
        if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          const agentId = entry.toolUseResult?.agentId;
          resultKind.set(block.tool_use_id, typeof agentId === 'string' ? 'completed' : 'rejected');
        }
      }
    }

    const out: AgentInvocation[] = [];
    for (const [toolUseId, inv] of invocations) {
      const kind = resultKind.get(toolUseId);
      if (kind === 'rejected') continue;
      out.push({
        name: inv.name,
        prompt: inv.prompt,
        status: kind === 'completed' ? 'completed' : 'running',
      });
    }
    return out;
  }

  private cwdCandidates(cwd: string): string[] {
    const candidates = process.platform === 'win32'
      ? [cwd, cwd.toLowerCase(), cwd.charAt(0).toUpperCase() + cwd.slice(1).toLowerCase()]
      : [cwd];
    return [...new Set(candidates)];
  }

  private transcriptPath(sessionId: string, cwd: string): string | null {
    for (const candidate of this.cwdCandidates(cwd)) {
      const p = path.join(this.claudeDir, 'projects', encodeCwdToProjectDir(candidate), `${sessionId}.jsonl`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private subAgentsDir(sessionId: string, cwd: string): string | null {
    for (const candidate of this.cwdCandidates(cwd)) {
      const d = path.join(this.claudeDir, 'projects', encodeCwdToProjectDir(candidate), sessionId, 'subagents');
      if (fs.existsSync(d)) return d;
    }
    return null;
  }

  private readSubAgentPrompt(filePath: string): string | null {
    let lines: string[];
    try {
      lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return null;
    }
    for (const line of lines) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.type === 'user') {
          const content = entry.message?.content;
          if (typeof content === 'string') return content;
        }
      } catch { /* skip malformed line */ }
    }
    return null;
  }

  private readLastTodoWrite(transcriptPath: string, skipSidechain: boolean): Todo[] | null {
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
        if (skipSidechain && entry.isSidechain) continue;
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
