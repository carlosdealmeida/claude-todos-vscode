import * as fs from 'fs';
import * as path from 'path';
import type { BridgeRecord } from '../types';
import { atomicWriteFileSync } from './atomicWrite';

export class BridgeFile {
  constructor(private readonly filePath: string) {}

  readAll(): BridgeRecord[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  append(record: BridgeRecord): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const all = this.readAll();
    all.push(record);
    atomicWriteFileSync(this.filePath, JSON.stringify(all, null, 2));
  }

  latestForCwd(cwd: string): BridgeRecord | null {
    const matches = this.allForCwd(cwd);
    return matches[0] ?? null;
  }

  allForCwd(cwd: string): BridgeRecord[] {
    const eq = (a: string, b: string) => process.platform === 'win32'
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
    return this.readAll()
      .filter(r => eq(r.cwd, cwd))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  // No-op quando não há nada a remover: evita reescrever o arquivo à toa e
  // encolhe a janela de lost-update com o hook que faz append concorrente.
  prune(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    const all = this.readAll();
    const kept = all.filter(r => r.startedAt >= cutoff);
    if (kept.length === all.length) return;
    atomicWriteFileSync(this.filePath, JSON.stringify(kept, null, 2));
  }
}
