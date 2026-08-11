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

    it('context ignores a trailing synthetic entry', () => {
      writeMain([
        assistant('claude-opus-4-8', { input: 100, output: 10, cacheRead: 50 }),
        assistant('<synthetic>', {}),
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context?.tokens).toBe(150);
    });

    it('usa a ultima iteration type:"message" quando o usage tem iterations (rollup do advisor)', () => {
      writeMain([
        {
          type: 'assistant',
          requestId: 'req_1',
          message: {
            model: 'claude-opus-4-8', role: 'assistant', stop_reason: 'end_turn',
            usage: {
              input_tokens: 4, output_tokens: 428,
              cache_creation_input_tokens: 3249, cache_read_input_tokens: 1_031_027,
              iterations: [
                { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_122, cache_creation_input_tokens: 783, output_tokens: 65 },
                { type: 'advisor_message', model: 'claude-opus-5', input_tokens: 516_328, output_tokens: 13_610 },
                { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_905, cache_creation_input_tokens: 2466, output_tokens: 363 },
              ],
            },
          },
        },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      // ultima iteration message: 2 + 515905 + 2466 = 518373 — NAO o rollup (1034280)
      expect(usage.context).toEqual({ tokens: 518_373, limit: 1_000_000 });
    });

    it('iterations vazio ou sem type:"message" cai no top-level', () => {
      writeMain([
        {
          type: 'assistant', requestId: 'r1',
          message: {
            model: 'claude-opus-4-8', role: 'assistant', stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 50, cache_creation_input_tokens: 0, iterations: [] },
          },
        },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 150, limit: 1_000_000 });
    });

    it('iterations sem nenhuma type:"message" (so advisor) tambem cai no top-level', () => {
      writeMain([
        {
          type: 'assistant', requestId: 'r1',
          message: {
            model: 'claude-opus-4-8', role: 'assistant', stop_reason: 'end_turn',
            usage: {
              input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 50, cache_creation_input_tokens: 0,
              iterations: [{ type: 'advisor_message', model: 'claude-opus-5', input_tokens: 9999, output_tokens: 10 }],
            },
          },
        },
      ]);
      const usage = parser.usageForSession(SID, CWD, [mainRef]);
      expect(usage.context).toEqual({ tokens: 150, limit: 1_000_000 });
    });

    it('readFileUsage expoe o context do arquivo (mesma passada)', () => {
      writeMain([
        assistant('claude-opus-4-8', { input: 100, cacheCreate: 200, cacheRead: 50 }),
        assistant('claude-opus-4-8', { input: 1000, output: 30, cacheCreate: 2000, cacheRead: 5000 }),
      ]);
      const filePath = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), `${SID}.jsonl`);
      expect(readFileUsage(filePath, true).context).toEqual({ tokens: 8000, limit: 1_000_000 });
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

    it('skips synthetic error entries (<synthetic> model)', () => {
      writeMain([
        assistant('claude-opus-4-8', { input: 100, output: 10 }),
        assistant('<synthetic>', {}),
      ]);
      const filePath = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), `${SID}.jsonl`);
      const usage = readFileUsage(filePath, true);
      expect(usage.models).toEqual([{ model: 'claude-opus-4-8', input: 100, output: 10, cache: 0 }]);
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

describe('readFileUsage — lastModel', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lastmodel-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function entry(model: string, extra: object = {}): object {
    return {
      type: 'assistant',
      ...extra,
      message: { model, role: 'assistant', usage: { input_tokens: 10, output_tokens: 1 } },
    };
  }
  function write(lines: object[]): string {
    const p = path.join(dir, 't.jsonl');
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
    return p;
  }

  it('returns the model of the LAST usage-bearing entry (not the dominant one)', () => {
    const p = write([entry('claude-opus-4-8'), entry('claude-opus-4-8'), entry('claude-sonnet-4-5')]);
    expect(readFileUsage(p, false).lastModel).toBe('claude-sonnet-4-5');
  });

  it('is undefined when the file has no usage entries', () => {
    const p = write([{ type: 'user', message: { role: 'user', content: 'oi' } }]);
    expect(readFileUsage(p, false).lastModel).toBeUndefined();
  });

  it('skips synthetic entries', () => {
    const p = write([entry('claude-opus-4-8'), entry('<synthetic>')]);
    expect(readFileUsage(p, false).lastModel).toBe('claude-opus-4-8');
  });

  it('skips sidechain entries when skipSidechain', () => {
    const p = write([entry('claude-opus-4-8'), entry('claude-haiku-4-5', { isSidechain: true })]);
    expect(readFileUsage(p, true).lastModel).toBe('claude-opus-4-8');
    expect(readFileUsage(p, false).lastModel).toBe('claude-haiku-4-5');
  });
});

describe('usageForSession — currentModel', () => {
  let claudeDir: string;
  const CWD = '/home/user/proj';
  const SID = 's1';
  beforeEach(() => { claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curmodel-')); });
  afterEach(() => { fs.rmSync(claudeDir, { recursive: true, force: true }); });

  function assistant(model: string): object {
    return { type: 'assistant', message: { model, role: 'assistant', usage: { input_tokens: 5, output_tokens: 1 } } };
  }

  it('sets currentModel per agent from each transcript', () => {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(path.join(projDir, SID, 'subagents'), { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`),
      [assistant('claude-opus-4-8')].map(l => JSON.stringify(l)).join('\n'));
    fs.writeFileSync(path.join(projDir, SID, 'subagents', 'agent-a1.jsonl'),
      [assistant('claude-sonnet-4-5')].map(l => JSON.stringify(l)).join('\n'));

    const usage = new UsageParser(claudeDir).usageForSession(SID, CWD, [
      { agentId: SID, name: 'Main agent', isMain: true },
      { agentId: 'a1', name: 'Sub', isMain: false },
    ]);
    expect(usage.byAgent[0].currentModel).toBe('claude-opus-4-8');
    expect(usage.byAgent[1].currentModel).toBe('claude-sonnet-4-5');
  });
});

describe('readFileUsage — dedupe por request (formato multi-record)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  interface Tokens { input?: number; output?: number; cacheCreate?: number; cacheRead?: number }
  function record(
    requestId: string | undefined,
    model: string,
    t: Tokens,
    opts: { msgId?: string; stopReason?: string; iterations?: object[] } = {},
  ): object {
    return {
      type: 'assistant',
      ...(requestId !== undefined ? { requestId } : {}),
      message: {
        ...(opts.msgId !== undefined ? { id: opts.msgId } : {}),
        model,
        role: 'assistant',
        stop_reason: opts.stopReason ?? null,
        usage: {
          input_tokens: t.input ?? 0,
          output_tokens: t.output ?? 0,
          cache_creation_input_tokens: t.cacheCreate ?? 0,
          cache_read_input_tokens: t.cacheRead ?? 0,
          ...(opts.iterations !== undefined ? { iterations: opts.iterations } : {}),
        },
      },
    };
  }
  function write(lines: object[]): string {
    const p = path.join(dir, 't.jsonl');
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
    return p;
  }

  it('conta uma unica vez um request com o usage final replicado em N records (backfill completo)', () => {
    const final = { input: 4, output: 428, cacheCreate: 3249, cacheRead: 100_000 };
    const p = write([
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 4, output: 428, cache: 103_249 },
    ]);
  });

  it('prefere o record final (stop_reason) ao snapshot inicial do mesmo request', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 2, output: 1, cacheRead: 50_000 }),
      record('req_1', 'claude-opus-4-8', { input: 4, output: 250, cacheRead: 50_000 }, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 4, output: 250, cache: 50_000 },
    ]);
  });

  it('um final ja visto nao e substituido por snapshot posterior', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 4, output: 250 }, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', { input: 2, output: 999 }),
    ]);
    expect(readFileUsage(p, false).models[0].output).toBe(250);
  });

  it('sem record final (backfill perdido, #84223), vence o snapshot de maior output', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 2, output: 1, cacheRead: 10_000 }),
      record('req_1', 'claude-opus-4-8', { input: 2, output: 65, cacheRead: 10_000 }),
      record('req_1', 'claude-opus-4-8', { input: 2, output: 3, cacheRead: 10_000 }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 2, output: 65, cache: 10_000 },
    ]);
  });

  it('usage com iterations conta como final mesmo sem stop_reason', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 2, output: 999 }),
      record('req_1', 'claude-opus-4-8', { input: 4, output: 428 }, {
        iterations: [{ type: 'message', input_tokens: 4, output_tokens: 428 }],
      }),
    ]);
    expect(readFileUsage(p, false).models[0].output).toBe(428);
  });

  it('os totais de um request com iterations usam o usage top-level (rollup = consumo real)', () => {
    // rollup do advisor (#84738): top-level soma as iterations; os TOTAIS usam isso mesmo
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 4, output: 428, cacheCreate: 3249, cacheRead: 1_031_027 }, {
        stopReason: 'end_turn',
        iterations: [
          { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_122, cache_creation_input_tokens: 783, output_tokens: 65 },
          { type: 'advisor_message', model: 'claude-opus-5', input_tokens: 516_328, output_tokens: 13_610 },
          { type: 'message', input_tokens: 2, cache_read_input_tokens: 515_905, cache_creation_input_tokens: 2466, output_tokens: 363 },
        ],
      }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 4, output: 428, cache: 1_034_276 },
    ]);
  });

  it('requests distintos somam normalmente', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 10, output: 5 }, { stopReason: 'end_turn' }),
      record('req_2', 'claude-opus-4-8', { input: 20, output: 7 }, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models).toEqual([
      { model: 'claude-opus-4-8', input: 30, output: 12, cache: 0 },
    ]);
  });

  it('sem requestId, deduplica pelo message.id (transcripts antigos)', () => {
    const p = write([
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }, { msgId: 'msg_1', stopReason: 'end_turn' }),
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }, { msgId: 'msg_1', stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).models[0]).toEqual(
      { model: 'claude-opus-4-8', input: 10, output: 5, cache: 0 });
  });

  it('sem requestId nem message.id, cada linha conta sozinha (legado)', () => {
    const p = write([
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }),
      record(undefined, 'claude-opus-4-8', { input: 10, output: 5 }),
    ]);
    expect(readFileUsage(p, false).models[0]).toEqual(
      { model: 'claude-opus-4-8', input: 20, output: 10, cache: 0 });
  });

  it('cache stats seguem o mesmo dedupe', () => {
    const final = { input: 4, output: 100, cacheCreate: 500, cacheRead: 9000 };
    const p = write([
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
      record('req_1', 'claude-opus-4-8', final, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).cache).toEqual({ input: 4, read: 9000, creation: 500 });
  });

  it('lastModel continua sendo o da ultima entrada valida, mesmo com dedupe', () => {
    const p = write([
      record('req_1', 'claude-opus-4-8', { input: 1, output: 1 }, { stopReason: 'end_turn' }),
      record('req_2', 'claude-sonnet-4-6', { input: 1, output: 1 }, { stopReason: 'end_turn' }),
    ]);
    expect(readFileUsage(p, false).lastModel).toBe('claude-sonnet-4-6');
  });
});
