import * as fs from 'fs';

// #87900: os clientes oficiais do Claude Code anexam records SEM timestamp
// (bridge-session, mode, last-prompt, ai-title, atis-latch, pr-link…) a
// transcripts antigos — no startup do indexer, em reconexões do Remote Control,
// na geração de título — e empurram o mtime muito depois da conversa acabar.
// O mtime deixou de significar "última atividade". A atividade de verdade é o
// timestamp da última mensagem de CONVERSA (user/assistant), que só elas têm.

const CONVERSATION_TYPES = new Set(['user', 'assistant']);
const INITIAL_TAIL = 64 * 1024;

// Timestamp (epoch ms) da última mensagem de conversa do transcript, lendo só a
// cauda do arquivo (64 KiB, quadruplicando até o arquivo inteiro se um record
// enorme ficar no fim). null se não há mensagem datada ou o arquivo não existe.
export function readLastActivityAt(filePath: string, size?: number): number | null {
  let fd: number;
  try { fd = fs.openSync(filePath, 'r'); } catch { return null; }
  try {
    const total = size ?? fs.fstatSync(fd).size;
    if (total === 0) return null;
    let window = Math.min(INITIAL_TAIL, total);
    for (;;) {
      const buf = Buffer.alloc(window);
      fs.readSync(fd, buf, 0, window, total - window);
      let text = buf.toString('utf-8');
      // Janela parcial: a primeira linha pode estar cortada (e a decodificação
      // UTF-8 dela, corrompida) — descarta até o primeiro '\n'.
      if (window < total) {
        const nl = text.indexOf('\n');
        text = nl === -1 ? '' : text.slice(nl + 1);
      }
      const found = lastConversationTimestamp(text);
      if (found !== null) return found;
      if (window >= total) return null;
      window = Math.min(window * 4, total);
    }
  } finally {
    fs.closeSync(fd);
  }
}

function lastConversationTimestamp(text: string): number | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.includes('"timestamp"')) continue;
    let entry: { type?: unknown; timestamp?: unknown };
    try { entry = JSON.parse(line); } catch { continue; }
    if (typeof entry.type === 'string' && CONVERSATION_TYPES.has(entry.type) && typeof entry.timestamp === 'string') {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

// Memo por (mtimeMs, size): um stat por chamada, leitura só quando o arquivo
// muda — o mesmo padrão do ProjectUsageService. Devolve o timestamp da última
// mensagem; cai para o mtime quando o transcript ainda não tem mensagem datada
// (arquivo recém-criado); null se o arquivo não existe.
export class TranscriptActivity {
  private readonly memo = new Map<string, { mtimeMs: number; size: number; activityAt: number | null }>();

  activityAt(filePath: string): number | null {
    let stat: fs.Stats;
    try { stat = fs.statSync(filePath); } catch { this.memo.delete(filePath); return null; }
    const hit = this.memo.get(filePath);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.activityAt ?? stat.mtimeMs;
    const activityAt = readLastActivityAt(filePath, stat.size);
    this.memo.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, activityAt });
    return activityAt ?? stat.mtimeMs;
  }
}
