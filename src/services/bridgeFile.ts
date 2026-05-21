import * as fs from 'fs';
import * as path from 'path';
import type { BridgeRecord } from '../types';

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
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2));
  }

  latestForCwd(cwd: string): BridgeRecord | null {
    const eq = (a: string, b: string) => process.platform === 'win32'
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
    const matches = this.readAll().filter(r => eq(r.cwd, cwd));
    if (!matches.length) return null;
    return matches.reduce((a, b) => (a.startedAt > b.startedAt ? a : b));
  }

  prune(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    const all = this.readAll().filter(r => r.startedAt >= cutoff);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2));
  }
}
