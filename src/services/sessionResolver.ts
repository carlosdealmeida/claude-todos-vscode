import type { BridgeFile } from './bridgeFile';
import type { BridgeRecord } from '../types';

export class SessionResolver {
  constructor(
    private readonly bridge: BridgeFile,
    private readonly getWorkspaceCwd: () => string | null,
  ) {}

  resolve(): BridgeRecord | null {
    const cwd = this.getWorkspaceCwd();
    if (!cwd) return null;
    return this.bridge.latestForCwd(cwd);
  }

  resolveCandidates(): BridgeRecord[] {
    const cwd = this.getWorkspaceCwd();
    if (!cwd) return [];
    return this.bridge.allForCwd(cwd);
  }
}
