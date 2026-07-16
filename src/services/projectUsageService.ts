import * as fs from 'fs';
import * as path from 'path';
import { cwdCandidates } from './transcriptPaths';
import { encodeCwdToProjectDir } from './projectDir';
import { readFileUsage } from './usageParser';
import { readSubAgentMeta } from './subAgentMeta';
import type { AgentTypeUsage, CacheStats, ModelUsage, ProjectUsage } from '../types';

interface FileMemo {
  mtimeMs: number;
  size: number;
  models: ModelUsage[];
  cache: CacheStats;
  agentType: string;
}

// Agrega o uso de todas as sessões do projeto com atividade na janela.
// Lazy por natureza (só é chamado quando o bloco expande) e com memoização por
// arquivo — cada transcript só é relido quando (mtime, size) muda; na prática,
// só a sessão ativa paga leitura em expansões repetidas.
export class ProjectUsageService {
  private readonly memo = new Map<string, FileMemo>();

  constructor(private readonly claudeDir: string) {}

  usageForProject(cwd: string, sinceMs: number): ProjectUsage {
    const dir = this.projectDir(cwd);
    if (!dir) return { sessions: 0, byModel: [], byAgentType: [] };

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch {
      return { sessions: 0, byModel: [], byAgentType: [] };
    }

    const seen = new Set<string>();
    const byModel = new Map<string, ModelUsage>();
    const byType = new Map<string, AgentTypeUsage>();
    const cache: CacheStats = { input: 0, read: 0, creation: 0 };
    let sessions = 0;

    // Soma um arquivo no acumulador. Os objetos do memo nunca são mutados —
    // os acumuladores são sempre instâncias novas deste scan.
    const addFile = (filePath: string, skipSidechain: boolean, resolveType: () => string): void => {
      const usage = this.readCached(filePath, skipSidechain, resolveType);
      if (!usage) return;
      seen.add(filePath);
      const typeAcc = byType.get(usage.agentType)
        ?? { agentType: usage.agentType, input: 0, output: 0, cache: 0 };
      for (const m of usage.models) {
        const acc = byModel.get(m.model) ?? { model: m.model, input: 0, output: 0, cache: 0 };
        acc.input += m.input;
        acc.output += m.output;
        acc.cache += m.cache;
        byModel.set(m.model, acc);
        typeAcc.input += m.input;
        typeAcc.output += m.output;
        typeAcc.cache += m.cache;
      }
      if (usage.models.length > 0) byType.set(usage.agentType, typeAcc);
      cache.input += usage.cache.input;
      cache.read += usage.cache.read;
      cache.creation += usage.cache.creation;
    };

    for (const file of files) {
      const mainPath = path.join(dir, file);
      let stat: fs.Stats;
      try { stat = fs.statSync(mainPath); } catch { continue; }
      if (stat.mtimeMs < sinceMs) continue;
      // Sessão qualifica por atividade (mtime), mesmo que ainda não tenha usage.
      sessions++;
      addFile(mainPath, true, () => 'main');

      const sessionId = file.slice(0, -'.jsonl'.length);
      const subDir = path.join(dir, sessionId, 'subagents');
      let subFiles: string[] = [];
      try {
        subFiles = fs.readdirSync(subDir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
      } catch { /* sessão sem subagents */ }
      for (const sub of subFiles) {
        const subPath = path.join(subDir, sub);
        addFile(subPath, false, () => readSubAgentMeta(subPath)?.agentType ?? 'subagent');
      }
    }

    // Poda: arquivos fora da janela ou removidos saem do memo (se voltarem a
    // mudar, o mtime novo os traz de volta e eles são relidos de qualquer jeito).
    for (const key of this.memo.keys()) {
      if (!seen.has(key)) this.memo.delete(key);
    }

    const total = cache.input + cache.read + cache.creation;
    return {
      sessions,
      byModel: [...byModel.values()],
      byAgentType: [...byType.values()]
        .sort((a, b) => (b.input + b.output + b.cache) - (a.input + a.output + a.cache)),
      ...(total > 0 ? { cache } : {}),
    };
  }

  private readCached(
    filePath: string,
    skipSidechain: boolean,
    resolveType: () => string,
  ): { models: ModelUsage[]; cache: CacheStats; agentType: string } | null {
    let stat: fs.Stats;
    try { stat = fs.statSync(filePath); } catch { return null; }
    const hit = this.memo.get(filePath);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return { models: hit.models, cache: hit.cache, agentType: hit.agentType };
    }
    // agentType resolvido junto da leitura e memoizado: o meta.json é gravado
    // no spawn e não muda; evita um readFileSync por sub-agent a cada scan.
    const entry = { ...readFileUsage(filePath, skipSidechain), agentType: resolveType() };
    this.memo.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, ...entry });
    return entry;
  }

  private projectDir(cwd: string): string | null {
    for (const candidate of cwdCandidates(cwd)) {
      const d = path.join(this.claudeDir, 'projects', encodeCwdToProjectDir(candidate));
      if (fs.existsSync(d)) return d;
    }
    return null;
  }
}
