import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UsageParser, contextLimitFor, readFileUsage } from '../../src/services/usageParser';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

interface AgentRef { agentId: string; name: string; isMain: boolean; }

describe('UsageParser', () => {
  let claudeDir: string;
  let parser: UsageParser;
  const CWD = '/home/user/proj';
  const SID = 's1';

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'));
    parser = new UsageParser(claudeDir);
  });
  afterEach(() => {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  function assistant(model: string, u: Partial<{ input: number; output: number; cacheCreate: number; cacheRead: number }>): object {
    return {
      type: 'assistant',
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

  function writeMain(lines: object[]): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${SID}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n'));
  }

  function writeSubAgent(agentId: string, lines: object[]): void {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), SID, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `agent-${agentId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n'));
  }

  const mainRef: AgentRef = { agentId: SID, name: 'Main agent', isMain: true };

  it('returns empty usage when nothing exists', () => {
    const usage = parser.usageForSession(SID, CWD, []);
    expect(usage.byModel).toEqual([]);
    expect(usage.byAgent).toEqual([]);
  });

  it('sums input/output/cache for a single model on the main transcript', () => {
    writeMain([
      assistant('claude-opus-4-8', { input: 100, output: 10, cacheCreate: 200, cacheRead: 5 }),
      assistant('claude-opus-4-8', { input: 50, output: 20, cacheCreate: 0, cacheRead: 300 }),
    ]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.byModel).toEqual([
      { model: 'claude-opus-4-8', input: 150, output: 30, cache: 505 },
    ]);
    expect(usage.byAgent).toHaveLength(1);
    expect(usage.byAgent[0]).toMatchObject({ agentId: SID, name: 'Main agent', isMain: true });
    expect(usage.byAgent[0].models).toEqual([
      { model: 'claude-opus-4-8', input: 150, output: 30, cache: 505 },
    ]);
  });

  it('groups two models within the same transcript', () => {
    writeMain([
      assistant('claude-opus-4-8', { input: 100, output: 10 }),
      assistant('claude-haiku-4-5', { input: 30, output: 5 }),
      assistant('claude-opus-4-8', { input: 20, output: 2 }),
    ]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.byModel).toEqual([
      { model: 'claude-opus-4-8', input: 120, output: 12, cache: 0 },
      { model: 'claude-haiku-4-5', input: 30, output: 5, cache: 0 },
    ]);
  });

  it('separates per-agent and consolidates byModel across main + sub-agents', () => {
    writeMain([assistant('claude-opus-4-8', { input: 100, output: 10 })]);
    writeSubAgent('aaa', [assistant('claude-sonnet-4-6', { input: 40, output: 8 })]);
    const agents: AgentRef[] = [
      mainRef,
      { agentId: 'aaa', name: 'explorer', isMain: false },
    ];
    const usage = parser.usageForSession(SID, CWD, agents);
    expect(usage.byAgent.map(a => a.name)).toEqual(['Main agent', 'explorer']);
    expect(usage.byAgent[1].models).toEqual([
      { model: 'claude-sonnet-4-6', input: 40, output: 8, cache: 0 },
    ]);
    expect(usage.byModel).toEqual([
      { model: 'claude-opus-4-8', input: 100, output: 10, cache: 0 },
      { model: 'claude-sonnet-4-6', input: 40, output: 8, cache: 0 },
    ]);
  });

  it('cache column is creation + read', () => {
    writeMain([assistant('claude-opus-4-8', { cacheCreate: 1000, cacheRead: 250 })]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.byModel[0].cache).toBe(1250);
  });

  it('ignores malformed lines and entries without usage/model', () => {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${SID}.jsonl`), [
      'not json',
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-8' } }), // no usage
      JSON.stringify(assistant('claude-opus-4-8', { input: 7, output: 1 })),
    ].join('\n'));
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.byModel).toEqual([
      { model: 'claude-opus-4-8', input: 7, output: 1, cache: 0 },
    ]);
  });

  it('omits an agent whose transcript file is missing', () => {
    writeMain([assistant('claude-opus-4-8', { input: 5 })]);
    const agents: AgentRef[] = [
      mainRef,
      { agentId: 'ghost', name: 'gone', isMain: false },
    ];
    const usage = parser.usageForSession(SID, CWD, agents);
    expect(usage.byAgent.map(a => a.name)).toEqual(['Main agent']);
  });

  it('omits a sub-agent whose transcript exists but has no usage entries', () => {
    writeMain([assistant('claude-opus-4-8', { input: 5 })]);
    writeSubAgent('aaa', [{ type: 'user', message: { role: 'user', content: 'oi' } }]);
    const agents: AgentRef[] = [
      mainRef,
      { agentId: 'aaa', name: 'explorer', isMain: false },
    ];
    const usage = parser.usageForSession(SID, CWD, agents);
    expect(usage.byAgent.map(a => a.name)).toEqual(['Main agent']);
  });

  it('treats missing token fields as zero', () => {
    writeMain([{ type: 'assistant', message: { model: 'claude-opus-4-8', role: 'assistant', usage: { output_tokens: 4 } } }]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.byModel[0]).toEqual({ model: 'claude-opus-4-8', input: 0, output: 4, cache: 0 });
  });

  it('skips isSidechain entries in the main transcript (no double-count)', () => {
    writeMain([
      { ...assistant('claude-opus-4-8', { input: 100, output: 10 }), isSidechain: false },
      { ...assistant('claude-sonnet-4-6', { input: 999, output: 999 }), isSidechain: true },
    ]);
    const usage = parser.usageForSession(SID, CWD, [mainRef]);
    expect(usage.byModel).toEqual([
      { model: 'claude-opus-4-8', input: 100, output: 10, cache: 0 },
    ]);
  });

  it('counts isSidechain assistant entries inside a sub-agent file', () => {
    writeMain([assistant('claude-opus-4-8', { input: 10, output: 1 })]);
    writeSubAgent('aaa', [
      { ...assistant('claude-sonnet-4-6', { input: 40, output: 8 }), isSidechain: true },
    ]);
    const agents = [mainRef, { agentId: 'aaa', name: 'explorer', isMain: false }];
    const usage = parser.usageForSession(SID, CWD, agents as any);
    expect(usage.byAgent.map(a => a.name)).toEqual(['Main agent', 'explorer']);
    expect(usage.byAgent[1].models).toEqual([
      { model: 'claude-sonnet-4-6', input: 40, output: 8, cache: 0 },
    ]);
  });

  describe('context window usage', () => {
    it('reads context from the last usage-bearing message of the main transcript', () => {
      writeMain([
        assistant('claude-opus-4-8', { input: 100, cacheCreate: 200, cacheRead: 50 }),
        assistant('claude-opus-4-8', { input: 1000, output: 30, cacheCreate: 2000, cacheRead: 5000 }),
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      // última msg: input 1000 + cacheRead 5000 + cacheCreate 2000 = 8000 (output ignorado)
      expect(usage.context).toEqual({ tokens: 8000, limit: 1_000_000 });
    });

    it('detects the 1M window from the model id', () => {
      writeMain([assistant('claude-opus-4-8[1m]', { input: 10, cacheRead: 5 })]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 15, limit: 1_000_000 });
    });

    it('ignores sidechain entries when picking the last message', () => {
      writeMain([
        { ...assistant('claude-opus-4-8', { input: 100, cacheRead: 50 }), isSidechain: false },
        { ...assistant('claude-sonnet-4-6', { input: 9999, cacheRead: 9999 }), isSidechain: true },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 150, limit: 1_000_000 });
    });

    it('elevates a 200k-family model to 1M when the observed context exceeds 200k', () => {
      writeMain([assistant('claude-haiku-4-5', { cacheRead: 250_000 })]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 250_000, limit: 1_000_000 });
    });

    it('leaves context undefined when the transcript has no usage', () => {
      const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${SID}.jsonl`),
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
      );
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toBeUndefined();
    });
  });

  describe('cache stats', () => {
    it('aggregates input/read/creation across main and sub-agents', () => {
      writeMain([assistant('claude-opus-4-8', { input: 10, cacheRead: 100, cacheCreate: 5 })]);
      writeSubAgent('aaa', [assistant('claude-sonnet-4-6', { input: 4, cacheRead: 40, cacheCreate: 2 })]);
      const agents = [mainRef, { agentId: 'aaa', name: 'explorer', isMain: false }];
      const usage = parser.usageForSession(SID, CWD, agents);
      expect(usage.cache).toEqual({ input: 14, read: 140, creation: 7 });
    });

    it('skips sidechain entries in the main transcript (no double-count)', () => {
      writeMain([
        { ...assistant('claude-opus-4-8', { input: 10, cacheRead: 100 }), isSidechain: false },
        { ...assistant('claude-sonnet-4-6', { input: 999, cacheRead: 999 }), isSidechain: true },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.cache).toEqual({ input: 10, read: 100, creation: 0 });
    });

    it('keeps cache defined with read/creation 0 when there is input but no cache yet', () => {
      writeMain([assistant('claude-opus-4-8', { input: 5 })]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.cache).toEqual({ input: 5, read: 0, creation: 0 });
    });

    it('leaves cache undefined when there is no usage', () => {
      const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${SID}.jsonl`),
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }));
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.cache).toBeUndefined();
    });
  });

  describe('readFileUsage (função exportada)', () => {
    it('reads models and cache from a file, honoring skipSidechain', () => {
      writeMain([
        assistant('claude-opus-4-8', { input: 100, output: 10, cacheCreate: 200, cacheRead: 5 }),
        { ...assistant('claude-haiku-4-5', { input: 999, output: 9 }), isSidechain: true },
      ]);
      const filePath = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), `${SID}.jsonl`);
      const withSkip = readFileUsage(filePath, true);
      expect(withSkip.models).toEqual([{ model: 'claude-opus-4-8', input: 100, output: 10, cache: 205 }]);
      expect(withSkip.cache).toEqual({ input: 100, read: 5, creation: 200 });
      const withoutSkip = readFileUsage(filePath, false);
      expect(withoutSkip.models).toHaveLength(2);
    });

    it('returns empty usage for a missing file', () => {
      expect(readFileUsage(path.join(claudeDir, 'nope.jsonl'), true))
        .toEqual({ models: [], cache: { input: 0, read: 0, creation: 0 } });
    });
  });
});

describe('contextLimitFor', () => {
  it('detects 1M for opus/sonnet generation 4+ by family', () => {
    expect(contextLimitFor('claude-opus-4-8')).toBe(1_000_000);
    expect(contextLimitFor('claude-sonnet-4-6')).toBe(1_000_000);
  });
  it('detects 1M from an explicit 1m suffix', () => {
    expect(contextLimitFor('claude-opus-4-8[1m]')).toBe(1_000_000);
    expect(contextLimitFor('claude-sonnet-4-6-1M')).toBe(1_000_000);
  });
  it('keeps 200k for haiku and pre-4 families', () => {
    expect(contextLimitFor('claude-haiku-4-5')).toBe(200_000);
    expect(contextLimitFor('claude-3-5-sonnet-20241022')).toBe(200_000);
  });
  it('elevates to 1M when observed tokens exceed 200k (evidence)', () => {
    expect(contextLimitFor('claude-haiku-4-5', 250_000)).toBe(1_000_000);
    expect(contextLimitFor('claude-haiku-4-5', 50_000)).toBe(200_000);
    expect(contextLimitFor('totally-unknown', 300_000)).toBe(1_000_000);
  });
});
