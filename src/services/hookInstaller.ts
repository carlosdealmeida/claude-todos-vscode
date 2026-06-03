import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

interface HookEntry {
  type: 'command';
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface Settings {
  hooks?: Record<string, HookMatcher[] | undefined>;
  [key: string]: unknown;
}

export type HookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'SessionEnd' | string;

export class HookInstaller {
  constructor(private readonly settingsPath: string) {}

  install(event: HookEvent, command: string): void {
    const settings = this.read();
    settings.hooks ??= {};
    settings.hooks[event] ??= [];

    if (this.findCommand(settings, event, command)) return;

    settings.hooks[event]!.push({
      matcher: '*',
      hooks: [{ type: 'command', command }],
    });

    this.write(settings);
  }

  installAll(events: HookEvent[], command: string): void {
    for (const event of events) this.install(event, command);
  }

  uninstall(event: HookEvent, command: string): void {
    const settings = this.read();
    const entries = settings.hooks?.[event];
    if (!entries) return;

    settings.hooks![event] = entries
      .map(entry => ({
        ...entry,
        hooks: entry.hooks.filter(h => h.command !== command),
      }))
      .filter(entry => entry.hooks.length > 0);

    if (settings.hooks![event]!.length === 0) {
      delete settings.hooks![event];
    }
    this.write(settings);
  }

  uninstallAll(events: HookEvent[], command: string): void {
    for (const event of events) this.uninstall(event, command);
  }

  // Removes hooks whose command matches a regex AND differs from `keepCommand`.
  // Use to clean up stale entries pointing to old versioned extension paths
  // after the extension moves to a stable hook location.
  cleanupLegacyHooks(events: HookEvent[], legacyPattern: RegExp, keepCommand: string): number {
    const settings = this.read();
    if (!settings.hooks) return 0;
    let removed = 0;
    for (const event of events) {
      const entries = settings.hooks[event];
      if (!entries) continue;
      settings.hooks[event] = entries
        .map(entry => ({
          ...entry,
          hooks: entry.hooks.filter(h => {
            if (h.command === keepCommand) return true;
            if (legacyPattern.test(h.command)) {
              removed++;
              return false;
            }
            return true;
          }),
        }))
        .filter(entry => entry.hooks.length > 0);
      if (settings.hooks[event]!.length === 0) delete settings.hooks[event];
    }
    if (removed > 0) this.write(settings);
    return removed;
  }

  isInstalled(event: HookEvent, command: string): boolean {
    return Boolean(this.findCommand(this.read(), event, command));
  }

  areAllInstalled(events: HookEvent[], command: string): boolean {
    const settings = this.read();
    return events.every(e => this.findCommand(settings, e, command));
  }

  private findCommand(settings: Settings, event: HookEvent, command: string): HookEntry | undefined {
    return settings.hooks?.[event]
      ?.flatMap(entry => entry.hooks)
      .find(h => h.command === command);
  }

  private read(): Settings {
    if (!fs.existsSync(this.settingsPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private write(settings: Settings): void {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    atomicWriteFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }
}
