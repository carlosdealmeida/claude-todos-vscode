import type { SessionResolver } from './sessionResolver';
import type { TodosParser } from './todosParser';
import type { UsageParser } from './usageParser';
import type { AgentTodos, SessionSnapshot, SessionSummary } from '../types';

export class SnapshotService {
  private pinnedSessionId: string | null = null;

  constructor(
    private readonly resolver: SessionResolver,
    private readonly parser: TodosParser,
    private readonly usageParser: UsageParser,
  ) {}

  setPinnedSession(sessionId: string | null): void {
    this.pinnedSessionId = sessionId;
  }

  listSessions(): SessionSummary[] {
    const out: SessionSummary[] = [];
    for (const record of this.resolver.resolveCandidates()) {
      const updatedAt = this.parser.transcriptMtime(record.sessionId, record.cwd);
      if (updatedAt === null) continue;
      out.push({
        sessionId: record.sessionId,
        cwd: record.cwd,
        title: this.resolveTitle(record.sessionId, record.cwd),
        updatedAt,
      });
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  build(): SessionSnapshot | null {
    const sessions = this.listSessions();
    if (sessions.length === 0) return null;

    const pinned = this.pinnedSessionId
      ? sessions.find(s => s.sessionId === this.pinnedSessionId)
      : undefined;
    const chosen = pinned ?? sessions[0];

    const agents = this.parser.listForSession(chosen.sessionId, chosen.cwd);
    // Desacopla "tem sessão" de "tem todo": antes de qualquer TodoWrite, ainda
    // resolvemos o agente main para que tokens/contexto/cache apareçam assim que
    // a sessão tem atividade. A lista visível (`agents`) continua vazia — a UI
    // mostra um estado leve de "aguardando tasks" no lugar da lista.
    const usageAgents: AgentTodos[] = agents.length > 0 ? agents : [{
      sessionId: chosen.sessionId,
      agentId: chosen.sessionId,
      name: 'Main agent',
      isMain: true,
      todos: [],
      updatedAt: 0,
    }];
    return {
      sessionId: chosen.sessionId,
      cwd: chosen.cwd,
      title: chosen.title,
      pinned: pinned !== undefined,
      agents,
      usage: this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents),
    };
  }

  private resolveTitle(sessionId: string, cwd: string): string {
    return this.parser.readSessionTitle(sessionId, cwd) ?? `Session · ${sessionId.slice(0, 8)}`;
  }
}
