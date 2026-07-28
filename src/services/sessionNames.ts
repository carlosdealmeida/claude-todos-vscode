import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

interface Entry { name: string; updatedAt: number }

// O nome definido por /session-name só existe enquanto o processo vive
// (~/.claude/sessions/{pid}.json some no exit). Guardamos por sessionId para
// que ele sobreviva no picker. Arquivo próprio, ao lado do bridge — não
// workspaceState, que é API do VS Code e não alcança o sidecar do JetBrains.
export class SessionNames {
  constructor(private readonly filePath: string) {}

  private readAll(): Record<string, Entry> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, Entry>
        : {};
    } catch {
      return {};
    }
  }

  private write(all: Record<string, Entry>): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    atomicWriteFileSync(this.filePath, JSON.stringify(all, null, 2));
  }

  get(sessionId: string): string | undefined {
    return this.readAll()[sessionId]?.name;
  }

  remember(sessionId: string, name: string, now: number): void {
    const all = this.readAll();
    if (all[sessionId]?.name === name) return;  // sem I/O quando nada muda
    all[sessionId] = { name, updatedAt: now };
    this.write(all);
  }

  prune(maxAgeMs: number, now: number): void {
    const all = this.readAll();
    const kept: Record<string, Entry> = {};
    let removed = 0;
    for (const [id, entry] of Object.entries(all)) {
      if (now - entry.updatedAt > maxAgeMs) removed++;
      else kept[id] = entry;
    }
    if (removed === 0) return;  // no-op, igual ao BridgeFile.prune
    this.write(kept);
  }
}
