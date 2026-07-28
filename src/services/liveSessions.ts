import * as fs from 'fs';
import * as path from 'path';

// Registro vivo do CLI: ~/.claude/sessions/{pid}.json, um arquivo por processo.
// Só lemos os campos que consumimos — o registro traz mais (startedAt, version,
// kind, entrypoint, procStart), e carregá-los sem uso só criaria superfície.
export interface LiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  name?: string;
  nameSource?: string;
}

// EPERM = processo existe, só não é sinalizável por este usuário.
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// pid <= 0 nao identifica um processo individual: 0 mira o grupo do processo
// atual (process.kill(0, 0) responde true) e negativos miram um grupo no
// POSIX — um registro com pid: 0 viraria "vivo" pra sempre. `alive` dirige a
// escolha automatica de sessao, entao essa validacao nao e cosmetica.
function isValidPid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 0;
}

export function readLiveSessions(
  claudeDir: string,
  isAlive: (pid: number) => boolean = isPidAlive,
): Map<string, LiveSession> {
  const out = new Map<string, LiveSession>();
  const dir = path.join(claudeDir, 'sessions');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf-8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const { pid, sessionId, cwd, name, nameSource } = parsed;
    if (!isValidPid(pid) || typeof sessionId !== 'string' || typeof cwd !== 'string') continue;
    if (!isAlive(pid)) continue;
    out.set(sessionId, {
      pid,
      sessionId,
      cwd,
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof nameSource === 'string' ? { nameSource } : {}),
    });
  }
  return out;
}
