import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const DEBOUNCE_MS = 150;

export class TodosWatcher implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onChange = this.emitter.event;
  private readonly watchers: fs.FSWatcher[] = [];
  private debounceHandle: NodeJS.Timeout | null = null;

  constructor(claudeDir: string) {
    const todosDir = path.join(claudeDir, 'todos');
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');

    for (const dir of [todosDir, bridgeDir]) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const watcher = fs.watch(dir, { persistent: false }, () => this.scheduleEmit());
        watcher.on('error', () => { /* ignore — watcher dies gracefully */ });
        this.watchers.push(watcher);
      } catch {
        // If we can't watch (perms, OS quirk), continue — manual refresh still works.
      }
    }
  }

  private scheduleEmit(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null;
      this.emitter.fire();
    }, DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    for (const w of this.watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    this.emitter.dispose();
  }
}
