import type { SessionResolver } from './sessionResolver';
import type { TodosParser } from './todosParser';
import type { SessionSnapshot } from '../types';

export class SnapshotService {
  constructor(
    private readonly resolver: SessionResolver,
    private readonly parser: TodosParser,
  ) {}

  build(): SessionSnapshot | null {
    const record = this.resolver.resolve();
    if (!record) return null;
    return {
      sessionId: record.sessionId,
      cwd: record.cwd,
      agents: this.parser.listForSession(record.sessionId, record.cwd),
    };
  }
}
