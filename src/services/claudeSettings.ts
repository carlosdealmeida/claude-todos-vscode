import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

export interface ClaudeSettings {
  env?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

export class SettingsParseError extends Error {
  constructor(readonly path: string, cause: unknown) {
    super(`settings.json is not valid JSON (${path}): ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'SettingsParseError';
  }
}

// Leitor/escritor do ~/.claude/settings.json, compartilhado pelo HookInstaller e
// pela ativação das task tools (R2). Leitura ESTRITA: arquivo presente que não
// parseia lança — nunca sobrescrever o arquivo do usuário com `{}`. Ausente → `{}`.
export class ClaudeSettingsFile {
  constructor(readonly path: string) {}

  exists(): boolean {
    return fs.existsSync(this.path);
  }

  read(): ClaudeSettings {
    if (!this.exists()) return {};
    const raw = fs.readFileSync(this.path, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new SettingsParseError(this.path, err);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SettingsParseError(this.path, 'top-level value is not an object');
    }
    return parsed as ClaudeSettings;
  }

  write(settings: ClaudeSettings): void {
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    atomicWriteFileSync(this.path, JSON.stringify(settings, null, 2));
  }

  getEnv(key: string): string | undefined {
    const v = this.read().env?.[key];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return undefined;
  }

  // true quando o arquivo mudou (chave ausente ou com outro valor).
  setEnv(key: string, value: string): boolean {
    const settings = this.read();
    const env = settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
      ? settings.env
      : {};
    if (env[key] === value) return false;
    settings.env = { ...env, [key]: value };
    this.write(settings);
    return true;
  }
}
