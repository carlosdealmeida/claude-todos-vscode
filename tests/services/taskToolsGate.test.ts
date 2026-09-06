import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  TASK_TOOLS_ENV, TaskToolsFlagReader, combineFlagStates, evaluateTaskTools,
  flagStateOf, modelLosesTaskTools, parseVersion, versionAtLeast,
} from '../../src/services/taskToolsGate';

describe('versionAtLeast', () => {
  it('parses major.minor.patch and ignores suffixes', () => {
    expect(parseVersion('2.1.233')).toEqual([2, 1, 233]);
    expect(parseVersion('2.1.233-beta.1')).toEqual([2, 1, 233]);
    expect(parseVersion('dev')).toBeNull();
  });

  it('compares numerically per component', () => {
    expect(versionAtLeast('2.1.232', '2.1.233')).toBe(false);
    expect(versionAtLeast('2.1.233', '2.1.233')).toBe(true);
    expect(versionAtLeast('2.1.261', '2.1.233')).toBe(true);
    expect(versionAtLeast('2.2.0', '2.1.233')).toBe(true);
    expect(versionAtLeast('10.0.0', '2.1.233')).toBe(true);
    expect(versionAtLeast('2.1.9', '2.1.233')).toBe(false);
  });

  it('is false for missing or unparseable versions', () => {
    expect(versionAtLeast(undefined, '2.1.233')).toBe(false);
    expect(versionAtLeast('', '2.1.233')).toBe(false);
    expect(versionAtLeast('nope', '2.1.233')).toBe(false);
  });
});

describe('modelLosesTaskTools', () => {
  it.each([
    'claude-opus-4-8', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-fable-5-1',
    'claude-mythos-5-1', 'claude-opus-6',
  ])('%s loses the tools', (model) => {
    expect(modelLosesTaskTools(model)).toBe(true);
  });

  it.each([
    'claude-opus-4-7', 'claude-opus-4-1-20250805', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
  ])('%s keeps the tools', (model) => {
    expect(modelLosesTaskTools(model)).toBe(false);
  });

  it('is false for an unknown model', () => {
    expect(modelLosesTaskTools(undefined)).toBe(false);
    expect(modelLosesTaskTools('')).toBe(false);
  });
});

describe('flagStateOf / combineFlagStates', () => {
  it('maps values to states case-insensitively', () => {
    expect(flagStateOf('1')).toBe('on');
    expect(flagStateOf('TRUE')).toBe('on');
    expect(flagStateOf(true)).toBe('on');
    expect(flagStateOf('0')).toBe('off');
    expect(flagStateOf('false')).toBe('off');
    expect(flagStateOf(0)).toBe('off');
    expect(flagStateOf(undefined)).toBe('absent');
    expect(flagStateOf(null)).toBe('absent');
    expect(flagStateOf('')).toBe('absent');
    expect(flagStateOf('yes')).toBe('absent');
  });

  it('any on wins, then any off, else absent', () => {
    expect(combineFlagStates(['absent', 'off', 'on'])).toBe('on');
    expect(combineFlagStates(['absent', 'off'])).toBe('off');
    expect(combineFlagStates(['absent', 'absent'])).toBe('absent');
    expect(combineFlagStates([])).toBe('absent');
  });
});

describe('evaluateTaskTools', () => {
  const fable = { version: '2.1.261', model: 'claude-fable-5-1' };

  it('is true only for harness >= 2.1.233, a new model and an absent flag', () => {
    expect(evaluateTaskTools({ ...fable, flag: 'absent' })).toBe(true);
    expect(evaluateTaskTools({ version: '2.1.233', model: 'claude-opus-4-8', flag: 'absent' })).toBe(true);
  });

  it('is false before the cut, for legacy models, or without signals', () => {
    expect(evaluateTaskTools({ version: '2.1.232', model: 'claude-fable-5-1', flag: 'absent' })).toBe(false);
    expect(evaluateTaskTools({ version: '2.1.261', model: 'claude-opus-4-7', flag: 'absent' })).toBe(false);
    expect(evaluateTaskTools({ model: 'claude-fable-5-1', flag: 'absent' })).toBe(false);
    expect(evaluateTaskTools({ version: '2.1.261', flag: 'absent' })).toBe(false);
  });

  it('is false when the user turned the flag on or explicitly off', () => {
    expect(evaluateTaskTools({ ...fable, flag: 'on' })).toBe(false);
    expect(evaluateTaskTools({ ...fable, flag: 'off' })).toBe(false);
  });
});

describe('TaskToolsFlagReader', () => {
  let tmp: string;
  let userSettings: string;
  let cwd: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flag-test-'));
    userSettings = path.join(tmp, 'claude', 'settings.json');
    cwd = path.join(tmp, 'proj');
    fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  it('is absent when no source has the key (missing files included)', () => {
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('absent');
    expect(new TaskToolsFlagReader(userSettings, {}).read(null)).toBe('absent');
  });

  it('reads the user settings file', () => {
    writeJson(userSettings, { env: { [TASK_TOOLS_ENV]: '1' } });
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('on');
  });

  it('reads the project settings and settings.local files', () => {
    writeJson(path.join(cwd, '.claude', 'settings.json'), { env: { [TASK_TOOLS_ENV]: 'true' } });
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('on');
    fs.rmSync(path.join(cwd, '.claude', 'settings.json'));
    writeJson(path.join(cwd, '.claude', 'settings.local.json'), { env: { [TASK_TOOLS_ENV]: '0' } });
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('off');
  });

  it('reads the process environment and lets on win over off', () => {
    writeJson(userSettings, { env: { [TASK_TOOLS_ENV]: '0' } });
    expect(new TaskToolsFlagReader(userSettings, { [TASK_TOOLS_ENV]: '1' }).read(cwd)).toBe('on');
  });

  it('treats an unreadable file as absent', () => {
    fs.mkdirSync(path.dirname(userSettings), { recursive: true });
    fs.writeFileSync(userSettings, '{ broken');
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('absent');
  });

  it('memoizes by mtime and invalidate() forces a re-read', () => {
    // mtime fixado com precisao de ms ANTES da primeira leitura: mtimeMs real tem
    // precisao sub-ms e nao sobreviveria a um restore via Date.
    const fixed = new Date('2026-09-05T12:00:00Z');
    writeJson(userSettings, { env: { [TASK_TOOLS_ENV]: '1' } });
    fs.utimesSync(userSettings, fixed, fixed);
    const reader = new TaskToolsFlagReader(userSettings, {});
    expect(reader.read(cwd)).toBe('on');
    // Reescreve sem a flag mas mantem o mesmo mtime: o memo ainda responde 'on'.
    writeJson(userSettings, { env: {} });
    fs.utimesSync(userSettings, fixed, fixed);
    expect(reader.read(cwd)).toBe('on');
    reader.invalidate();
    expect(reader.read(cwd)).toBe('absent');
  });
});
