import * as fs from 'fs';
import * as path from 'path';
import type { AgentTodos, Todo, TodoStatus } from '../types';
import { transcriptPath as resolveTranscriptPath, subAgentsDir as resolveSubAgentsDir } from './transcriptPaths';
import { readSubAgentMeta, type SubAgentMeta } from './subAgentMeta';

const VALID_STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed'];

function parseEpoch(ts: string | undefined): number | undefined {
  if (!ts) return undefined;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : undefined;
}

// Monta um Todo omitindo campos de timing indefinidos, para não inflar o
// snapshot nem quebrar comparações que só esperam os 3 campos obrigatórios.
function makeTodo(
  content: string,
  activeForm: string,
  status: TodoStatus,
  startedAt?: number,
  completedAt?: number,
): Todo {
  const todo: Todo = { content, activeForm, status };
  if (startedAt !== undefined) todo.startedAt = startedAt;
  if (completedAt !== undefined) todo.completedAt = completedAt;
  return todo;
}

interface ContentBlock {
  type?: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  content?: unknown;
  input?: {
    todos?: unknown;
    name?: unknown;
    description?: unknown;
    prompt?: unknown;
    subject?: unknown;
    activeForm?: unknown;
    taskId?: unknown;
    status?: unknown;
  };
}

interface TranscriptEntry {
  type?: string;
  isSidechain?: boolean;
  timestamp?: string;
  toolUseResult?: {
    agentId?: unknown;
    task?: { id?: unknown };
  };
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}

interface Dispatch {
  label?: string;   // input.name ?? input.description da invocação
  prompt?: string;
  result: 'none' | 'completed' | 'rejected';
}

export class TodosParser {
  constructor(private readonly claudeDir: string) {}

  listForSession(sessionId: string, cwd: string): AgentTodos[] {
    const transcriptPath = this.transcriptPath(sessionId, cwd);
    if (!transcriptPath) return [];

    const result: AgentTodos[] = [];

    const mainTodos = this.readLastTodos(transcriptPath, true);
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

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
    } catch {
      return [];
    }
    if (files.length === 0) return [];

    // Pass 1 — lê cada arquivo uma única vez: prompt, todos, meta e os
    // dispatches de Agent feitos DENTRO daquele transcript (para aninhados).
    interface FileInfo {
      agentId: string;
      prompt: string | null;
      todos: Todo[];
      updatedAt: number;
      meta: SubAgentMeta | null;
      dispatches: Map<string, Dispatch>;
    }
    const infos: FileInfo[] = [];
    for (const file of files) {
      const filePath = path.join(dir, file);
      const lines = this.readLines(filePath);
      let updatedAt = 0;
      try { updatedAt = fs.statSync(filePath).mtimeMs; } catch { /* ignore */ }
      infos.push({
        agentId: file.slice('agent-'.length, -'.jsonl'.length),
        prompt: this.firstUserPrompt(lines),
        todos: this.readLastTodosFromLines(lines, false) ?? [],
        updatedAt,
        meta: readSubAgentMeta(filePath),
        dispatches: this.collectDispatches(lines, false),
      });
    }

    // Índice global: toolUseId -> dono do transcript onde a invocação vive.
    // Main primeiro (dono = sessionId); first-wins em colisão (defensivo —
    // ids de tool_use são únicos por construção). O ordinal preserva a ordem
    // de invocação para desempate estável na ordenação final.
    const index = new Map<string, { ownerAgentId: string; dispatch: Dispatch; ordinal: number }>();
    let ord = 0;
    for (const [id, d] of this.collectDispatches(this.readLines(mainTranscriptPath), true)) {
      if (!index.has(id)) index.set(id, { ownerAgentId: sessionId, dispatch: d, ordinal: ord++ });
    }
    for (const info of infos) {
      for (const [id, d] of info.dispatches) {
        if (!index.has(id)) index.set(id, { ownerAgentId: info.agentId, dispatch: d, ordinal: ord++ });
      }
    }

    // Pass 2 — casa cada arquivo: meta.toolUseId (exato) ou prompt (legado).
    const pending: { agent: AgentTodos; ordinal: number }[] = [];
    const seen = new Set<string>();
    const usedPromptIds = new Set<string>();

    for (const info of infos) {
      if (seen.has(info.agentId)) continue;

      if (info.meta) {
        const entry = index.get(info.meta.toolUseId);
        if (entry?.dispatch.result === 'rejected') continue;
        const agent: AgentTodos = {
          sessionId,
          agentId: info.agentId,
          name: entry?.dispatch.label ?? info.meta.description ?? info.agentId,
          isMain: false,
          todos: info.todos,
          updatedAt: info.updatedAt,
        };
        if (entry) {
          agent.status = entry.dispatch.result === 'completed' ? 'completed' : 'running';
          agent.parentAgentId = entry.ownerAgentId;
        }
        if (info.meta.agentType !== undefined) agent.agentType = info.meta.agentType;
        if (info.meta.spawnDepth !== undefined) agent.depth = info.meta.spawnDepth;
        seen.add(info.agentId);
        pending.push({ agent, ordinal: entry ? entry.ordinal : Number.MAX_SAFE_INTEGER });
        continue;
      }

      // Legado: casa por prompt exato com uma invocação do MAIN não consumida.
      if (info.prompt === null) continue;
      let matched: { id: string; entry: { ownerAgentId: string; dispatch: Dispatch; ordinal: number } } | null = null;
      for (const [id, entry] of index) {
        if (entry.ownerAgentId !== sessionId || usedPromptIds.has(id)) continue;
        if (entry.dispatch.result === 'rejected') continue;
        if (entry.dispatch.label !== undefined && entry.dispatch.prompt === info.prompt) {
          matched = { id, entry };
          break;
        }
      }
      if (matched === null) continue;
      usedPromptIds.add(matched.id);
      seen.add(info.agentId);
      pending.push({
        agent: {
          sessionId,
          agentId: info.agentId,
          name: matched.entry.dispatch.label!,
          isMain: false,
          status: matched.entry.dispatch.result === 'completed' ? 'completed' : 'running',
          todos: info.todos,
          updatedAt: info.updatedAt,
        },
        ordinal: matched.entry.ordinal,
      });
    }

    pending.sort((a, b) => {
      const ga = this.subAgentGroup(a.agent);
      const gb = this.subAgentGroup(b.agent);
      if (ga !== gb) return ga - gb;
      if (a.agent.updatedAt !== b.agent.updatedAt) return b.agent.updatedAt - a.agent.updatedAt;
      return a.ordinal - b.ordinal;
    });
    return pending.map(p => p.agent);
  }

  // Varre um transcript e devolve os disparos do tool Agent: toolUseId ->
  // {label, prompt, result}. `result` reflete o tool_result correspondente:
  // 'none' = ainda rodando; 'completed' = terminou; 'rejected' = recusado
  // pelo usuário ou morto por erro. `enriched` indica se o transcript recebe
  // o enriquecimento `toolUseResult` (só o transcript principal recebe —
  // transcripts de sub-agents nunca têm esse campo, verificado nos dados
  // reais): quando `enriched`, um tool_result sem `toolUseResult.agentId` é
  // rejeição; quando não, presença de tool_result já basta para 'completed'.
  private collectDispatches(lines: string[], enriched: boolean): Map<string, Dispatch> {
    const out = new Map<string, Dispatch>();
    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === 'tool_use' && block.name === 'Agent' && typeof block.id === 'string') {
          const name = block.input?.name;
          const description = block.input?.description;
          const label = typeof name === 'string' ? name
            : typeof description === 'string' ? description
            : undefined;
          const prompt = block.input?.prompt;
          out.set(block.id, {
            label,
            prompt: typeof prompt === 'string' ? prompt : undefined,
            result: 'none',
          });
        }
        if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          const d = out.get(block.tool_use_id);
          if (d) {
            if (enriched) {
              d.result = typeof entry.toolUseResult?.agentId === 'string' ? 'completed' : 'rejected';
            } else {
              // Transcripts de sub-agents não recebem o enriquecimento
              // toolUseResult; um tool_result presente = o aninhado terminou.
              d.result = 'completed';
            }
          }
        }
      }
    }
    return out;
  }

  private readLines(filePath: string): string[] {
    try {
      return fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return [];
    }
  }

  // Primeiro user message com content string — é o prompt do sub-agent.
  private firstUserPrompt(lines: string[]): string | null {
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

  private subAgentGroup(agent: AgentTodos): number {
    if (agent.status === 'running') return 0;
    if (agent.todos.length > 0) return 1;
    return 2;
  }

  private transcriptPath(sessionId: string, cwd: string): string | null {
    return resolveTranscriptPath(this.claudeDir, sessionId, cwd);
  }

  private subAgentsDir(sessionId: string, cwd: string): string | null {
    return resolveSubAgentsDir(this.claudeDir, sessionId, cwd);
  }

  // Returns the current todo list using whichever schema produced the most
  // recent event in the transcript. Two schemas are supported:
  //   - legacy `TodoWrite`: a single event carrying the full snapshot.
  //   - new `TaskCreate` / `TaskUpdate` (enabled by `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`):
  //     an event stream — TaskCreate adds one task, TaskUpdate mutates a task by id.
  private readLastTodos(transcriptPath: string, skipSidechain: boolean): Todo[] | null {
    return this.readLastTodosFromLines(this.readLines(transcriptPath), skipSidechain);
  }

  private readLastTodosFromLines(lines: string[], skipSidechain: boolean): Todo[] | null {
    if (lines.length === 0) return null;
    const schema = this.detectSchema(lines, skipSidechain);
    if (schema === 'TodoWrite') {
      const todos = this.readLastTodoWriteSnapshot(lines, skipSidechain);
      if (!todos) return null;
      const timings = this.extractTodoWriteTimings(lines, skipSidechain);
      return todos.map(t => {
        const timing = timings.get(t.content);
        return timing
          ? makeTodo(t.content, t.activeForm, t.status, timing.startedAt, timing.completedAt)
          : t;
      });
    }
    if (schema === 'Task') return this.readTaskStream(lines, skipSidechain);
    return null;
  }

  // Varre os snapshots do TodoWrite em ordem cronológica e registra, por
  // `content`, o primeiro instante em que cada task apareceu in_progress e
  // completed (first-write-wins). Casa por `content` por ser estável a
  // reordenações da lista entre snapshots.
  private extractTodoWriteTimings(
    lines: string[],
    skipSidechain: boolean,
  ): Map<string, { startedAt?: number; completedAt?: number }> {
    const timings = new Map<string, { startedAt?: number; completedAt?: number }>();
    // Último status observado por content. Serve para detectar a TRANSIÇÃO para
    // in_progress: quando uma task entra em in_progress vindo de qualquer outro
    // estado (pending, completed, ausente ou nova), começa um novo streak e o
    // timing é zerado — assim uma rodada que reutiliza a mesma descrição não
    // herda o tempo de uma rodada anterior. 'absent' = não estava no snapshot.
    const prevStatus = new Map<string, TodoStatus | 'absent'>();
    for (const line of lines) {
      if (!line || line.indexOf('"name":"TodoWrite"') < 0) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      if (skipSidechain && entry.isSidechain) continue;
      const ts = parseEpoch(entry.timestamp);
      if (ts === undefined) continue;
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type !== 'tool_use' || block.name !== 'TodoWrite') continue;
        const raw = block.input?.todos;
        if (!Array.isArray(raw)) continue;
        const seen = new Set<string>();
        for (const item of raw) {
          if (!this.isValidTodo(item)) continue;
          seen.add(item.content);
          const prev = prevStatus.get(item.content);
          if (item.status === 'in_progress') {
            // Entrou agora em in_progress (não estava in_progress antes) → novo streak.
            if (prev !== 'in_progress') timings.set(item.content, { startedAt: ts });
          } else if (item.status === 'completed') {
            const rec = timings.get(item.content) ?? {};
            if (rec.completedAt === undefined) rec.completedAt = ts;
            timings.set(item.content, rec);
          } else {
            // pending = ainda não começou nesta rodada.
            timings.set(item.content, {});
          }
          prevStatus.set(item.content, item.status);
        }
        // Tasks que sumiram deste snapshot: marca como ausentes para que uma
        // reaparição futura em in_progress conte como novo streak.
        for (const key of prevStatus.keys()) {
          if (!seen.has(key)) prevStatus.set(key, 'absent');
        }
      }
    }
    return timings;
  }

  private detectSchema(lines: string[], skipSidechain: boolean): 'TodoWrite' | 'Task' | null {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      const hasTodoWrite = line.indexOf('"name":"TodoWrite"') >= 0;
      const hasTask = line.indexOf('"name":"TaskCreate"') >= 0 || line.indexOf('"name":"TaskUpdate"') >= 0;
      if (!hasTodoWrite && !hasTask) continue;
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (skipSidechain && entry.isSidechain) continue;
        const content = entry.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (block?.type !== 'tool_use') continue;
          if (block.name === 'TodoWrite') return 'TodoWrite';
          if (block.name === 'TaskCreate' || block.name === 'TaskUpdate') return 'Task';
        }
      } catch { /* skip malformed */ }
    }
    return null;
  }

  private readLastTodoWriteSnapshot(lines: string[], skipSidechain: boolean): Todo[] | null {
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

  private readTaskStream(lines: string[], skipSidechain: boolean): Todo[] {
    const tasks = new Map<string, {
      content: string; activeForm: string; status: TodoStatus;
      startedAt?: number; completedAt?: number;
    }>();
    const order: string[] = [];
    // tool_use_id of TaskCreate awaiting its tool_result, where the assigned id is revealed.
    const pendingCreates = new Map<string, { content: string; activeForm: string }>();

    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      if (skipSidechain && entry.isSidechain) continue;
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block?.type === 'tool_use' && typeof block.id === 'string') {
          if (block.name === 'TaskCreate') {
            const subject = block.input?.subject;
            const activeForm = block.input?.activeForm;
            if (typeof subject === 'string') {
              pendingCreates.set(block.id, {
                content: subject,
                activeForm: typeof activeForm === 'string' ? activeForm : subject,
              });
            }
          } else if (block.name === 'TaskUpdate') {
            const taskId = block.input?.taskId;
            const status = block.input?.status;
            if (typeof taskId === 'string' && typeof status === 'string'
                && VALID_STATUSES.includes(status as TodoStatus)) {
              const t = tasks.get(taskId);
              if (t) {
                t.status = status as TodoStatus;
                const ts = parseEpoch(entry.timestamp);
                if (ts !== undefined) {
                  if (status === 'in_progress' && t.startedAt === undefined) t.startedAt = ts;
                  if (status === 'completed' && t.completedAt === undefined) t.completedAt = ts;
                }
              }
            }
          }
        } else if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          const pending = pendingCreates.get(block.tool_use_id);
          if (!pending) continue;
          const taskId = this.resolveCreatedTaskId(entry, block);
          if (taskId && !tasks.has(taskId)) {
            tasks.set(taskId, { ...pending, status: 'pending' });
            order.push(taskId);
          }
          pendingCreates.delete(block.tool_use_id);
        }
      }
    }

    return order.map(id => {
      const t = tasks.get(id)!;
      return makeTodo(t.content, t.activeForm, t.status, t.startedAt, t.completedAt);
    });
  }

  private resolveCreatedTaskId(entry: TranscriptEntry, block: ContentBlock): string | null {
    const fromResult = entry.toolUseResult?.task?.id;
    if (typeof fromResult === 'string') return fromResult;
    if (typeof block.content === 'string') {
      const match = block.content.match(/Task #(\d+)/);
      if (match) return match[1];
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
