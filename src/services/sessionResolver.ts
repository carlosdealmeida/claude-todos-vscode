import type { BridgeFile } from './bridgeFile';
import type { LiveSession } from './liveSessions';
import { belongsToWorkspace } from './workspaceFolders';
import type { BridgeRecord } from '../types';

export class SessionResolver {
  constructor(
    private readonly bridge: BridgeFile,
    private readonly getWorkspaceCwds: () => string[],
  ) {}

  // União dos registros do bridge de todas as pastas do workspace. Sem
  // ordenação global aqui: quem escolhe a sessão exibida é o SnapshotService,
  // por mtime do transcript. A mesma sessão pode vir mais de uma vez, com pastas
  // diferentes: o SnapshotService fica com a primeira cujo transcript existe.
  // O registro vivo vem antes porque o hook só roda no início da sessão, e só ele
  // sabe que ela entrou num worktree depois disso.
  resolveCandidates(live: ReadonlyMap<string, LiveSession> = new Map()): BridgeRecord[] {
    const out: BridgeRecord[] = [];
    for (const cwd of this.getWorkspaceCwds()) {
      for (const session of live.values()) {
        if (!belongsToWorkspace(session.cwd, cwd)) continue;
        out.push({ cwd: session.cwd, sessionId: session.sessionId, terminalPid: null, startedAt: session.startedAt ?? 0 });
      }
      out.push(...this.bridge.allForCwd(cwd));
    }
    return out;
  }
}
