import * as fs from 'fs';
import * as path from 'path';
import { transcriptPath, subAgentsDir } from './transcriptPaths';
import type { AgentUsage, CacheStats, ContextUsage, ModelUsage, SessionUsage } from '../types';

const DEFAULT_CONTEXT_LIMIT = 200_000;
const ONE_MILLION = 1_000_000;

// opus/sonnet generation 4–19 (e.g. opus-4-8, sonnet-4-6). The `(?!\d)` stops
// the date-suffixed legacy id "claude-3-5-sonnet-20241022" from matching
// (its "sonnet-20" is neither [4-9] nor 1\d).
const ONE_M_FAMILY = /(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)/i;

function supportsOneMillion(model: string): boolean {
  return /1m/i.test(model) || ONE_M_FAMILY.test(model);
}

// The context window for a model. 1M when the family supports it (opus/sonnet
// gen 4+, or an explicit 1m suffix) OR when the observed context already
// exceeds 200k (proof of a larger window). Always elevates, never lowers.
export function contextLimitFor(model: string, observedTokens = 0): number {
  const base = supportsOneMillion(model) ? ONE_MILLION : DEFAULT_CONTEXT_LIMIT;
  return observedTokens > base ? ONE_MILLION : base;
}

interface AgentRef {
  agentId: string;
  name: string;
  isMain: boolean;
}

interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
}

interface TranscriptEntry {
  type?: string;
  isSidechain?: boolean;
  message?: {
    model?: unknown;
    usage?: RawUsage;
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// Lê um transcript em uma passada e devolve o uso por modelo + o breakdown de
// cache do arquivo. No transcript principal, entradas isSidechain são puladas
// (os turnos de sub-agents vêm dos próprios agent-*.jsonl). Compartilhada entre
// o uso por sessão (UsageParser) e o agregado do projeto (ProjectUsageService).
export function readFileUsage(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats } {
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  } catch {
    return { models: [], cache: { input: 0, read: 0, creation: 0 } };
  }

  const byModel = new Map<string, ModelUsage>();
  const cache: CacheStats = { input: 0, read: 0, creation: 0 };
  for (const line of lines) {
    if (!line) continue;
    let entry: TranscriptEntry;
    try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
    if (skipSidechain && entry.isSidechain) continue;
    const msg = entry.message;
    if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
    // Entradas sintéticas de erro de API não são uso real do modelo.
    if (msg.model === '<synthetic>') continue;
    const u = msg.usage;
    const input = num(u.input_tokens);
    const read = num(u.cache_read_input_tokens);
    const creation = num(u.cache_creation_input_tokens);
    const acc = byModel.get(msg.model) ?? { model: msg.model, input: 0, output: 0, cache: 0 };
    acc.input += input;
    acc.output += num(u.output_tokens);
    acc.cache += creation + read;
    byModel.set(msg.model, acc);
    cache.input += input;
    cache.read += read;
    cache.creation += creation;
  }
  return { models: [...byModel.values()], cache };
}

export class UsageParser {
  constructor(private readonly claudeDir: string) {}

  // Computes token usage for the given set of agents (already resolved by the
  // todos parser). `byAgent` keeps the input order; `byModel` aggregates across
  // all agents. Agents whose transcript file is missing OR has no usage entries
  // are skipped.
  usageForSession(sessionId: string, cwd: string, agents: AgentRef[]): SessionUsage {
    const byAgent: AgentUsage[] = [];
    const sessionCache: CacheStats = { input: 0, read: 0, creation: 0 };

    for (const agent of agents) {
      const filePath = agent.isMain
        ? transcriptPath(this.claudeDir, sessionId, cwd)
        : this.subAgentFile(sessionId, cwd, agent.agentId);
      if (!filePath) continue;

      const { models, cache } = readFileUsage(filePath, agent.isMain);
      if (models.length === 0) continue;

      byAgent.push({ agentId: agent.agentId, name: agent.name, isMain: agent.isMain, models });
      sessionCache.input += cache.input;
      sessionCache.read += cache.read;
      sessionCache.creation += cache.creation;
    }

    let context: ContextUsage | undefined;
    const hasMain = agents.some(a => a.isMain);
    if (hasMain) {
      const mainFile = transcriptPath(this.claudeDir, sessionId, cwd);
      if (mainFile) context = this.contextForFile(mainFile);
    }

    const cacheTotal = sessionCache.input + sessionCache.read + sessionCache.creation;
    const cache = cacheTotal > 0 ? sessionCache : undefined;

    return { byModel: this.aggregate(byAgent), byAgent, context, cache };
  }

  private subAgentFile(sessionId: string, cwd: string, agentId: string): string | null {
    const dir = subAgentsDir(this.claudeDir, sessionId, cwd);
    if (!dir) return null;
    const file = path.join(dir, `agent-${agentId}.jsonl`);
    return fs.existsSync(file) ? file : null;
  }

  // The current context size = input + cache of the LAST usage-bearing message
  // in the main transcript (output is excluded; sidechain entries are skipped).
  // Returns undefined when the transcript has no usage yet.
  private contextForFile(filePath: string): ContextUsage | undefined {
    let lines: string[];
    try {
      lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return undefined;
    }

    let last: { usage: RawUsage; model: string } | undefined;
    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      if (entry.isSidechain) continue;
      const msg = entry.message;
      if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
      if (msg.model === '<synthetic>') continue;
      last = { usage: msg.usage, model: msg.model };
    }
    if (!last) return undefined;

    const u = last.usage;
    const tokens = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
    return { tokens, limit: contextLimitFor(last.model, tokens) };
  }

  // Aggregates per-agent models into session-wide totals per model, in
  // first-seen order (main agent first).
  private aggregate(byAgent: AgentUsage[]): ModelUsage[] {
    const byModel = new Map<string, ModelUsage>();
    for (const agent of byAgent) {
      for (const m of agent.models) {
        const acc = byModel.get(m.model) ?? { model: m.model, input: 0, output: 0, cache: 0 };
        acc.input += m.input;
        acc.output += m.output;
        acc.cache += m.cache;
        byModel.set(m.model, acc);
      }
    }
    return [...byModel.values()];
  }
}
