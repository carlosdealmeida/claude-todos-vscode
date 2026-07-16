import type { BridgeFile } from './bridgeFile';
import type { BridgeRecord } from '../types';

export class SessionResolver {
  constructor(
    private readonly bridge: BridgeFile,
    private readonly getWorkspaceCwds: () => string[],
  ) {}

  // União dos registros do bridge de todas as pastas do workspace. Sem
  // ordenação global aqui: quem escolhe a sessão exibida é o SnapshotService,
  // por mtime do transcript.
  resolveCandidates(): BridgeRecord[] {
    const out: BridgeRecord[] = [];
    for (const cwd of this.getWorkspaceCwds()) {
      out.push(...this.bridge.allForCwd(cwd));
    }
    return out;
  }
}
