import * as fs from 'fs';
import * as path from 'path';

// R2: a partir desta versão o Claude Code desliga TodoWrite/TaskCreate por padrão
// nos modelos novos; a env var abaixo religa. Isolados aqui para que uma mudança
// da Anthropic (renomear a var, mover a versão, reverter) seja um commit pequeno.
export const TASK_TOOLS_OFF_SINCE = '2.1.233';
export const TASK_TOOLS_ENV = 'CLAUDE_CODE_ENABLE_TODO_TOOLS';

// Famílias desligadas na 2.1.233: Opus 4.8, Opus 5, Sonnet 5, Fable, Mythos e
// qualquer id com major >= 5 (claude-<família>-<major>-…). Opus 4.7-, Sonnet 4.x
// e Haiku 4.5 mantêm as ferramentas.
const OFF_FAMILIES = /opus-4-8|opus-5|sonnet-5|fable|mythos/i;
const MODEL_MAJOR = /^claude-[a-z]+-(\d+)(?:-|$)/i;

export type FlagState = 'on' | 'off' | 'absent';

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function versionAtLeast(version: string | undefined, min: string): boolean {
  if (!version) return false;
  const a = parseVersion(version);
  const b = parseVersion(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

export function modelLosesTaskTools(model: string | undefined): boolean {
  if (!model) return false;
  if (OFF_FAMILIES.test(model)) return true;
  const m = MODEL_MAJOR.exec(model);
  return m !== null && Number(m[1]) >= 5;
}

export function flagStateOf(value: unknown): FlagState {
  if (value === undefined || value === null) return 'absent';
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true') return 'on';
  if (s === '0' || s === 'false') return 'off';
  return 'absent';
}

// Qualquer fonte ligada vence; senão qualquer desligada explícita (o usuário
// decidiu); senão ausente.
export function combineFlagStates(states: FlagState[]): FlagState {
  if (states.includes('on')) return 'on';
  if (states.includes('off')) return 'off';
  return 'absent';
}

export interface TaskToolsSignals {
  version?: string;
  model?: string;
  flag: FlagState;
}

// true = as ferramentas de task estão desligadas nesta sessão e o usuário não
// decidiu nada a respeito → o estado vazio explica e oferece a correção.
export function evaluateTaskTools(s: TaskToolsSignals): boolean {
  return s.flag === 'absent'
    && versionAtLeast(s.version, TASK_TOOLS_OFF_SINCE)
    && modelLosesTaskTools(s.model);
}

// Lê a flag nas fontes que o harness consulta: ambiente do processo, settings do
// usuário, settings do projeto e settings.local do projeto. Cada arquivo é
// memoizado por mtime (mesmo padrão do ProjectUsageService); um arquivo que não
// existe ou não parseia conta como ausente — aqui a leitura é tolerante porque é
// só consulta, nunca escrita.
export class TaskToolsFlagReader {
  private readonly memo = new Map<string, { mtimeMs: number; state: FlagState }>();

  constructor(
    private readonly userSettingsPath: string,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  read(cwd: string | null): FlagState {
    const files = [this.userSettingsPath];
    if (cwd) {
      files.push(
        path.join(cwd, '.claude', 'settings.json'),
        path.join(cwd, '.claude', 'settings.local.json'),
      );
    }
    return combineFlagStates([
      flagStateOf(this.env[TASK_TOOLS_ENV]),
      ...files.map(f => this.readFile(f)),
    ]);
  }

  invalidate(): void {
    this.memo.clear();
  }

  private readFile(filePath: string): FlagState {
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {
      this.memo.delete(filePath);
      return 'absent';
    }
    const hit = this.memo.get(filePath);
    if (hit && hit.mtimeMs === mtimeMs) return hit.state;
    let state: FlagState = 'absent';
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { env?: Record<string, unknown> } | null;
      state = flagStateOf(parsed?.env?.[TASK_TOOLS_ENV]);
    } catch {
      state = 'absent';
    }
    this.memo.set(filePath, { mtimeMs, state });
    return state;
  }
}
