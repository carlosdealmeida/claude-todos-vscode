import type { SessionResolver } from './sessionResolver';
import type { TodosParser } from './todosParser';
import type { SessionSnapshot } from '../types';

export class SnapshotService {
  constructor(
    private readonly resolver: SessionResolver,
    private readonly parser: TodosParser,
  ) {}

  build(): SessionSnapshot | null {
    const candidates = this.resolver.resolveCandidates();
    for (const record of candidates) {
      if (!this.parser.hasTranscript(record.sessionId, record.cwd)) continue;
      return {
        sessionId: record.sessionId,
        cwd: record.cwd,
        agents: this.parser.listForSession(record.sessionId, record.cwd),
      };
    }
    return null;
  }
}
