import * as fs from 'fs';
import * as path from 'path';

interface HookEntry {
  type: 'command';
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface Settings {
  hooks?: {
    SessionStart?: HookMatcher[];
    [key: string]: HookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

export class HookInstaller {
  constructor(private readonly settingsPath: string) {}

  install(command: string): void {
    const settings = this.read();
    settings.hooks ??= {};
    settings.hooks.SessionStart ??= [];

    if (this.findCommand(settings, command)) return;

    settings.hooks.SessionStart.push({
      matcher: '*',
      hooks: [{ type: 'command', command }],
    });

    this.write(settings);
  }

  uninstall(command: string): void {
    const settings = this.read();
    if (!settings.hooks?.SessionStart) return;

    settings.hooks.SessionStart = settings.hooks.SessionStart
      .map(entry => ({
        ...entry,
        hooks: entry.hooks.filter(h => h.command !== command),
      }))
      .filter(entry => entry.hooks.length > 0);

    if (settings.hooks.SessionStart.length === 0) {
      delete settings.hooks.SessionStart;
    }
    this.write(settings);
  }

  isInstalled(command: string): boolean {
    return Boolean(this.findCommand(this.read(), command));
  }

  private findCommand(settings: Settings, command: string): HookEntry | undefined {
    return settings.hooks?.SessionStart
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
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }
}
