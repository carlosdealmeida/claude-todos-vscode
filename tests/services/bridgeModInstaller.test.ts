import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeModInstaller, PLUGIN_DIRS_ENV, splitPluginDirs } from '../../src/services/bridgeModInstaller';
import { ClaudeSettingsFile } from '../../src/services/claudeSettings';

const FILES = {
  '.claude-plugin/plugin.json': '{"name":"claude-todos-bridge","version":"9.9.9"}\n',
  'hooks/hooks.json': '{"modules":["./register.ts"]}\n',
  'hooks/register.ts': 'export const register = () => {}\n',
  'hooks/state.ts': 'export const BRIDGE_SCHEMA = 1;\n',
};

describe('BridgeModInstaller', () => {
  let claudeDir: string;
  let settingsPath: string;
  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-mod-'));
    settingsPath = path.join(claudeDir, 'settings.json');
  });
  afterEach(() => fs.rmSync(claudeDir, { recursive: true, force: true }));

  const make = (files: Record<string, string> = FILES, now = 1_000) =>
    new BridgeModInstaller(claudeDir, new ClaudeSettingsFile(settingsPath), { files, now: () => now, delimiter: ';' });
  const settings = () => JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  const modDir = () => path.join(claudeDir, '.vscode-todos-bridge', 'mod', 'claude-todos-bridge');

  it('installs into a missing settings.json: files, env entry and install time', () => {
    expect(make().install()).toEqual({ changed: true, path: settingsPath });
    expect(settings()).toEqual({ env: { [PLUGIN_DIRS_ENV]: modDir() } });
    expect(fs.readFileSync(path.join(modDir(), 'hooks', 'register.ts'), 'utf-8')).toBe(FILES['hooks/register.ts']);
    expect(make().status()).toEqual({ installed: true, installedAt: 1_000 });
  });

  it("keeps the user's plugin dirs and other settings", () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus', env: { [PLUGIN_DIRS_ENV]: 'D:\\mine;E:\\other', FOO: '1' } }));
    make().install();
    expect(settings()).toEqual({ model: 'opus', env: { [PLUGIN_DIRS_ENV]: `D:\\mine;E:\\other;${modDir()}`, FOO: '1' } });
  });

  it('is idempotent: a second install neither duplicates the entry nor moves the install time', () => {
    make(FILES, 1_000).install();
    expect(make(FILES, 2_000).install().changed).toBe(false);
    expect(splitPluginDirs(settings().env[PLUGIN_DIRS_ENV], ';')).toEqual([modDir()]);
    expect(make().status().installedAt).toBe(1_000);
  });

  it('throws on an invalid settings.json and writes nothing', () => {
    fs.writeFileSync(settingsPath, '{ broken');
    expect(() => make().install()).toThrow(/not valid JSON/);
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ broken');
    expect(fs.existsSync(modDir())).toBe(false);
  });

  it('refuses a non-string plugin dirs value instead of overwriting it', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { [PLUGIN_DIRS_ENV]: 42 } }));
    expect(() => make().install()).toThrow(/is not a string/);
    expect(settings()).toEqual({ env: { [PLUGIN_DIRS_ENV]: 42 } });
  });

  it('uninstall removes only our entry and the mod folder', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { [PLUGIN_DIRS_ENV]: 'D:\\mine', FOO: '1' } }));
    make().install();
    expect(make().uninstall()).toEqual({ changed: true, path: settingsPath });
    expect(settings()).toEqual({ env: { [PLUGIN_DIRS_ENV]: 'D:\\mine', FOO: '1' } });
    expect(fs.existsSync(path.dirname(modDir()))).toBe(false);
    expect(make().status()).toEqual({ installed: false });
  });

  it('uninstall restores a settings.json that had no env at all', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus' }));
    make().install();
    make().uninstall();
    expect(settings()).toEqual({ model: 'opus' });
  });

  it('uninstall without an install changes nothing in settings.json', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus' }));
    expect(make().uninstall().changed).toBe(false);
    expect(settings()).toEqual({ model: 'opus' });
  });

  it('status is false when the entry exists but the folder is gone, and on an invalid settings.json', () => {
    make().install();
    fs.rmSync(modDir(), { recursive: true, force: true });
    expect(make().status()).toEqual({ installed: false });
    fs.writeFileSync(settingsPath, '{ broken');
    expect(make().status()).toEqual({ installed: false });
  });

  it('refresh rewrites only the files that changed, and only when installed', () => {
    make().refresh();
    expect(fs.existsSync(modDir())).toBe(false);
    make().install();
    const registerPath = path.join(modDir(), 'hooks', 'register.ts');
    const old = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(registerPath, old, old);
    make({ ...FILES, 'hooks/state.ts': 'export const BRIDGE_SCHEMA = 2;\n' }).refresh();
    expect(fs.readFileSync(path.join(modDir(), 'hooks', 'state.ts'), 'utf-8')).toBe('export const BRIDGE_SCHEMA = 2;\n');
    expect(fs.statSync(registerPath).mtimeMs).toBe(old.getTime());
  });

  // Review Focus 1
  it('matches our entry regardless of case and separators on Windows', () => {
    if (process.platform !== 'win32') return;
    fs.mkdirSync(path.join(modDir(), '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(modDir(), '.claude-plugin', 'plugin.json'), '{}');
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { [PLUGIN_DIRS_ENV]: modDir().toUpperCase().replace(/\\/g, '/') } }));
    expect(make().status().installed).toBe(true);
    expect(make().install().changed).toBe(false);
    expect(make().uninstall().changed).toBe(true);
    expect(settings()).toEqual({});
  });
});
