import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

const DEBOUNCE_MS = 150;

export class TodosWatcher {
  private readonly emitter = new EventEmitter();
  private readonly watchers: fs.FSWatcher[] = [];
  private debounceHandle: NodeJS.Timeout | null = null;

  constructor(claudeDir: string) {
    const projectsDir = path.join(claudeDir, 'projects');
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');

    this.tryWatch(projectsDir, { recursive: true });
    this.tryWatch(bridgeDir, { recursive: false });
  }

  onChange(listener: () => void): { dispose(): void } {
    this.emitter.on('change', listener);
    return { dispose: () => { this.emitter.off('change', listener); } };
  }

  private tryWatch(dir: string, opts: { recursive: boolean }): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const watcher = fs.watch(dir, { persistent: false, recursive: opts.recursive }, () => this.scheduleEmit());
      watcher.on('error', () => { /* ignore */ });
      this.watchers.push(watcher);
    } catch {
      // Recursive watch unsupported on this platform — fall back to non-recursive
      if (opts.recursive) this.tryWatch(dir, { recursive: false });
    }
  }

  private scheduleEmit(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null;
      this.emitter.emit('change');
    }, DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    for (const w of this.watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    this.emitter.removeAllListeners();
  }
}
