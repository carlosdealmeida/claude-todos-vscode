import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectUsageService } from '../../src/services/projectUsageService';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

describe('ProjectUsageService', () => {
  let claudeDir: string;
  let service: ProjectUsageService;
  const CWD = '/home/user/proj';
  const NOW = Date.now();
  const SINCE = NOW - 7 * 24 * 3600 * 1000;

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-usage-test-'));
    service = new ProjectUsageService(claudeDir);
  });
  afterEach(() => {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  function assistant(model: string, u: Partial<{ input: number; output: number; cacheCreate: number; cacheRead: number }>, sidechain = false): object {
    return {
      type: 'assistant',
      ...(sidechain ? { isSidechain: true } : {}),
      message: {
        model,
        role: 'assistant',
        usage: {
          input_tokens: u.input ?? 0,
          output_tokens: u.output ?? 0,
          cache_creation_input_tokens: u.cacheCreate ?? 0,
          cache_read_input_tokens: u.cacheRead ?? 0,
        },
      },
    };
  }

  function projDir(): string {
    return path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
  }

  function writeSession(sessionId: string, lines: object[], mtimeMs: number): string {
    fs.mkdirSync(projDir(), { recursive: true });
    const p = path.join(projDir(), `${sessionId}.jsonl`);
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
    fs.utimesSync(p, new Date(mtimeMs), new Date(mtimeMs));
    return p;
  }

  function writeSubAgent(sessionId: string, agentId: string, lines: object[]): void {
    const dir = path.join(projDir(), sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `agent-${agentId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n'));
  }

  it('returns zeroed usage when the project dir does not exist', () => {
    expect(service.usageForProject(CWD, SINCE)).toEqual({ sessions: 0, byModel: [] });
  });

  it('aggregates sessions inside the window and ignores older ones', () => {
    writeSession('recent', [assistant('claude-opus-4-8', { input: 100, output: 10 })], NOW - 1000);
    writeSession('old', [assistant('claude-opus-4-8', { input: 999, output: 99 })], SINCE - 24 * 3600 * 1000);
    const usage = service.usageForProject(CWD, SINCE);
    expect(usage.sessions).toBe(1);
    expect(usage.byModel).toEqual([{ model: 'claude-opus-4-8', input: 100, output: 10, cache: 0 }]);
  });

  it('sums sub-agent files of a qualifying session (sidechain rules)', () => {
    writeSession('s1', [
      assistant('claude-opus-4-8', { input: 100, output: 10 }),
      assistant('claude-haiku-4-5', { input: 555, output: 5 }, true), // sidechain no main: ignorada
    ], NOW - 1000);
    writeSubAgent('s1', 'a1', [assistant('claude-haiku-4-5', { input: 30, output: 3, cacheRead: 70 }, true)]);
    const usage = service.usageForProject(CWD, SINCE);
    expect(usage.sessions).toBe(1);
    expect(usage.byModel).toEqual([
      { model: 'claude-opus-4-8', input: 100, output: 10, cache: 0 },
      { model: 'claude-haiku-4-5', input: 30, output: 3, cache: 70 },
    ]);
    expect(usage.cache).toEqual({ input: 130, read: 70, creation: 0 });
  });

  it('a corrupted transcript contributes zero without breaking the aggregate', () => {
    fs.mkdirSync(projDir(), { recursive: true });
    const bad = path.join(projDir(), 'bad.jsonl');
    fs.writeFileSync(bad, 'not json at all\n{broken');
    fs.utimesSync(bad, new Date(NOW - 1000), new Date(NOW - 1000));
    writeSession('good', [assistant('claude-opus-4-8', { input: 10, output: 1 })], NOW - 1000);
    const usage = service.usageForProject(CWD, SINCE);
    expect(usage.sessions).toBe(2); // qualifica por mtime, mesmo sem usage
    expect(usage.byModel).toEqual([{ model: 'claude-opus-4-8', input: 10, output: 1, cache: 0 }]);
  });

  it('memo: same (mtime, size) is NOT re-read; changed mtime is', () => {
    const p = writeSession('s1', [assistant('claude-opus-4-8', { input: 100, output: 10 })], NOW - 5000);
    const stat = fs.statSync(p);
    expect(service.usageForProject(CWD, SINCE).byModel[0].input).toBe(100);

    // Conteúdo diferente com o MESMO tamanho em bytes e mesmo mtime → memo hit
    // (retorna o valor antigo, provando que não releu o arquivo).
    const original = fs.readFileSync(p, 'utf-8');
    const tweaked = original.replace('"input_tokens":100', '"input_tokens":900');
    expect(tweaked.length).toBe(original.length);
    fs.writeFileSync(p, tweaked);
    fs.utimesSync(p, new Date(stat.mtimeMs), new Date(stat.mtimeMs));
    expect(service.usageForProject(CWD, SINCE).byModel[0].input).toBe(100);

    // mtime novo → invalida e relê
    fs.utimesSync(p, new Date(NOW - 1000), new Date(NOW - 1000));
    expect(service.usageForProject(CWD, SINCE).byModel[0].input).toBe(900);
  });

  it('repeated aggregation does not double-count (memo values are not mutated)', () => {
    writeSession('s1', [assistant('claude-opus-4-8', { input: 100, output: 10, cacheRead: 40 })], NOW - 1000);
    const first = service.usageForProject(CWD, SINCE);
    const second = service.usageForProject(CWD, SINCE);
    expect(second).toEqual(first);
    expect(second.byModel).toEqual([{ model: 'claude-opus-4-8', input: 100, output: 10, cache: 40 }]);
  });
});
