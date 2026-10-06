import * as fs from 'fs';
import * as path from 'path';
import { parseBridgeFile, type BridgeFile } from '../bridgeMod/state';
import type { LifecycleEntry } from './agentLifecycle';
import { SAFE_SESSION_ID } from './transcriptPaths';
import type { RateLimitsReading } from '../types';

// A partir desta versão o id de agente é o mesmo em todos os eventos de hook e
// no transcript (CHANGELOG 2.1.289: "one agent id across plugin hook events").
export const MIN_LIFECYCLE_ENGINE = [2, 1, 289] as const;

export function engineAtLeast(version: string | undefined, min: readonly [number, number, number]): boolean {
  if (version === undefined) return false;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== min[i]) return parts[i] > min[i];
  }
  return true;
}

// Os FINS de agente gravados no arquivo, como mais uma fonte do
// mergeLifecycles. Só os fins: o início e a retomada já estão no transcript
// (lançamento, SendMessage, disparo sem tool_result), e um início da ponte
// cujo fim se perdeu (recarga do mod) deixaria "rodando" um agente que o
// transcript já dá como concluído. Só com engine 2.1.289 ou mais nova, que
// garante o mesmo id do transcript.
export function lifecycleFromBridge(file: BridgeFile | undefined): Map<string, LifecycleEntry> | undefined {
  if (!file || !engineAtLeast(file.engineVersion, MIN_LIFECYCLE_ENGINE)) return undefined;
  const out = new Map<string, LifecycleEntry>();
  for (const [id, agent] of Object.entries(file.agents)) {
    if (agent.state === 'stopped') out.set(id, { state: 'stopped', at: agent.at });
  }
  return out;
}

// Leitor dos arquivos que o mod claude-todos-bridge grava em
// <claudeDir>/.vscode-todos-bridge/live/ (spec 2026-10-06, decisão 6).
// Tolerante: arquivo ausente devolve undefined; arquivo pela metade ou inválido
// devolve a última leitura boa daquele arquivo (o $.fs do mod não grava de forma
// atômica). Cache por mtime e tamanho: o snapshot roda várias vezes por mudança.
export class BridgeLiveReader {
  readonly liveDir: string;
  private readonly cache = new Map<string, { mtimeMs: number; size: number; file: BridgeFile | null }>();
  private readonly lastGood = new Map<string, BridgeFile>();

  constructor(claudeDir: string) {
    this.liveDir = path.join(claudeDir, '.vscode-todos-bridge', 'live');
  }

  forSession(sessionId: string): BridgeFile | undefined {
    if (!SAFE_SESSION_ID.test(sessionId)) return undefined;
    const file = this.read(path.join(this.liveDir, `${sessionId}.json`));
    return file !== undefined && file.sessionId === sessionId ? file : undefined;
  }

  // Os limites são da conta: vale a leitura de usage.at mais recente entre os
  // arquivos com rateLimits não vazio.
  latestRateLimits(): RateLimitsReading | undefined {
    let entries: string[];
    try { entries = fs.readdirSync(this.liveDir); } catch { return undefined; }
    let best: RateLimitsReading | undefined;
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const usage = this.read(path.join(this.liveDir, name))?.usage;
      if (!usage || usage.rateLimits.length === 0) continue;
      if (best === undefined || usage.at > best.readAt) best = { readAt: usage.at, limits: usage.rateLimits };
    }
    return best;
  }

  // Apaga de live/ os arquivos com mtime acima de maxAgeMs. Nunca lança.
  prune(maxAgeMs: number, now: number): void {
    let entries: string[];
    try { entries = fs.readdirSync(this.liveDir); } catch { return; }
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const full = path.join(this.liveDir, name);
      try {
        if (now - fs.statSync(full).mtimeMs > maxAgeMs) {
          fs.rmSync(full, { force: true });
          this.cache.delete(full);
          this.lastGood.delete(full);
        }
      } catch { /* sumiu ou está travado: tenta na próxima */ }
    }
  }

  private read(full: string): BridgeFile | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      this.cache.delete(full);
      this.lastGood.delete(full);
      return undefined;
    }
    const hit = this.cache.get(full);
    if (!hit || hit.mtimeMs !== stat.mtimeMs || hit.size !== stat.size) {
      let file: BridgeFile | null = null;
      try { file = parseBridgeFile(JSON.parse(fs.readFileSync(full, 'utf-8'))); } catch { file = null; }
      this.cache.set(full, { mtimeMs: stat.mtimeMs, size: stat.size, file });
      if (file) this.lastGood.set(full, file);
    }
    return this.cache.get(full)?.file ?? this.lastGood.get(full);
  }
}
