import * as fs from 'fs';
import * as path from 'path';
import { cwdCandidates } from './transcriptPaths';
import { encodeCwdToProjectDir } from './projectDir';
import { readFileUsage } from './usageParser';
import type { CacheStats, ModelUsage, ProjectUsage } from '../types';

interface FileMemo {
  mtimeMs: number;
  size: number;
  models: ModelUsage[];
  cache: CacheStats;
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
    if (!dir) return { sessions: 0, byModel: [] };

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch {
      return { sessions: 0, byModel: [] };
    }

    const seen = new Set<string>();
    const byModel = new Map<string, ModelUsage>();
    const cache: CacheStats = { input: 0, read: 0, creation: 0 };
    let sessions = 0;

    // Soma um arquivo no acumulador. Os objetos do memo nunca são mutados —
    // os acumuladores são sempre instâncias novas deste scan.
    const addFile = (filePath: string, skipSidechain: boolean): void => {
      const usage = this.readCached(filePath, skipSidechain);
      if (!usage) return;
      seen.add(filePath);
      for (const m of usage.models) {
        const acc = byModel.get(m.model) ?? { model: m.model, input: 0, output: 0, cache: 0 };
        acc.input += m.input;
        acc.output += m.output;
        acc.cache += m.cache;
        byModel.set(m.model, acc);
      }
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
      addFile(mainPath, true);

      const sessionId = file.slice(0, -'.jsonl'.length);
      const subDir = path.join(dir, sessionId, 'subagents');
      let subFiles: string[] = [];
      try {
        subFiles = fs.readdirSync(subDir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
      } catch { /* sessão sem subagents */ }
      for (const sub of subFiles) addFile(path.join(subDir, sub), false);
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
      ...(total > 0 ? { cache } : {}),
    };
  }

  private readCached(filePath: string, skipSidechain: boolean): { models: ModelUsage[]; cache: CacheStats } | null {
    let stat: fs.Stats;
    try { stat = fs.statSync(filePath); } catch { return null; }
    const hit = this.memo.get(filePath);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return { models: hit.models, cache: hit.cache };
    }
    const usage = readFileUsage(filePath, skipSidechain);
    this.memo.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, ...usage });
    return usage;
  }

  private projectDir(cwd: string): string | null {
    for (const candidate of cwdCandidates(cwd)) {
      const d = path.join(this.claudeDir, 'projects', encodeCwdToProjectDir(candidate));
      if (fs.existsSync(d)) return d;
    }
    return null;
  }
}
