import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

interface Entry { name: string; updatedAt: number }

// O nome definido por /session-name só existe enquanto o processo vive
// (~/.claude/sessions/{pid}.json some no exit). Guardamos por sessionId para
// que ele sobreviva no picker. Arquivo próprio, ao lado do bridge — não
// workspaceState, que é API do VS Code e não alcança o sidecar do JetBrains.
export class SessionNames {
  constructor(private readonly filePath: string) {}

  private readAll(): Record<string, Entry> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, Entry>
        : {};
    } catch {
      return {};
    }
  }

  // Escrita e best-effort: o cache de nomes e so uma otimizacao (sem ele o
  // titulo cai pro aiTitle), mas quem chama write() (remember/prune) roda no
  // callback do watcher, fora de qualquer try/catch — no sidecar do JetBrains
  // uma excecao ali derruba o processo inteiro. rename-sobre-existente pode
  // falhar com EPERM/EACCES no Windows quando duas janelas (VS Code e
  // JetBrains) escrevem o mesmo arquivo ao mesmo tempo; perder esse nome e
  // aceitavel, matar o painel nao. Simetriza com o engolimento de erro que
  // readAll ja faz.
  private write(all: Record<string, Entry>): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      atomicWriteFileSync(this.filePath, JSON.stringify(all, null, 2));
    } catch {
      // best-effort — ver comentario acima
    }
  }

  get(sessionId: string): string | undefined {
    return this.readAll()[sessionId]?.name;
  }

  // Leitura em lote para caminhos quentes (ex.: listSessions() em cada refresh),
  // que resolvem o nome de N sessões candidatas — uma leitura do arquivo em vez
  // de N chamadas a get().
  entries(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, entry] of Object.entries(this.readAll())) {
      out[id] = entry.name;
    }
    return out;
  }

  remember(sessionId: string, name: string, now: number): void {
    const all = this.readAll();
    if (all[sessionId]?.name === name) return;  // sem I/O quando nada muda
    all[sessionId] = { name, updatedAt: now };
    this.write(all);
  }

  prune(maxAgeMs: number, now: number): void {
    const all = this.readAll();
    const kept: Record<string, Entry> = {};
    let removed = 0;
    for (const [id, entry] of Object.entries(all)) {
      if (now - entry.updatedAt > maxAgeMs) removed++;
      else kept[id] = entry;
    }
    if (removed === 0) return;  // no-op, igual ao BridgeFile.prune
    this.write(kept);
  }
}
