import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeSettingsFile, SettingsParseError } from '../../src/services/claudeSettings';

describe('ClaudeSettingsFile', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads {} when the file does not exist', () => {
    const file = new ClaudeSettingsFile(settingsPath);
    expect(file.exists()).toBe(false);
    expect(file.read()).toEqual({});
  });

  it('setEnv creates the file (and its parent dir) with 2-space indentation', () => {
    const nested = path.join(tmpDir, 'deeper', 'settings.json');
    const file = new ClaudeSettingsFile(nested);
    expect(file.setEnv('CLAUDE_CODE_ENABLE_TODO_TOOLS', '1')).toBe(true);
    expect(fs.readFileSync(nested, 'utf-8'))
      .toBe(JSON.stringify({ env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } }, null, 2));
  });

  it('setEnv preserves every other key and the existing env entries', () => {
    fs.writeFileSync(settingsPath, JSON.stringify(
      { model: 'opus', env: { FOO: 'bar' }, hooks: { SessionStart: [] } }, null, 2));
    new ClaudeSettingsFile(settingsPath).setEnv('CLAUDE_CODE_ENABLE_TODO_TOOLS', '1');
    expect(JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))).toEqual({
      model: 'opus',
      env: { FOO: 'bar', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' },
      hooks: { SessionStart: [] },
    });
  });

  it('setEnv is idempotent: the second call reports no change and does not rewrite', () => {
    const file = new ClaudeSettingsFile(settingsPath);
    expect(file.setEnv('K', '1')).toBe(true);
    const before = fs.statSync(settingsPath).mtimeMs;
    expect(file.setEnv('K', '1')).toBe(false);
    expect(fs.statSync(settingsPath).mtimeMs).toBe(before);
  });

  it('getEnv returns strings, stringifies numbers and booleans, undefined when absent', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { A: '1', B: 0, C: true } }));
    const file = new ClaudeSettingsFile(settingsPath);
    expect(file.getEnv('A')).toBe('1');
    expect(file.getEnv('B')).toBe('0');
    expect(file.getEnv('C')).toBe('true');
    expect(file.getEnv('Z')).toBeUndefined();
  });

  it('throws SettingsParseError on invalid JSON and leaves the file untouched', () => {
    fs.writeFileSync(settingsPath, '{ "env": { "FOO": ');
    const file = new ClaudeSettingsFile(settingsPath);
    expect(() => file.read()).toThrow(SettingsParseError);
    expect(() => file.setEnv('K', '1')).toThrow(SettingsParseError);
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ "env": { "FOO": ');
  });

  it('throws SettingsParseError when the top-level value is not an object', () => {
    fs.writeFileSync(settingsPath, '[1, 2]');
    expect(() => new ClaudeSettingsFile(settingsPath).read()).toThrow(SettingsParseError);
  });
});
