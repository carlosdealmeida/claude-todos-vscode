import * as fs from 'fs';
import * as path from 'path';
import { ClaudeSettingsFile, SettingsParseError, type ClaudeSettings } from './claudeSettings';
import { atomicWriteFileSync } from './atomicWrite';
import { BRIDGE_MOD_FILES } from '../bridgeMod/modFiles.generated';

export const PLUGIN_DIRS_ENV = 'CLAUDE_CODE_PLUGIN_DIRS';
export const BRIDGE_MOD_NAME = 'claude-todos-bridge';

export interface BridgeModStatus {
  installed: boolean;
  installedAt?: number;  // epoch ms da ativação (install.json)
}

export interface BridgeModInstallerOptions {
  files?: Readonly<Record<string, string>>;
  now?: () => number;
  delimiter?: string;
  platform?: NodeJS.Platform;  // regras de comparação dos caminhos; padrão process.platform
}

// Entradas de uma lista no formato do CLAUDE_CODE_PLUGIN_DIRS, sem vazios.
export function splitPluginDirs(value: string | undefined, delimiter: string = path.delimiter): string[] {
  return (value ?? '').split(delimiter).map(s => s.trim()).filter(s => s !== '');
}

// Compara com as regras do sistema: no Windows ignora maiúsculas e unifica os
// separadores (path.win32); nos demais só normaliza (path.posix). Um separador
// final (/ ou \) não conta: a entrada editada à mão com ele ainda é a nossa.
function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  const win = platform === 'win32';
  const rules = win ? path.win32 : path.posix;
  const canonical = (p: string): string => {
    const normalized = rules.normalize(p.replace(/[\\/]+$/, ''));
    return win ? normalized.toLowerCase() : normalized;
  };
  return canonical(a) === canonical(b);
}

function statOrNull(file: string): fs.Stats | null {
  try { return fs.statSync(file); } catch { return null; }
}

// Instala, atualiza e desinstala o mod da ponte de dados (ROADMAP item 25; spec
// docs/specs/2026-10-06-ponte-de-dados-mod-design.md, decisão 5). O mod viaja
// dentro do bundle (BRIDGE_MOD_FILES); instalar grava os arquivos em
// <claudeDir>/.vscode-todos-bridge/mod/claude-todos-bridge/ e acrescenta essa
// pasta ao env.CLAUDE_CODE_PLUGIN_DIRS do settings.json, que o Claude Code lê ao
// abrir cada sessão.
export class BridgeModInstaller {
  readonly modDir: string;
  private readonly markerPath: string;
  private readonly manifestPath: string;
  private readonly files: Readonly<Record<string, string>>;
  private readonly now: () => number;
  private readonly delimiter: string;
  private readonly platform: NodeJS.Platform;
  private statusMemo: { key: string; value: BridgeModStatus } | null = null;

  constructor(
    claudeDir: string,
    private readonly settings: ClaudeSettingsFile,
    opts: BridgeModInstallerOptions = {},
  ) {
    const modRoot = path.join(claudeDir, '.vscode-todos-bridge', 'mod');
    this.modDir = path.join(modRoot, BRIDGE_MOD_NAME);
    this.markerPath = path.join(modRoot, 'install.json');
    this.manifestPath = path.join(this.modDir, '.claude-plugin', 'plugin.json');
    this.files = opts.files ?? BRIDGE_MOD_FILES;
    this.now = opts.now ?? (() => Date.now());
    this.delimiter = opts.delimiter ?? path.delimiter;
    this.platform = opts.platform ?? process.platform;
  }

  // Instalado = a nossa entrada no env e a pasta do mod existem. Um
  // settings.json inválido conta como não instalado: o painel oferece Ativar, e
  // a ativação mostra o erro real. Memo: o snapshot chama status() ~3x por mudança.
  status(): BridgeModStatus {
    const manifestExists = fs.existsSync(this.manifestPath);
    const settingsStat = statOrNull(this.settings.path);
    const markerStat = statOrNull(this.markerPath);
    const key = `${settingsStat?.mtimeMs ?? -1}:${settingsStat?.size ?? -1}|${markerStat?.mtimeMs ?? -1}|${manifestExists}`;
    if (this.statusMemo?.key === key) return this.statusMemo.value;
    const value = this.readStatus(manifestExists);
    this.statusMemo = { key, value };
    return value;
  }

  private readStatus(manifestExists: boolean): BridgeModStatus {
    let listed = false;
    try {
      listed = this.pluginDirsOf(this.envOf(this.settings.read())).some(d => samePath(d, this.modDir, this.platform));
    } catch { /* settings.json inválido */ }
    if (!listed || !manifestExists) return { installed: false };
    const installedAt = this.readInstalledAt();
    return { installed: true, ...(installedAt !== undefined ? { installedAt } : {}) };
  }

  // Lança SettingsParseError quando o settings.json existe e não parseia, ou
  // quando o env ou a lista de pastas têm um formato que não é o nosso: nada é
  // gravado. `changed` = a entrada no env foi criada agora.
  install(): { changed: boolean; path: string } {
    this.statusMemo = null;
    const settings = this.settings.read();
    const env = this.envOf(settings);
    const dirs = this.pluginDirsOf(env);
    this.writeFiles();
    const listed = dirs.some(d => samePath(d, this.modDir, this.platform));
    if (!listed) {
      settings.env = { ...env, [PLUGIN_DIRS_ENV]: [...dirs, this.modDir].join(this.delimiter) };
      this.settings.write(settings);
    }
    if (!listed || this.readInstalledAt() === undefined) {
      atomicWriteFileSync(this.markerPath, JSON.stringify({ installedAt: this.now() }));
    }
    return { changed: !listed, path: this.settings.path };
  }

  // Tira a nossa entrada do env (a chave sai quando fica vazia, e o env também)
  // e apaga a pasta mod/. Os arquivos de live/ ficam para a limpeza de 30 dias.
  // `changed` = a entrada existia.
  uninstall(): { changed: boolean; path: string } {
    this.statusMemo = null;
    const settings = this.settings.read();
    const env = this.envOf(settings);
    const dirs = this.pluginDirsOf(env);
    const kept = dirs.filter(d => !samePath(d, this.modDir, this.platform));
    const changed = kept.length !== dirs.length;
    if (changed) {
      const next: Record<string, unknown> = { ...env };
      if (kept.length > 0) next[PLUGIN_DIRS_ENV] = kept.join(this.delimiter);
      else delete next[PLUGIN_DIRS_ENV];
      if (Object.keys(next).length > 0) settings.env = next;
      else delete settings.env;
      this.settings.write(settings);
    }
    fs.rmSync(path.dirname(this.modDir), { recursive: true, force: true });
    return { changed, path: this.settings.path };
  }

  // Na ativação: com o mod instalado, regrava só os arquivos cujo conteúdo
  // mudou (sessões interativas observam a pasta e recarregam o mod a cada
  // mudança). Nunca lança.
  refresh(): void {
    try {
      if (this.status().installed) this.writeFiles();
    } catch { /* disco somente leitura etc.: tenta de novo na próxima ativação */ }
  }

  private writeFiles(): void {
    for (const [rel, content] of Object.entries(this.files)) {
      const target = path.join(this.modDir, ...rel.split('/'));
      let current: string | null = null;
      try { current = fs.readFileSync(target, 'utf-8'); } catch { /* ausente */ }
      if (current === content) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      atomicWriteFileSync(target, content);
    }
  }

  private readInstalledAt(): number | undefined {
    try {
      const v = (JSON.parse(fs.readFileSync(this.markerPath, 'utf-8')) as { installedAt?: unknown }).installedAt;
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    } catch {
      return undefined;
    }
  }

  private envOf(settings: ClaudeSettings): Record<string, unknown> {
    if (settings.env === undefined) return {};
    if (settings.env === null || typeof settings.env !== 'object' || Array.isArray(settings.env)) {
      throw new SettingsParseError(this.settings.path, 'env is not an object');
    }
    return settings.env;
  }

  private pluginDirsOf(env: Record<string, unknown>): string[] {
    const raw = env[PLUGIN_DIRS_ENV];
    if (raw === undefined) return [];
    if (typeof raw !== 'string') {
      throw new SettingsParseError(this.settings.path, `env.${PLUGIN_DIRS_ENV} is not a string`);
    }
    return splitPluginDirs(raw, this.delimiter);
  }
}
