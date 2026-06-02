import * as fs from 'fs';
import * as path from 'path';
import { transcriptPath, subAgentsDir } from './transcriptPaths';
import type { AgentUsage, ModelUsage, SessionUsage } from '../types';

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

export class UsageParser {
  constructor(private readonly claudeDir: string) {}

  // Computes token usage for the given set of agents (already resolved by the
  // todos parser). `byAgent` keeps the input order; `byModel` aggregates across
  // all agents. Agents whose transcript file is missing OR has no usage entries
  // are skipped.
  usageForSession(sessionId: string, cwd: string, agents: AgentRef[]): SessionUsage {
    const byAgent: AgentUsage[] = [];

    for (const agent of agents) {
      const filePath = agent.isMain
        ? transcriptPath(this.claudeDir, sessionId, cwd)
        : this.subAgentFile(sessionId, cwd, agent.agentId);
      if (!filePath) continue;

      const models = this.modelsForFile(filePath, agent.isMain);
      if (models.length === 0) continue;

      byAgent.push({
        agentId: agent.agentId,
        name: agent.name,
        isMain: agent.isMain,
        models,
      });
    }

    return { byModel: this.aggregate(byAgent), byAgent };
  }

  private subAgentFile(sessionId: string, cwd: string, agentId: string): string | null {
    const dir = subAgentsDir(this.claudeDir, sessionId, cwd);
    if (!dir) return null;
    const file = path.join(dir, `agent-${agentId}.jsonl`);
    return fs.existsSync(file) ? file : null;
  }

  // Reads one transcript file. For the main transcript, isSidechain entries are
  // skipped (sub-agent turns are counted from their own agent-*.jsonl files,
  // never double-counted from the main transcript). Returns one ModelUsage per
  // distinct model in the file, in first-seen order.
  private modelsForFile(filePath: string, skipSidechain: boolean): ModelUsage[] {
    let lines: string[];
    try {
      lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return [];
    }

    const byModel = new Map<string, ModelUsage>();
    for (const line of lines) {
      if (!line) continue;
      let entry: TranscriptEntry;
      try { entry = JSON.parse(line) as TranscriptEntry; } catch { continue; }
      if (skipSidechain && entry.isSidechain) continue;
      const msg = entry.message;
      if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
      const u = msg.usage;
      const acc = byModel.get(msg.model) ?? { model: msg.model, input: 0, output: 0, cache: 0 };
      acc.input += num(u.input_tokens);
      acc.output += num(u.output_tokens);
      acc.cache += num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
      byModel.set(msg.model, acc);
    }
    return [...byModel.values()];
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
