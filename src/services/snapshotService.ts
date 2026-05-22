import type { SessionResolver } from './sessionResolver';
import type { TodosParser } from './todosParser';
import type { SessionSnapshot, SessionSummary } from '../types';

export class SnapshotService {
  private pinnedSessionId: string | null = null;

  constructor(
    private readonly resolver: SessionResolver,
    private readonly parser: TodosParser,
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

    return {
      sessionId: chosen.sessionId,
      cwd: chosen.cwd,
      title: chosen.title,
      pinned: pinned !== undefined,
      agents: this.parser.listForSession(chosen.sessionId, chosen.cwd),
    };
  }

  private resolveTitle(sessionId: string, cwd: string): string {
    return this.parser.readSessionTitle(sessionId, cwd) ?? `Session · ${sessionId.slice(0, 8)}`;
  }
}
