import * as fs from 'fs';

export interface SubAgentMeta {
  toolUseId: string;
  agentType?: string;
  description?: string;
  spawnDepth?: number;
}

// Lê o agent-<id>.meta.json gravado pelo Claude Code ao lado do transcript do
// sub-agent. Retorna null quando o arquivo não existe, não parseia ou não tem
// toolUseId — o chamador cai no matching heurístico por prompt nesses casos.
export function readSubAgentMeta(jsonlPath: string): SubAgentMeta | null {
  const metaPath = jsonlPath.replace(/\.jsonl$/, '.meta.json');
  let raw: string;
  try {
    raw = fs.readFileSync(metaPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const m = parsed as Record<string, unknown>;
  if (typeof m.toolUseId !== 'string' || m.toolUseId.length === 0) return null;
  const out: SubAgentMeta = { toolUseId: m.toolUseId };
  if (typeof m.agentType === 'string') out.agentType = m.agentType;
  if (typeof m.description === 'string') out.description = m.description;
  if (typeof m.spawnDepth === 'number') out.spawnDepth = m.spawnDepth;
  return out;
}
