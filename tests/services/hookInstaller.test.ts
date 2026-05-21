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
    installer.install('SessionStart', HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.hooks.SessionStart[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('preserves existing settings when adding hook', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { FOO: 'bar' } }));
    const installer = new HookInstaller(settingsPath);
    installer.install('SessionStart', HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.env.FOO).toBe('bar');
    expect(parsed.hooks.SessionStart).toBeDefined();
  });

  it('is idempotent — running twice does not duplicate', () => {
    const installer = new HookInstaller(settingsPath);
    installer.install('SessionStart', HOOK_COMMAND);
    installer.install('SessionStart', HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const matching = parsed.hooks.SessionStart
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
    installer.install('SessionStart', HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const allCmds = parsed.hooks.SessionStart
      .flatMap((entry: any) => entry.hooks)
      .map((h: any) => h.command);
    expect(allCmds).toContain('echo user-hook');
    expect(allCmds).toContain(HOOK_COMMAND);
  });

  it('detects when hook is installed', () => {
    const installer = new HookInstaller(settingsPath);
    expect(installer.isInstalled('SessionStart', HOOK_COMMAND)).toBe(false);
    installer.install('SessionStart', HOOK_COMMAND);
    expect(installer.isInstalled('SessionStart', HOOK_COMMAND)).toBe(true);
  });

  it('removes hook without touching other settings', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { X: '1' } }));
    const installer = new HookInstaller(settingsPath);
    installer.install('SessionStart', HOOK_COMMAND);
    installer.uninstall('SessionStart', HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.env.X).toBe('1');
    expect(installer.isInstalled('SessionStart', HOOK_COMMAND)).toBe(false);
  });

  it('installs across multiple events via installAll', () => {
    const installer = new HookInstaller(settingsPath);
    installer.installAll(['SessionStart', 'UserPromptSubmit'], HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.hooks.SessionStart[0].hooks[0].command).toBe(HOOK_COMMAND);
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('areAllInstalled reports false until every event is installed', () => {
    const installer = new HookInstaller(settingsPath);
    const events = ['SessionStart', 'UserPromptSubmit'];
    expect(installer.areAllInstalled(events, HOOK_COMMAND)).toBe(false);
    installer.install('SessionStart', HOOK_COMMAND);
    expect(installer.areAllInstalled(events, HOOK_COMMAND)).toBe(false);
    installer.install('UserPromptSubmit', HOOK_COMMAND);
    expect(installer.areAllInstalled(events, HOOK_COMMAND)).toBe(true);
  });

  it('uninstallAll removes hook from every event', () => {
    const installer = new HookInstaller(settingsPath);
    installer.installAll(['SessionStart', 'UserPromptSubmit'], HOOK_COMMAND);
    installer.uninstallAll(['SessionStart', 'UserPromptSubmit'], HOOK_COMMAND);
    expect(installer.areAllInstalled(['SessionStart', 'UserPromptSubmit'], HOOK_COMMAND)).toBe(false);
  });

  it('UserPromptSubmit hook coexists with other user hooks on different events', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'some-other' }] }]
      }
    }));
    const installer = new HookInstaller(settingsPath);
    installer.install('UserPromptSubmit', HOOK_COMMAND);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('some-other');
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toBe(HOOK_COMMAND);
  });
});
