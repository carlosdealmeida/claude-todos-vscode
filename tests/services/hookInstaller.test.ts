import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HookInstaller } from '../../src/services/hookInstaller';

describe('HookInstaller', () => {
  let tmpDir: string;
  let settingsPath: string;
  const HOOK_COMMAND = 'node /path/to/sessionStart.js';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates settings.json with hook when file does not exist', () => {
    const installer = new HookInstaller(settingsPath);
    installer.install(HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.hooks.SessionStart[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('preserves existing settings when adding hook', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { FOO: 'bar' } }));
    const installer = new HookInstaller(settingsPath);
    installer.install(HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.env.FOO).toBe('bar');
    expect(parsed.hooks.SessionStart).toBeDefined();
  });

  it('is idempotent — running twice does not duplicate', () => {
    const installer = new HookInstaller(settingsPath);
    installer.install(HOOK_COMMAND);
    installer.install(HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const sessionStartHooks = parsed.hooks.SessionStart;
    const matching = sessionStartHooks
      .flatMap((entry: any) => entry.hooks)
      .filter((h: any) => h.command === HOOK_COMMAND);
    expect(matching).toHaveLength(1);
  });

  it('coexists with user hooks', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo user-hook' }] }]
      }
    }));
    const installer = new HookInstaller(settingsPath);
    installer.install(HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const allCmds = parsed.hooks.SessionStart
      .flatMap((entry: any) => entry.hooks)
      .map((h: any) => h.command);
    expect(allCmds).toContain('echo user-hook');
    expect(allCmds).toContain(HOOK_COMMAND);
  });

  it('detects when hook is installed', () => {
    const installer = new HookInstaller(settingsPath);
    expect(installer.isInstalled(HOOK_COMMAND)).toBe(false);
    installer.install(HOOK_COMMAND);
    expect(installer.isInstalled(HOOK_COMMAND)).toBe(true);
  });

  it('removes hook without touching other settings', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { X: '1' } }));
    const installer = new HookInstaller(settingsPath);
    installer.install(HOOK_COMMAND);
    installer.uninstall(HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.env.X).toBe('1');
    expect(installer.isInstalled(HOOK_COMMAND)).toBe(false);
  });
});
