# Estado vazio inteligente (task tools desligadas) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a sessão roda em Claude Code ≥ 2.1.233 com modelo novo e sem a flag, o painel explica que as ferramentas de tasks estão desligadas e grava a flag no `settings.json` com um clique confirmado, no VS Code e no JetBrains.

**Architecture:** A detecção mora no `SessionCore`: uma função pura (`evaluateTaskTools`) combina versão do harness, modelo e o estado da flag lido de quatro fontes (memoizado por mtime) e marca `taskToolsOff` no snapshot. A ação `enableTaskTools` também mora no core, sobre uma `ClaudeSettingsFile` compartilhada com o `HookInstaller` e de leitura estrita. Os hosts só confirmam e mostram toasts; o webview só renderiza uma variante do estado vazio existente.

**Tech Stack:** TypeScript (esbuild/vite), Svelte 5 (runes), vitest; Kotlin (IntelliJ Platform, kotlinx.serialization, kotlin.test), Gradle.

**Spec:** `docs/specs/2026-09-05-task-tools-off-empty-state-design.md`

## Global Constraints

- Constante `TASK_TOOLS_OFF_SINCE = '2.1.233'`; variável `CLAUDE_CODE_ENABLE_TODO_TOOLS`.
- Valores da flag: `"1"`/`"true"` → ligada; `"0"`/`"false"` → desligada de propósito; ausente, vazio ou qualquer outro → ausente. Comparação sem distinção de caixa.
- Modelos desligados: casa `/opus-4-8|opus-5|sonnet-5|fable|mythos/i` OU major ≥ 5 em `claude-<família>-<major>-…`. Sem versão ou sem modelo → sem dica.
- Fontes da flag, nesta ordem de leitura: `process.env`, `<claudeDir>/settings.json`, `<cwd>/.claude/settings.json`, `<cwd>/.claude/settings.local.json`. Qualquer "ligada" vence; senão qualquer "desligada" vence; senão ausente. **Só** `<claudeDir>/settings.json` é escrito.
- `settings.json`: leitura estrita (arquivo presente que não parseia, ou cujo topo não é objeto, lança `SettingsParseError` e nada é escrito); arquivo ausente lê `{}`; escrita atômica via `atomicWriteFileSync` com `JSON.stringify(settings, null, 2)`.
- i18n: os cinco locales `en`, `pt-br`, `es`, `zh-cn`, `zh-tw` em `src/i18n/messages.ts`, nos cinco `package.nls*.json` e no `NotifyMessages.kt`. A paridade é testada (`tests/i18n`, `NotifyMessagesTest`). Textos pt-br verbatim da spec (Decisões/7).
- READMEs: exatamente 11 seções `##` em cada um; a landing extrai por índice (`tests/site`).
- Comandos de verificação: `npm run typecheck`, `npm run check:svelte`, `npm test`, `npm run build`. JetBrains: `cmd //c C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat test buildPlugin --console=plain` (o wrapper exige caminho absoluto neste git-bash).
- Commits: um por tarefa, título em pt-BR **sem acentos** e com prefixo convencional (`feat`, `test`, `docs`), como o histórico do repo. Terminar a mensagem com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/services/claudeSettings.ts` (novo) | Ler/escrever `settings.json` com leitura estrita; `getEnv`/`setEnv`. |
| `src/services/taskToolsGate.ts` (novo) | Regra pura (`evaluateTaskTools`, versão, modelo, flag) + `TaskToolsFlagReader` memoizado. |
| `src/services/hookInstaller.ts` | Passa a usar `ClaudeSettingsFile` (herda a leitura estrita). |
| `src/services/usageParser.ts` | Captura `lastVersion` → `AgentUsage.currentVersion`. |
| `src/services/snapshotService.ts` | Marca `taskToolsOff` no ramo sem agentes. |
| `src/core/sessionCore.ts` | `enableTaskTools()`; injeta o leitor de flag no `SnapshotService`. |
| `src/core/dispatcher.ts` | Comando `enableTaskTools` / evento `taskToolsEnabled`; `hookStatus` tolerante a erro. |
| `src/types.ts` | `SessionSnapshot.taskToolsOff`, `AgentUsage.currentVersion`, `WebviewMessage` nova. |
| `src/i18n/messages.ts`, `package.nls*.json`, `package.json` | Strings e comando. |
| `src/webview/App.svelte`, `src/webview/stores.svelte.ts` | Variante do estado vazio + `enableTaskTools()`. |
| `src/extension.ts` | Confirmação modal, comando `claudeTodos.enableTaskTools`, guardas para settings inválido. |
| `jetbrains/.../MessageRouter.kt`, `NotificationBridge.kt`, `NotifyMessages.kt`, `HookSetup.kt`, `ClaudeTodosToolWindowFactory.kt`, `ThemeShim.kt` | Ponte nativa, strings, caminho do settings e variáveis de botão. |
| READMEs ×5, `CHANGELOG.md`, `docs/ROADMAP.md` | Documentação. |

---

### Task 1: `ClaudeSettingsFile` com leitura estrita; `HookInstaller` adota a classe

**Files:**
- Create: `src/services/claudeSettings.ts`
- Test: `tests/services/claudeSettings.test.ts`
- Modify: `src/services/hookInstaller.ts` (imports, interface `Settings`, construtor, `read`/`write`)
- Test: `tests/services/hookInstaller.test.ts` (caso novo)

**Interfaces:**
- Produces: `class ClaudeSettingsFile { constructor(readonly path: string); exists(): boolean; read(): ClaudeSettings; write(s: ClaudeSettings): void; getEnv(key: string): string | undefined; setEnv(key: string, value: string): boolean }`, `class SettingsParseError extends Error { readonly path: string }`, `interface ClaudeSettings { env?: Record<string, unknown>; hooks?: Record<string, unknown>; [key: string]: unknown }`.

- [ ] **Step 1: Escrever os testes da classe nova (falham: módulo não existe)**

Criar `tests/services/claudeSettings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeSettingsFile, SettingsParseError } from '../../src/services/claudeSettings';

describe('ClaudeSettingsFile', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads {} when the file does not exist', () => {
    const file = new ClaudeSettingsFile(settingsPath);
    expect(file.exists()).toBe(false);
    expect(file.read()).toEqual({});
  });

  it('setEnv creates the file (and its parent dir) with 2-space indentation', () => {
    const nested = path.join(tmpDir, 'deeper', 'settings.json');
    const file = new ClaudeSettingsFile(nested);
    expect(file.setEnv('CLAUDE_CODE_ENABLE_TODO_TOOLS', '1')).toBe(true);
    expect(fs.readFileSync(nested, 'utf-8'))
      .toBe(JSON.stringify({ env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } }, null, 2));
  });

  it('setEnv preserves every other key and the existing env entries', () => {
    fs.writeFileSync(settingsPath, JSON.stringify(
      { model: 'opus', env: { FOO: 'bar' }, hooks: { SessionStart: [] } }, null, 2));
    new ClaudeSettingsFile(settingsPath).setEnv('CLAUDE_CODE_ENABLE_TODO_TOOLS', '1');
    expect(JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))).toEqual({
      model: 'opus',
      env: { FOO: 'bar', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' },
      hooks: { SessionStart: [] },
    });
  });

  it('setEnv is idempotent: the second call reports no change and does not rewrite', () => {
    const file = new ClaudeSettingsFile(settingsPath);
    expect(file.setEnv('K', '1')).toBe(true);
    const before = fs.statSync(settingsPath).mtimeMs;
    expect(file.setEnv('K', '1')).toBe(false);
    expect(fs.statSync(settingsPath).mtimeMs).toBe(before);
  });

  it('getEnv returns strings, stringifies numbers and booleans, undefined when absent', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { A: '1', B: 0, C: true } }));
    const file = new ClaudeSettingsFile(settingsPath);
    expect(file.getEnv('A')).toBe('1');
    expect(file.getEnv('B')).toBe('0');
    expect(file.getEnv('C')).toBe('true');
    expect(file.getEnv('Z')).toBeUndefined();
  });

  it('throws SettingsParseError on invalid JSON and leaves the file untouched', () => {
    fs.writeFileSync(settingsPath, '{ "env": { "FOO": ');
    const file = new ClaudeSettingsFile(settingsPath);
    expect(() => file.read()).toThrow(SettingsParseError);
    expect(() => file.setEnv('K', '1')).toThrow(SettingsParseError);
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ "env": { "FOO": ');
  });

  it('throws SettingsParseError when the top-level value is not an object', () => {
    fs.writeFileSync(settingsPath, '[1, 2]');
    expect(() => new ClaudeSettingsFile(settingsPath).read()).toThrow(SettingsParseError);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run tests/services/claudeSettings.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/claudeSettings'`.

- [ ] **Step 3: Implementar `src/services/claudeSettings.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run tests/services/claudeSettings.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Escrever o caso novo do `HookInstaller` (falha: hoje ele sobrescreve)**

Em `tests/services/hookInstaller.test.ts`, dentro do `describe('HookInstaller', …)`, depois do teste `'creates settings.json with hook when file does not exist'`:

```ts
  it('throws on invalid settings.json instead of overwriting it', () => {
    fs.writeFileSync(settingsPath, '{ not json');
    const installer = new HookInstaller(settingsPath);
    expect(() => installer.install('SessionStart', HOOK_COMMAND)).toThrow(/not valid JSON/);
    expect(() => installer.isInstalled('SessionStart', HOOK_COMMAND)).toThrow(/not valid JSON/);
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ not json');
  });
```

Run: `npx vitest run tests/services/hookInstaller.test.ts`
Expected: FAIL no caso novo (o `install` não lança e o arquivo é sobrescrito).

- [ ] **Step 6: Fazer o `HookInstaller` usar a classe**

Em `src/services/hookInstaller.ts`:

Substituir as três linhas de import do topo

```ts
import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteFileSync } from './atomicWrite';
```

por

```ts
import { ClaudeSettingsFile, type ClaudeSettings } from './claudeSettings';
```

Substituir a interface `Settings`

```ts
interface Settings {
  hooks?: Record<string, HookMatcher[] | undefined>;
  [key: string]: unknown;
}
```

por

```ts
interface Settings extends ClaudeSettings {
  hooks?: Record<string, HookMatcher[] | undefined>;
}
```

Substituir o construtor

```ts
  constructor(private readonly settingsPath: string) {}
```

por

```ts
  private readonly file: ClaudeSettingsFile;

  constructor(settingsPath: string) {
    this.file = new ClaudeSettingsFile(settingsPath);
  }
```

E substituir os dois métodos privados do fim da classe

```ts
  private read(): Settings {
    if (!fs.existsSync(this.settingsPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private write(settings: Settings): void {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    atomicWriteFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }
```

por

```ts
  // Leitura estrita (ClaudeSettingsFile): settings.json inválido lança em vez de
  // virar `{}` e ser sobrescrito só com os hooks.
  private read(): Settings {
    return this.file.read() as Settings;
  }

  private write(settings: Settings): void {
    this.file.write(settings);
  }
```

- [ ] **Step 7: Rodar os dois arquivos de teste e o typecheck**

Run: `npx vitest run tests/services/hookInstaller.test.ts tests/services/claudeSettings.test.ts && npm run typecheck`
Expected: PASS (16 + 7 testes); typecheck sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/services/claudeSettings.ts tests/services/claudeSettings.test.ts src/services/hookInstaller.ts tests/services/hookInstaller.test.ts
git commit -m "feat(settings): ClaudeSettingsFile com leitura estrita; HookInstaller nao sobrescreve settings invalido" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `taskToolsGate.ts` — regra pura e leitor de flag memoizado

**Files:**
- Create: `src/services/taskToolsGate.ts`
- Test: `tests/services/taskToolsGate.test.ts`

**Interfaces:**
- Produces: `TASK_TOOLS_OFF_SINCE`, `TASK_TOOLS_ENV`, `type FlagState = 'on' | 'off' | 'absent'`, `parseVersion(v): [number,number,number] | null`, `versionAtLeast(version: string | undefined, min: string): boolean`, `modelLosesTaskTools(model: string | undefined): boolean`, `flagStateOf(value: unknown): FlagState`, `combineFlagStates(states: FlagState[]): FlagState`, `interface TaskToolsSignals { version?: string; model?: string; flag: FlagState }`, `evaluateTaskTools(s: TaskToolsSignals): boolean`, `class TaskToolsFlagReader { constructor(userSettingsPath: string, env?: Record<string, string | undefined>); read(cwd: string | null): FlagState; invalidate(): void }`.

- [ ] **Step 1: Escrever os testes (falham: módulo não existe)**

Criar `tests/services/taskToolsGate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  TASK_TOOLS_ENV, TaskToolsFlagReader, combineFlagStates, evaluateTaskTools,
  flagStateOf, modelLosesTaskTools, parseVersion, versionAtLeast,
} from '../../src/services/taskToolsGate';

describe('versionAtLeast', () => {
  it('parses major.minor.patch and ignores suffixes', () => {
    expect(parseVersion('2.1.233')).toEqual([2, 1, 233]);
    expect(parseVersion('2.1.233-beta.1')).toEqual([2, 1, 233]);
    expect(parseVersion('dev')).toBeNull();
  });

  it('compares numerically per component', () => {
    expect(versionAtLeast('2.1.232', '2.1.233')).toBe(false);
    expect(versionAtLeast('2.1.233', '2.1.233')).toBe(true);
    expect(versionAtLeast('2.1.261', '2.1.233')).toBe(true);
    expect(versionAtLeast('2.2.0', '2.1.233')).toBe(true);
    expect(versionAtLeast('10.0.0', '2.1.233')).toBe(true);
    expect(versionAtLeast('2.1.9', '2.1.233')).toBe(false);
  });

  it('is false for missing or unparseable versions', () => {
    expect(versionAtLeast(undefined, '2.1.233')).toBe(false);
    expect(versionAtLeast('', '2.1.233')).toBe(false);
    expect(versionAtLeast('nope', '2.1.233')).toBe(false);
  });
});

describe('modelLosesTaskTools', () => {
  it.each([
    'claude-opus-4-8', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-fable-5-1',
    'claude-mythos-5-1', 'claude-opus-6',
  ])('%s loses the tools', (model) => {
    expect(modelLosesTaskTools(model)).toBe(true);
  });

  it.each([
    'claude-opus-4-7', 'claude-opus-4-1-20250805', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
  ])('%s keeps the tools', (model) => {
    expect(modelLosesTaskTools(model)).toBe(false);
  });

  it('is false for an unknown model', () => {
    expect(modelLosesTaskTools(undefined)).toBe(false);
    expect(modelLosesTaskTools('')).toBe(false);
  });
});

describe('flagStateOf / combineFlagStates', () => {
  it('maps values to states case-insensitively', () => {
    expect(flagStateOf('1')).toBe('on');
    expect(flagStateOf('TRUE')).toBe('on');
    expect(flagStateOf(true)).toBe('on');
    expect(flagStateOf('0')).toBe('off');
    expect(flagStateOf('false')).toBe('off');
    expect(flagStateOf(0)).toBe('off');
    expect(flagStateOf(undefined)).toBe('absent');
    expect(flagStateOf(null)).toBe('absent');
    expect(flagStateOf('')).toBe('absent');
    expect(flagStateOf('yes')).toBe('absent');
  });

  it('any on wins, then any off, else absent', () => {
    expect(combineFlagStates(['absent', 'off', 'on'])).toBe('on');
    expect(combineFlagStates(['absent', 'off'])).toBe('off');
    expect(combineFlagStates(['absent', 'absent'])).toBe('absent');
    expect(combineFlagStates([])).toBe('absent');
  });
});

describe('evaluateTaskTools', () => {
  const fable = { version: '2.1.261', model: 'claude-fable-5-1' };

  it('is true only for harness >= 2.1.233, a new model and an absent flag', () => {
    expect(evaluateTaskTools({ ...fable, flag: 'absent' })).toBe(true);
    expect(evaluateTaskTools({ version: '2.1.233', model: 'claude-opus-4-8', flag: 'absent' })).toBe(true);
  });

  it('is false before the cut, for legacy models, or without signals', () => {
    expect(evaluateTaskTools({ version: '2.1.232', model: 'claude-fable-5-1', flag: 'absent' })).toBe(false);
    expect(evaluateTaskTools({ version: '2.1.261', model: 'claude-opus-4-7', flag: 'absent' })).toBe(false);
    expect(evaluateTaskTools({ model: 'claude-fable-5-1', flag: 'absent' })).toBe(false);
    expect(evaluateTaskTools({ version: '2.1.261', flag: 'absent' })).toBe(false);
  });

  it('is false when the user turned the flag on or explicitly off', () => {
    expect(evaluateTaskTools({ ...fable, flag: 'on' })).toBe(false);
    expect(evaluateTaskTools({ ...fable, flag: 'off' })).toBe(false);
  });
});

describe('TaskToolsFlagReader', () => {
  let tmp: string;
  let userSettings: string;
  let cwd: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flag-test-'));
    userSettings = path.join(tmp, 'claude', 'settings.json');
    cwd = path.join(tmp, 'proj');
    fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  it('is absent when no source has the key (missing files included)', () => {
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('absent');
    expect(new TaskToolsFlagReader(userSettings, {}).read(null)).toBe('absent');
  });

  it('reads the user settings file', () => {
    writeJson(userSettings, { env: { [TASK_TOOLS_ENV]: '1' } });
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('on');
  });

  it('reads the project settings and settings.local files', () => {
    writeJson(path.join(cwd, '.claude', 'settings.json'), { env: { [TASK_TOOLS_ENV]: 'true' } });
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('on');
    fs.rmSync(path.join(cwd, '.claude', 'settings.json'));
    writeJson(path.join(cwd, '.claude', 'settings.local.json'), { env: { [TASK_TOOLS_ENV]: '0' } });
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('off');
  });

  it('reads the process environment and lets on win over off', () => {
    writeJson(userSettings, { env: { [TASK_TOOLS_ENV]: '0' } });
    expect(new TaskToolsFlagReader(userSettings, { [TASK_TOOLS_ENV]: '1' }).read(cwd)).toBe('on');
  });

  it('treats an unreadable file as absent', () => {
    fs.mkdirSync(path.dirname(userSettings), { recursive: true });
    fs.writeFileSync(userSettings, '{ broken');
    expect(new TaskToolsFlagReader(userSettings, {}).read(cwd)).toBe('absent');
  });

  it('memoizes by mtime and invalidate() forces a re-read', () => {
    // mtime fixado com precisao de ms ANTES da primeira leitura: mtimeMs real tem
    // precisao sub-ms e nao sobreviveria a um restore via Date.
    const fixed = new Date('2026-09-05T12:00:00Z');
    writeJson(userSettings, { env: { [TASK_TOOLS_ENV]: '1' } });
    fs.utimesSync(userSettings, fixed, fixed);
    const reader = new TaskToolsFlagReader(userSettings, {});
    expect(reader.read(cwd)).toBe('on');
    // Reescreve sem a flag mas mantem o mesmo mtime: o memo ainda responde 'on'.
    writeJson(userSettings, { env: {} });
    fs.utimesSync(userSettings, fixed, fixed);
    expect(reader.read(cwd)).toBe('on');
    reader.invalidate();
    expect(reader.read(cwd)).toBe('absent');
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run tests/services/taskToolsGate.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `src/services/taskToolsGate.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run tests/services/taskToolsGate.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/services/taskToolsGate.ts tests/services/taskToolsGate.test.ts
git commit -m "feat(core): gate das task tools (versao do harness, modelo e flag em quatro fontes)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `usageParser` captura a versão do harness (`AgentUsage.currentVersion`)

**Files:**
- Modify: `src/types.ts` (interface `AgentUsage`)
- Modify: `src/services/usageParser.ts` (`TranscriptEntry`, `readFileUsage`, `usageForSession`)
- Test: `tests/services/usageParser.test.ts`

**Interfaces:**
- Produces: `AgentUsage.currentVersion?: string` (versão do harness que gravou a última entrada com `usage` daquele agente); `readFileUsage(...)` devolve também `lastVersion?: string`.

- [ ] **Step 1: Escrever o teste (falha: campo inexistente)**

Em `tests/services/usageParser.test.ts`, dentro de `describe('UsageParser', …)`, após os helpers `writeMain`/`writeSubAgent`, acrescentar:

```ts
  it('exposes the harness version of the last usage entry as currentVersion', () => {
    writeMain([
      { ...assistant('claude-fable-5-1', { input: 10, output: 1 }), version: '2.1.240' },
      { ...assistant('claude-fable-5-1', { input: 12, output: 2 }), version: '2.1.261' },
    ]);
    const usage = parser.usageForSession(SID, CWD, [{ agentId: SID, name: 'Main agent', isMain: true }]);
    expect(usage.byAgent[0].currentVersion).toBe('2.1.261');
    expect(usage.byAgent[0].currentModel).toBe('claude-fable-5-1');
  });

  it('leaves currentVersion undefined when no usage entry carries a version', () => {
    writeMain([assistant('claude-fable-5-1', { input: 10, output: 1 })]);
    const usage = parser.usageForSession(SID, CWD, [{ agentId: SID, name: 'Main agent', isMain: true }]);
    expect(usage.byAgent[0].currentVersion).toBeUndefined();
  });
```

Run: `npx vitest run tests/services/usageParser.test.ts`
Expected: FAIL — `currentVersion` é `undefined` no primeiro caso (e erro de tipo no typecheck).

- [ ] **Step 2: Tipar o campo em `src/types.ts`**

Na interface `AgentUsage`, após `currentModel?: string;  // modelo da ÚLTIMA entrada com usage do transcript`, acrescentar:

```ts
  currentVersion?: string; // versão do Claude Code que gravou essa mesma entrada (record.version)
```

- [ ] **Step 3: Capturar a versão em `src/services/usageParser.ts`**

Na interface `TranscriptEntry`, acrescentar o campo `version?: unknown;` logo após `requestId?: unknown;`.

Na assinatura de `readFileUsage`, trocar o tipo de retorno para

```ts
{ models: ModelUsage[]; cache: CacheStats; lastModel?: string; lastVersion?: string; context?: ContextUsage }
```

Dentro da função, logo após `let lastModel: string | undefined;`, declarar `let lastVersion: string | undefined;`. No laço, logo após a linha `lastModel = msg.model;`, acrescentar:

```ts
    if (typeof entry.version === 'string') lastVersion = entry.version;
```

E no `return` final da função, trocar `return { models: [...byModel.values()], cache, lastModel, context };` por

```ts
  return { models: [...byModel.values()], cache, lastModel, lastVersion, context };
```

Em `usageForSession`, trocar a destruturação

```ts
      const { models, cache, lastModel, context: fileContext } = readFileUsage(filePath, agent.isMain);
```

por

```ts
      const { models, cache, lastModel, lastVersion, context: fileContext } = readFileUsage(filePath, agent.isMain);
```

e, no `byAgent.push({ … })`, após a linha `...(lastModel !== undefined ? { currentModel: lastModel } : {}),` acrescentar:

```ts
        ...(lastVersion !== undefined ? { currentVersion: lastVersion } : {}),
```

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npx vitest run tests/services/usageParser.test.ts tests/services/projectUsageService.test.ts && npm run typecheck`
Expected: PASS; typecheck limpo (o `ProjectUsageService` ignora o campo novo).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/services/usageParser.ts tests/services/usageParser.test.ts
git commit -m "feat(usage): captura a versao do harness da ultima entrada com usage (currentVersion)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `SnapshotService.taskToolsOff` e `SessionCore.enableTaskTools`

**Files:**
- Modify: `src/types.ts` (interface `SessionSnapshot`)
- Modify: `src/services/snapshotService.ts` (import, construtor, `build`)
- Modify: `src/core/sessionCore.ts` (imports, campos, construtor, método novo)
- Test: `tests/services/snapshotService.test.ts`, `tests/core/sessionCore.test.ts`

**Interfaces:**
- Consumes: `evaluateTaskTools`, `TaskToolsFlagReader`, `TASK_TOOLS_ENV` (Task 2); `ClaudeSettingsFile` (Task 1); `AgentUsage.currentVersion` (Task 3).
- Produces: `SessionSnapshot.taskToolsOff?: true`; `SnapshotService` aceita um 7º parâmetro opcional `taskToolsFlags?: { read(cwd: string | null): FlagState }`; `SessionCore.enableTaskTools(): { changed: boolean; path: string }`.

- [ ] **Step 1: Escrever os testes do `SnapshotService` (falham)**

Em `tests/services/snapshotService.test.ts`, após a função `makeParser`, acrescentar um helper e, no fim do `describe('SnapshotService', …)`, os casos:

```ts
// Parser sem agentes com tasks (sessão que ainda não chamou TodoWrite/TaskCreate).
function makeParserNoAgents(mtimes: Record<string, number | null>) {
  return {
    transcriptMtime: (sessionId: string, _cwd: string) => mtimes[sessionId] ?? null,
    readSessionTitle: (_sessionId: string, _cwd: string) => null,
    listForSession: (_sessionId: string) => [],
    listSessionDetail: (_sessionId: string) => ({ agents: [], awaitingInput: null, pendingQuestions: [] }),
  };
}

const newModelUsage = {
  usageForSession: () => ({
    byModel: [],
    byAgent: [{ agentId: 'a', name: 'Main agent', isMain: true, models: [], currentModel: 'claude-fable-5-1', currentVersion: '2.1.261' }],
  }),
};
const resolverA = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };
```

```ts
  it('marks taskToolsOff when there are no task agents, the harness is >= 2.1.233, the model is new and the flag is absent', () => {
    const svc = new SnapshotService(
      resolverA as any, makeParserNoAgents({ a: 100 }) as any, newModelUsage as any,
      () => new Map(), undefined, () => 0, { read: () => 'absent' as const },
    );
    expect(svc.build()?.taskToolsOff).toBe(true);
  });

  it('does not mark taskToolsOff when the flag is on or explicitly off', () => {
    for (const state of ['on', 'off'] as const) {
      const svc = new SnapshotService(
        resolverA as any, makeParserNoAgents({ a: 100 }) as any, newModelUsage as any,
        () => new Map(), undefined, () => 0, { read: () => state },
      );
      expect(svc.build()?.taskToolsOff).toBeUndefined();
    }
  });

  it('does not mark taskToolsOff once the session has task agents', () => {
    const svc = new SnapshotService(
      resolverA as any, makeParser({ mtimes: { a: 100 } }) as any, newModelUsage as any,
      () => new Map(), undefined, () => 0, { read: () => 'absent' as const },
    );
    expect(svc.build()?.taskToolsOff).toBeUndefined();
  });

  it('does not mark taskToolsOff without a flag reader (hosts that do not inject one)', () => {
    const svc = new SnapshotService(resolverA as any, makeParserNoAgents({ a: 100 }) as any, newModelUsage as any);
    expect(svc.build()?.taskToolsOff).toBeUndefined();
  });
```

Run: `npx vitest run tests/services/snapshotService.test.ts`
Expected: FAIL no primeiro caso (`taskToolsOff` é `undefined`).

- [ ] **Step 2: Tipar o campo e marcar no snapshot**

Em `src/types.ts`, na interface `SessionSnapshot`, após `pendingQuestions?: PendingQuestion[];`, acrescentar:

```ts
  // R2: true quando o Claude Code (>= 2.1.233) está com TodoWrite/TaskCreate
  // desligados para o modelo da sessão e a flag não foi ligada em nenhuma fonte.
  taskToolsOff?: true;
```

Em `src/services/snapshotService.ts`, acrescentar ao bloco de imports:

```ts
import { evaluateTaskTools, type FlagState } from './taskToolsGate';
```

No construtor, após o parâmetro `private readonly now: () => number = () => Date.now(),`, acrescentar:

```ts
    // R2: leitor da flag CLAUDE_CODE_ENABLE_TODO_TOOLS. Opcional: sem ele, o
    // snapshot nunca marca taskToolsOff (compatível com quem constrói só o básico).
    private readonly taskToolsFlags?: { read(cwd: string | null): FlagState },
```

Em `build()`, substituir o `return { … }` inteiro:

```ts
    return {
      sessionId: chosen.sessionId,
      cwd: chosen.cwd,
      title: chosen.title,
      pinned: chosen.sessionId === this.pinnedSessionId,
      agents,
      usage: this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents),
      ...(detail.awaitingInput !== null ? { awaitingInput: detail.awaitingInput } : {}),
      ...(detail.pendingQuestions.length > 0 ? { pendingQuestions: detail.pendingQuestions } : {}),
    };
```

por

```ts
    const usage = this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents);
    // R2: só no ramo sem agentes com tasks. Versão e modelo vêm da última entrada
    // com usage do main; a flag, das quatro fontes (memo por mtime no leitor).
    const main = usage.byAgent.find(a => a.isMain);
    const taskToolsOff = agents.length === 0 && this.taskToolsFlags !== undefined
      && evaluateTaskTools({
        version: main?.currentVersion,
        model: main?.currentModel,
        flag: this.taskToolsFlags.read(chosen.cwd),
      });
    return {
      sessionId: chosen.sessionId,
      cwd: chosen.cwd,
      title: chosen.title,
      pinned: chosen.sessionId === this.pinnedSessionId,
      agents,
      usage,
      ...(detail.awaitingInput !== null ? { awaitingInput: detail.awaitingInput } : {}),
      ...(detail.pendingQuestions.length > 0 ? { pendingQuestions: detail.pendingQuestions } : {}),
      ...(taskToolsOff ? { taskToolsOff: true as const } : {}),
    };
```

Run: `npx vitest run tests/services/snapshotService.test.ts`
Expected: PASS.

- [ ] **Step 3: Escrever os testes do `SessionCore` (falham: método inexistente)**

Em `tests/core/sessionCore.test.ts`: trocar a linha de import do vitest por

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

Dentro do `describe('SessionCore', …)`, alterar o `beforeEach`/`afterEach` para neutralizar a flag que o ambiente do desenvolvedor pode carregar:

```ts
  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
    vi.stubEnv('CLAUDE_CODE_ENABLE_TODO_TOOLS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });
```

Após `writeSession()`, acrescentar um helper que grava uma sessão com a versão do harness:

```ts
  function writeSessionOn(version: string, model: string): void {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), JSON.stringify({ ...assistant(model), version }));
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
  }
```

E os casos, no fim do `describe`:

```ts
  it('enableTaskTools writes the env flag to <claudeDir>/settings.json and is idempotent', () => {
    const core = make();
    const first = core.enableTaskTools();
    expect(first).toEqual({ changed: true, path: path.join(claudeDir, 'settings.json') });
    expect(JSON.parse(fs.readFileSync(first.path, 'utf-8')))
      .toEqual({ env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } });
    expect(core.enableTaskTools().changed).toBe(false);
  });

  it('enableTaskTools preserves the hooks already in settings.json', () => {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [] }, model: 'opus' }));
    make().enableTaskTools();
    expect(JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8')))
      .toEqual({ hooks: { SessionStart: [] }, model: 'opus', env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } });
  });

  it('enableTaskTools throws on an invalid settings.json and leaves it untouched', () => {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{ broken');
    expect(() => make().enableTaskTools()).toThrow(/not valid JSON/);
    expect(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8')).toBe('{ broken');
  });

  it('snapshot marks taskToolsOff for a 2.1.233+ session on a new model, and clears it after enabling', () => {
    writeSessionOn('2.1.261', 'claude-fable-5-1');
    const core = make();
    expect(core.buildSnapshot()?.taskToolsOff).toBe(true);
    core.enableTaskTools();
    expect(core.buildSnapshot()?.taskToolsOff).toBeUndefined();
  });

  it('snapshot does not mark taskToolsOff before the cut or on a legacy model', () => {
    writeSessionOn('2.1.232', 'claude-fable-5-1');
    expect(make().buildSnapshot()?.taskToolsOff).toBeUndefined();
    writeSessionOn('2.1.261', 'claude-opus-4-7');
    expect(make().buildSnapshot()?.taskToolsOff).toBeUndefined();
  });
```

Run: `npx vitest run tests/core/sessionCore.test.ts`
Expected: FAIL — `core.enableTaskTools is not a function`.

- [ ] **Step 4: Implementar no `SessionCore`**

Em `src/core/sessionCore.ts`, acrescentar aos imports:

```ts
import { ClaudeSettingsFile } from '../services/claudeSettings';
import { TaskToolsFlagReader, TASK_TOOLS_ENV } from '../services/taskToolsGate';
```

Nos campos da classe, após `private readonly snapshotService: SnapshotService;`, acrescentar:

```ts
  private readonly settingsFile: ClaudeSettingsFile;
  private readonly taskToolsFlags: TaskToolsFlagReader;
```

No construtor, antes de `const resolver = new SessionResolver(this.bridge, this.workspaceCwds);`, acrescentar:

```ts
    this.settingsFile = new ClaudeSettingsFile(path.join(this.claudeDir, 'settings.json'));
    this.taskToolsFlags = new TaskToolsFlagReader(this.settingsFile.path);
```

e passar o leitor ao `SnapshotService` (7º argumento):

```ts
    this.snapshotService = new SnapshotService(
      resolver, this.parser, this.usageParser,
      () => readLiveSessions(this.claudeDir),
      this.sessionNames,
      this.now,
      this.taskToolsFlags,
    );
```

Após o método `installHook(...)`, acrescentar:

```ts
  // R2: religa TodoWrite/TaskCreate nos modelos novos (Claude Code >= 2.1.233)
  // gravando a env var no settings.json do USUÁRIO — as fontes de projeto são só
  // leitura. Lança SettingsParseError se o arquivo existir e não parsear (nada é
  // escrito). Invalida o memo do leitor para o próximo snapshot já refletir.
  enableTaskTools(): { changed: boolean; path: string } {
    const changed = this.settingsFile.setEnv(TASK_TOOLS_ENV, '1');
    this.taskToolsFlags.invalidate();
    return { changed, path: this.settingsFile.path };
  }
```

- [ ] **Step 5: Rodar os testes e o typecheck**

Run: `npx vitest run tests/core tests/services && npm run typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/services/snapshotService.ts src/core/sessionCore.ts tests/services/snapshotService.test.ts tests/core/sessionCore.test.ts
git commit -m "feat(core): snapshot marca taskToolsOff e SessionCore.enableTaskTools grava a flag" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `dispatcher` — comando `enableTaskTools` e `hookStatus` tolerante

**Files:**
- Modify: `src/core/dispatcher.ts` (`CoreCommand`, `CoreEvent`, `switch`)
- Test: `tests/core/dispatcher.test.ts`

**Interfaces:**
- Consumes: `SessionCore.enableTaskTools()` (Task 4).
- Produces: `{ cmd: 'enableTaskTools'; id? }` → `{ ev: 'taskToolsEnabled'; changed: boolean; path: string; id? }` ou `{ ev: 'error'; message; id? }`. `hookStatus` passa a responder `{ ev: 'error' }` em vez de lançar quando o settings é inválido.

- [ ] **Step 1: Escrever os testes (falham)**

Em `tests/core/dispatcher.test.ts`, no objeto de `fakeCore`, após `installHook: (_p: string) => {},`, acrescentar:

```ts
    enableTaskTools: () => ({ changed: true, path: '/c/settings.json' }),
```

No fim do `describe('createDispatcher', …)`:

```ts
  it('enableTaskTools echoes the result with the id, and maps a throw to error', () => {
    const base = [{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }];
    expect(run([...base, { cmd: 'enableTaskTools', id: 'tt-1' }]).at(-1))
      .toEqual({ ev: 'taskToolsEnabled', changed: true, path: '/c/settings.json', id: 'tt-1' });
    const broken = fakeCore({ enableTaskTools: () => { throw new Error('bad json'); } });
    expect(run([...base, { cmd: 'enableTaskTools', id: 'tt-2' }], broken).at(-1))
      .toEqual({ ev: 'error', message: 'Error: bad json', id: 'tt-2' });
  });

  it('hookStatus maps a throw (invalid settings.json) to error instead of crashing the sidecar', () => {
    const broken = fakeCore({ hookStatus: () => { throw new Error('bad json'); } });
    const events = run(
      [{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }, { cmd: 'hookStatus', hookScriptPath: '/h.js', id: 'hs-1' }],
      broken,
    );
    expect(events.at(-1)).toEqual({ ev: 'error', message: 'Error: bad json', id: 'hs-1' });
  });
```

Run: `npx vitest run tests/core/dispatcher.test.ts`
Expected: FAIL — `unknown command: enableTaskTools` e exceção não capturada em `hookStatus`.

- [ ] **Step 2: Implementar**

Em `src/core/dispatcher.ts`, no tipo `CoreCommand`, após `| { cmd: 'installHook'; hookScriptPath: string }`, acrescentar:

```ts
  | { cmd: 'enableTaskTools' }
```

No tipo `CoreEvent`, após `| { ev: 'hookInstalled' }`, acrescentar:

```ts
  | { ev: 'taskToolsEnabled'; changed: boolean; path: string }
```

Substituir o `case 'hookStatus':`

```ts
      case 'hookStatus':
        emit(withId({ ev: 'hookStatus', installed: core.hookStatus(cmd.hookScriptPath) }, cmd.id));
        break;
```

por

```ts
      case 'hookStatus':
        // settings.json inválido lança (leitura estrita): responder erro com o id
        // em vez de derrubar o sidecar — o host mostra o toast de falha do hook.
        try {
          emit(withId({ ev: 'hookStatus', installed: core.hookStatus(cmd.hookScriptPath) }, cmd.id));
        } catch (err) {
          emit(withId({ ev: 'error', message: String(err) }, cmd.id));
        }
        break;
```

E, antes do `default: {`, acrescentar:

```ts
      case 'enableTaskTools':
        try {
          const r = core.enableTaskTools();
          emit(withId({ ev: 'taskToolsEnabled', changed: r.changed, path: r.path }, cmd.id));
        } catch (err) {
          emit(withId({ ev: 'error', message: String(err) }, cmd.id));
        }
        break;
```

- [ ] **Step 3: Rodar e commitar**

Run: `npx vitest run tests/core/dispatcher.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/core/dispatcher.ts tests/core/dispatcher.test.ts
git commit -m "feat(sidecar): comando enableTaskTools e hookStatus tolerante a settings invalido" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: i18n em cinco idiomas e comando na paleta

**Files:**
- Modify: `src/i18n/messages.ts` (10 chaves × 5 locales)
- Modify: `package.nls.json`, `package.nls.pt-br.json`, `package.nls.es.json`, `package.nls.zh-cn.json`, `package.nls.zh-tw.json`
- Modify: `package.json` (`contributes.commands`)
- Test: `tests/i18n/*` (já existem; só precisam continuar verdes)

**Interfaces:**
- Produces: chaves `app.taskToolsOff.title|body|button|hint`, `taskTools.confirm|enable|cancel|enabled|alreadyEnabled|failed` (`{path}`, `{error}` como parâmetros de `t()`); chave nls `command.enableTaskTools.title`; comando `claudeTodos.enableTaskTools` declarado.

- [ ] **Step 1: Acrescentar as chaves no catálogo**

Em `src/i18n/messages.ts`, em **cada** bloco de locale, inserir as quatro chaves `app.taskToolsOff.*` logo após a linha `'app.awaitingSubAfter': …,` daquele bloco, e as seis chaves `taskTools.*` logo após a linha `'hook.installFailed': …,` do mesmo bloco. O bloco `en` é a fonte do tipo `MessageKey`; os demais têm de ter exatamente as mesmas chaves (teste de paridade).

Bloco `en`:

```ts
    'app.taskToolsOff.title': 'Task tools are off in this Claude Code',
    'app.taskToolsOff.body': 'Since 2.1.233, Claude Code turns TodoWrite/TaskCreate off by default on newer models, so the agent cannot record tasks. The rest of the panel keeps working.',
    'app.taskToolsOff.button': 'Enable task tools',
    'app.taskToolsOff.hint': 'Writes env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1" to ~/.claude/settings.json. Asks first.',
```

```ts
    'taskTools.confirm': 'Claude Todos will add env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1" to {path}. Other settings are preserved. New Claude Code sessions get the task tools back.',
    'taskTools.enable': 'Enable',
    'taskTools.cancel': 'Cancel',
    'taskTools.enabled': 'Task tools enabled. New sessions start with them; for open sessions, send a message or restart.',
    'taskTools.alreadyEnabled': 'Task tools are already enabled in {path}.',
    'taskTools.failed': 'Could not update {path}: {error}',
```

Bloco `'pt-br'`:

```ts
    'app.taskToolsOff.title': 'Ferramentas de tasks desligadas neste Claude Code',
    'app.taskToolsOff.body': 'A partir da 2.1.233 o Claude Code desliga TodoWrite/TaskCreate por padrão nos modelos novos, então o agente não consegue registrar tasks. O resto do painel continua funcionando.',
    'app.taskToolsOff.button': 'Ativar ferramentas de tasks',
    'app.taskToolsOff.hint': 'Grava env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1" em ~/.claude/settings.json. Pede confirmação antes.',
```

```ts
    'taskTools.confirm': 'O Claude Todos vai adicionar env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1" em {path}. As outras configurações são preservadas. Sessões novas do Claude Code voltam a ter as ferramentas de tasks.',
    'taskTools.enable': 'Ativar',
    'taskTools.cancel': 'Cancelar',
    'taskTools.enabled': 'Ferramentas de tasks ativadas. Sessões novas já saem com elas; nas abertas, mande uma mensagem ou reinicie.',
    'taskTools.alreadyEnabled': 'As ferramentas de tasks já estão ativadas em {path}.',
    'taskTools.failed': 'Não foi possível atualizar {path}: {error}',
```

Bloco `es`:

```ts
    'app.taskToolsOff.title': 'Herramientas de tareas desactivadas en este Claude Code',
    'app.taskToolsOff.body': 'Desde la 2.1.233, Claude Code desactiva TodoWrite/TaskCreate por defecto en los modelos nuevos, así que el agente no puede registrar tareas. El resto del panel sigue funcionando.',
    'app.taskToolsOff.button': 'Activar herramientas de tareas',
    'app.taskToolsOff.hint': 'Escribe env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1" en ~/.claude/settings.json. Pide confirmación antes.',
```

```ts
    'taskTools.confirm': 'Claude Todos agregará env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1" en {path}. Los demás ajustes se conservan. Las sesiones nuevas de Claude Code recuperan las herramientas de tareas.',
    'taskTools.enable': 'Activar',
    'taskTools.cancel': 'Cancelar',
    'taskTools.enabled': 'Herramientas de tareas activadas. Las sesiones nuevas ya arrancan con ellas; en las abiertas, envía un mensaje o reinicia.',
    'taskTools.alreadyEnabled': 'Las herramientas de tareas ya están activadas en {path}.',
    'taskTools.failed': 'No se pudo actualizar {path}: {error}',
```

Bloco `'zh-cn'`:

```ts
    'app.taskToolsOff.title': '此 Claude Code 已关闭任务工具',
    'app.taskToolsOff.body': '自 2.1.233 起，Claude Code 在新模型上默认关闭 TodoWrite/TaskCreate，智能体无法记录任务。面板的其余功能不受影响。',
    'app.taskToolsOff.button': '开启任务工具',
    'app.taskToolsOff.hint': '会在 ~/.claude/settings.json 中写入 env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"，写入前会先确认。',
```

```ts
    'taskTools.confirm': 'Claude Todos 将在 {path} 中添加 env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"。其他设置会被保留。新的 Claude Code 会话将恢复任务工具。',
    'taskTools.enable': '开启',
    'taskTools.cancel': '取消',
    'taskTools.enabled': '任务工具已开启。新会话会直接带有这些工具；已打开的会话请发送一条消息或重启。',
    'taskTools.alreadyEnabled': '{path} 中已开启任务工具。',
    'taskTools.failed': '无法更新 {path}：{error}',
```

Bloco `'zh-tw'`:

```ts
    'app.taskToolsOff.title': '此 Claude Code 已關閉任務工具',
    'app.taskToolsOff.body': '自 2.1.233 起，Claude Code 在新模型上預設關閉 TodoWrite/TaskCreate，智慧體無法記錄任務。面板的其餘功能不受影響。',
    'app.taskToolsOff.button': '開啟任務工具',
    'app.taskToolsOff.hint': '會在 ~/.claude/settings.json 中寫入 env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"，寫入前會先確認。',
```

```ts
    'taskTools.confirm': 'Claude Todos 將在 {path} 中加入 env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"。其他設定會被保留。新的 Claude Code 工作階段將恢復任務工具。',
    'taskTools.enable': '開啟',
    'taskTools.cancel': '取消',
    'taskTools.enabled': '任務工具已開啟。新的工作階段會直接帶有這些工具；已開啟的工作階段請傳送一則訊息或重新啟動。',
    'taskTools.alreadyEnabled': '{path} 中已開啟任務工具。',
    'taskTools.failed': '無法更新 {path}：{error}',
```

- [ ] **Step 2: Declarar o comando**

Em `package.json`, em `contributes.commands`, após o objeto de `claudeTodos.pickSession`, acrescentar:

```json
      {
        "command": "claudeTodos.enableTaskTools",
        "title": "%command.enableTaskTools.title%"
      }
```

Em cada `package.nls*.json`, após a linha `"command.pickSession.title": …,`, acrescentar (os arquivos zh mantêm os títulos de comando em inglês, como os demais comandos):

| Arquivo | Linha |
|---|---|
| `package.nls.json` | `"command.enableTaskTools.title": "Claude Todos: Enable Claude Code task tools",` |
| `package.nls.pt-br.json` | `"command.enableTaskTools.title": "Claude Todos: Ativar ferramentas de tasks do Claude Code",` |
| `package.nls.es.json` | `"command.enableTaskTools.title": "Claude Todos: Activar herramientas de tareas de Claude Code",` |
| `package.nls.zh-cn.json` | `"command.enableTaskTools.title": "Claude Todos: Enable Claude Code task tools",` |
| `package.nls.zh-tw.json` | `"command.enableTaskTools.title": "Claude Todos: Enable Claude Code task tools",` |

- [ ] **Step 3: Rodar os testes de paridade e o typecheck**

Run: `npx vitest run tests/i18n && npm run typecheck`
Expected: PASS (`catalog completeness` para os 4 locales; `package.nls parity` para os 4 arquivos).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages.ts package.json package.nls.json package.nls.pt-br.json package.nls.es.json package.nls.zh-cn.json package.nls.zh-tw.json
git commit -m "feat(i18n): strings do estado vazio de task tools em 5 idiomas e comando na paleta" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Webview — variante do estado vazio com o botão

**Files:**
- Modify: `src/types.ts` (`WebviewMessage`)
- Modify: `src/webview/stores.svelte.ts` (método `enableTaskTools`)
- Modify: `src/webview/App.svelte` (ramo novo + CSS)
- Test: `tests/webview/bridge.test.ts` (caso novo)

**Interfaces:**
- Consumes: `SessionSnapshot.taskToolsOff` (Task 4); chaves `app.taskToolsOff.*` (Task 6).
- Produces: `WebviewMessage` ganha `{ type: 'enableTaskTools' }`; `todosStore.enableTaskTools(): void`.

- [ ] **Step 1: Escrever o teste (falha no typecheck: tipo não aceito)**

Em `tests/webview/bridge.test.ts`, dentro de `describe('createVscodeBridge', …)`, acrescentar:

```ts
  it('post accepts the enableTaskTools message', () => {
    const postMessage = vi.fn();
    const bridge = createVscodeBridge({ addEventListener: vi.fn() } as any, () => ({ postMessage }));
    bridge.post({ type: 'enableTaskTools' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'enableTaskTools' });
  });
```

Run: `npm run typecheck`
Expected: FAIL — `'enableTaskTools'` não é atribuível a `WebviewMessage['type']`.

- [ ] **Step 2: Tipar a mensagem e expor na store**

Em `src/types.ts`, no tipo `WebviewMessage`, após `| { type: 'pickSession' }`, acrescentar:

```ts
  | { type: 'enableTaskTools' }
```

Em `src/webview/stores.svelte.ts`, após o método `pickSession()`, acrescentar:

```ts
  // R2: botão do estado vazio "ferramentas de tasks desligadas". O host confirma
  // e grava; o snapshot seguinte já vem sem taskToolsOff.
  enableTaskTools(): void {
    this.post({ type: 'enableTaskTools' });
  }
```

- [ ] **Step 3: Renderizar a variante em `src/webview/App.svelte`**

Substituir o ramo `{:else}` do bloco de agentes

```svelte
    {:else}
      <div class="awaiting">
        <p class="awaiting-title">{todosStore.t('app.awaitingTitle')}</p>
        <p class="awaiting-sub">{todosStore.t('app.awaitingSubBefore')}<code>TodoWrite</code>{todosStore.t('app.awaitingSubAfter')}</p>
      </div>
    {/if}
```

por

```svelte
    {:else if snapshot.taskToolsOff}
      <div class="awaiting task-tools-off">
        <p class="awaiting-title">{todosStore.t('app.taskToolsOff.title')}</p>
        <p class="awaiting-sub">{todosStore.t('app.taskToolsOff.body')}</p>
        <button class="primary" onclick={() => todosStore.enableTaskTools()}>{todosStore.t('app.taskToolsOff.button')}</button>
        <p class="awaiting-hint">{todosStore.t('app.taskToolsOff.hint')}</p>
      </div>
    {:else}
      <div class="awaiting">
        <p class="awaiting-title">{todosStore.t('app.awaitingTitle')}</p>
        <p class="awaiting-sub">{todosStore.t('app.awaitingSubBefore')}<code>TodoWrite</code>{todosStore.t('app.awaitingSubAfter')}</p>
      </div>
    {/if}
```

No `<style>`, após o bloco `.awaiting code { … }`, acrescentar:

```css
  .primary {
    margin-top: 0.6rem;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 0.35rem 0.8rem;
    font: inherit;
    cursor: pointer;
  }
  .primary:hover {
    background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
    filter: brightness(1.08);
  }
  .awaiting-hint { font-size: 0.72rem; opacity: 0.7; margin-top: 0.45rem; }
```

- [ ] **Step 4: Verificar tipos, Svelte, testes e build do webview**

Run: `npm run typecheck && npm run check:svelte && npx vitest run tests/webview && npm run build:webview`
Expected: tudo verde; o bundle do webview gera sem aviso novo.

Opcional (visual): a skill `preview-webview` do repo renderiza o painel com um snapshot de teste; usar um snapshot com `agents: []` e `taskToolsOff: true` para conferir o botão nos temas claro e escuro.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/webview/stores.svelte.ts src/webview/App.svelte tests/webview/bridge.test.ts
git commit -m "feat(webview): variante do estado vazio com botao Ativar ferramentas de tasks" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Host VS Code — confirmação modal, comando e guardas

**Files:**
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `core.enableTaskTools()` (Task 4), mensagem `enableTaskTools` (Task 7), chaves `taskTools.*` (Task 6), comando declarado em `package.json` (Task 6).

Não há teste unitário para `extension.ts` (depende do módulo `vscode`); a verificação é `typecheck` + `build` + o roteiro manual da Task 11.

- [ ] **Step 1: Proteger a ativação contra settings.json inválido**

Em `activate()`, substituir

```ts
  const hookInstaller = new HookInstaller(settingsPath);
  const removedLegacy = hookInstaller.cleanupLegacyHooks(HOOK_EVENTS, LEGACY_HOOK_PATTERN, hookCommand);
```

por

```ts
  const hookInstaller = new HookInstaller(settingsPath);
  // Leitura estrita: settings.json inválido lança. A ativação não pode morrer por
  // isso — o usuário vê o erro real ao tentar instalar o hook ou ativar as task tools.
  let removedLegacy = 0;
  try {
    removedLegacy = hookInstaller.cleanupLegacyHooks(HOOK_EVENTS, LEGACY_HOOK_PATTERN, hookCommand);
  } catch { /* settings.json inválido: pula a limpeza */ }
```

Em `maybePromptInstallHook`, substituir

```ts
  if (installer.areAllInstalled(HOOK_EVENTS, command)) return;
```

por

```ts
  try {
    if (installer.areAllInstalled(HOOK_EVENTS, command)) return;
  } catch {
    return; // settings.json inválido: não dá para saber; o comando manual mostra o erro
  }
```

- [ ] **Step 2: Fluxo de ativação com confirmação**

Em `activate()`, logo após a definição de `showSessionPicker` (antes de `const handleMessage = …`), acrescentar:

```ts
  // R2: grava env.CLAUDE_CODE_ENABLE_TODO_TOOLS="1" no settings.json do usuário,
  // sempre atrás de confirmação modal (o Cancelar é o botão implícito do diálogo).
  // Usado pelo botão do estado vazio e pelo comando da paleta.
  const enableTaskTools = async (): Promise<void> => {
    const t = createT(resolveLocale());
    const choice = await vscode.window.showInformationMessage(
      t('taskTools.confirm', { path: settingsPath }),
      { modal: true },
      t('taskTools.enable'),
    );
    if (choice !== t('taskTools.enable')) return;
    try {
      const result = core.enableTaskTools();
      vscode.window.showInformationMessage(
        result.changed ? t('taskTools.enabled') : t('taskTools.alreadyEnabled', { path: result.path }),
      );
    } catch (err) {
      vscode.window.showErrorMessage(t('taskTools.failed', { path: settingsPath, error: String(err) }));
    }
    viewProvider.pushSnapshot();
    panelProvider.pushSnapshot();
  };
```

Em `handleMessage`, antes do ramo `} else if (msg.type === 'pickSession') {`, acrescentar:

```ts
    } else if (msg.type === 'enableTaskTools') {
      void enableTaskTools();
```

No `context.subscriptions.push(` dos comandos, após o `registerCommand('claudeTodos.pickSession', …)`, acrescentar:

```ts
    vscode.commands.registerCommand('claudeTodos.enableTaskTools', () => {
      void enableTaskTools();
    }),
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run build && npm test`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat(vscode): confirmacao modal e comando claudeTodos.enableTaskTools" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: JetBrains — ponte nativa, strings e variáveis de botão

**Files:**
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/MessageRouter.kt` (`RouterHost`, ramo `enableTaskTools`)
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotificationBridge.kt` (`notify`)
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotifyMessages.kt` (6 chaves × 5 locales)
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/HookSetup.kt` (`claudeDir()`, `settingsPath()`)
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ClaudeTodosToolWindowFactory.kt` (implementação do host)
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ThemeShim.kt` (3 variáveis)
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/MessageRouterTest.kt`, `ThemeShimTest.kt` (`NotifyMessagesTest` já cobre as chaves)

**Interfaces:**
- Consumes: comando `enableTaskTools` / evento `taskToolsEnabled` do sidecar (Task 5); mensagem `enableTaskTools` do webview (Task 7).
- Produces: `RouterHost.confirm(messageKey: String, onOk: () -> Unit)`, `RouterHost.info(messageKey: String, args: Map<String, String> = emptyMap())`, `RouterHost.error(messageKey: String, args: Map<String, String> = emptyMap())`; `NotificationBridge.notify(messageKey, args, type)`; `HookSetup.claudeDir()`, `HookSetup.settingsPath()`; variáveis CSS `--vscode-button-background`, `--vscode-button-foreground`, `--vscode-button-hoverBackground`.

- [ ] **Step 1: Escrever os testes do router (falham: `FakeHost` não compila)**

Em `MessageRouterTest.kt`, na classe `FakeHost`, acrescentar campos e overrides:

```kotlin
        val confirms = mutableListOf<String>()
        val infos = mutableListOf<Pair<String, Map<String, String>>>()
        val errors = mutableListOf<Pair<String, Map<String, String>>>()
        var autoConfirm = true
        override fun confirm(messageKey: String, onOk: () -> Unit) { confirms += messageKey; if (autoConfirm) onOk() }
        override fun info(messageKey: String, args: Map<String, String>) { infos += messageKey to args }
        override fun error(messageKey: String, args: Map<String, String>) { errors += messageKey to args }
```

E os testes (garantir `import kotlin.test.assertTrue` no arquivo):

```kotlin
    @Test fun `enableTaskTools asks for confirmation, calls the sidecar and toasts the result`() {
        router.onWebviewMessage("""{"type":"enableTaskTools"}""")
        assertEquals(listOf("taskTools.confirm"), host.confirms)
        val cmd = parse(toSidecar.single())
        assertEquals("enableTaskTools", cmd["cmd"]!!.jsonPrimitive.content)
        val id = cmd["id"]!!.jsonPrimitive.content
        router.onSidecarEvent("""{"ev":"taskToolsEnabled","changed":true,"path":"/c/settings.json","id":"$id"}""")
        assertEquals("taskTools.enabled" to mapOf("path" to "/c/settings.json"), host.infos.single())
        assertEquals("getSnapshot", parse(toSidecar.last())["cmd"]!!.jsonPrimitive.content)
    }

    @Test fun `enableTaskTools already enabled toasts alreadyEnabled`() {
        router.onWebviewMessage("""{"type":"enableTaskTools"}""")
        val id = parse(toSidecar.single())["id"]!!.jsonPrimitive.content
        router.onSidecarEvent("""{"ev":"taskToolsEnabled","changed":false,"path":"/c/settings.json","id":"$id"}""")
        assertEquals("taskTools.alreadyEnabled", host.infos.single().first)
    }

    @Test fun `enableTaskTools error event becomes an error toast`() {
        router.onWebviewMessage("""{"type":"enableTaskTools"}""")
        val id = parse(toSidecar.single())["id"]!!.jsonPrimitive.content
        router.onSidecarEvent("""{"ev":"error","message":"boom","id":"$id"}""")
        assertEquals("taskTools.failed", host.errors.single().first)
        assertEquals("boom", host.errors.single().second["error"])
    }

    @Test fun `enableTaskTools declined sends nothing to the sidecar`() {
        host.autoConfirm = false
        router.onWebviewMessage("""{"type":"enableTaskTools"}""")
        assertEquals(listOf("taskTools.confirm"), host.confirms)
        assertTrue(toSidecar.isEmpty())
    }
```

Em `ThemeShimTest.kt`, trocar as duas ocorrências de `20` por `23` (asserções `assertEquals(20, ThemeShim.VAR_NAMES.size)` → `23`) e renomear o teste `` `emits all 20 vars with concrete values` `` para `` `emits all 23 vars with concrete values` `` e `` `variables map has the 20 names with non-empty values` `` para `` `variables map has the 23 names with non-empty values` ``.

Run: `cmd //c C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat test --console=plain`
Expected: FAIL de compilação (`FakeHost` sobrescreve métodos inexistentes) — é o vermelho esperado.

- [ ] **Step 2: `RouterHost` e o ramo no `MessageRouter`**

Em `MessageRouter.kt`, na interface `RouterHost`, após `fun warn(messageKey: String)`, acrescentar:

```kotlin
    /** Diálogo modal Sim/Não; chama [onOk] só se o usuário confirmar. O host preenche `{path}`. */
    fun confirm(messageKey: String, onOk: () -> Unit)
    fun info(messageKey: String, args: Map<String, String> = emptyMap())
    fun error(messageKey: String, args: Map<String, String> = emptyMap())
```

No `when` de `onWebviewMessage`, antes de `"openPanel" -> host.activatePanel()`, acrescentar:

```kotlin
            "enableTaskTools" -> host.confirm("taskTools.confirm") {
                val id = "tt-${nextId.getAndIncrement()}"
                pending[id] = { ev ->
                    if (ev["ev"]?.jsonPrimitive?.content == "taskToolsEnabled") {
                        val changed = ev["changed"]?.jsonPrimitive?.booleanOrNull ?: false
                        val path = ev["path"]?.jsonPrimitive?.contentOrNull ?: ""
                        host.info(if (changed) "taskTools.enabled" else "taskTools.alreadyEnabled", mapOf("path" to path))
                    } else {
                        host.error("taskTools.failed", mapOf(
                            "error" to (ev["message"]?.jsonPrimitive?.contentOrNull ?: "unknown error"),
                        ))
                    }
                    sendToSidecar("""{"cmd":"getSnapshot"}""")
                }
                sendToSidecar(buildJsonObject { put("cmd", "enableTaskTools"); put("id", id) }.toString())
            }
```

- [ ] **Step 3: Strings em `NotifyMessages.kt`**

Na lista `KEYS`, após `"hook.installedAuto", "hook.installFailed",`, acrescentar:

```kotlin
        "taskTools.confirm", "taskTools.enable", "taskTools.cancel",
        "taskTools.enabled", "taskTools.alreadyEnabled", "taskTools.failed",
```

Em cada mapa de locale, após a entrada `"hook.installFailed" to …,`, acrescentar (textos idênticos aos do catálogo TS da Task 6):

`"en"`:
```kotlin
            "taskTools.confirm" to "Claude Todos will add env.CLAUDE_CODE_ENABLE_TODO_TOOLS = \"1\" to {path}. Other settings are preserved. New Claude Code sessions get the task tools back.",
            "taskTools.enable" to "Enable",
            "taskTools.cancel" to "Cancel",
            "taskTools.enabled" to "Task tools enabled. New sessions start with them; for open sessions, send a message or restart.",
            "taskTools.alreadyEnabled" to "Task tools are already enabled in {path}.",
            "taskTools.failed" to "Could not update {path}: {error}",
```

`"pt-br"`:
```kotlin
            "taskTools.confirm" to "O Claude Todos vai adicionar env.CLAUDE_CODE_ENABLE_TODO_TOOLS = \"1\" em {path}. As outras configurações são preservadas. Sessões novas do Claude Code voltam a ter as ferramentas de tasks.",
            "taskTools.enable" to "Ativar",
            "taskTools.cancel" to "Cancelar",
            "taskTools.enabled" to "Ferramentas de tasks ativadas. Sessões novas já saem com elas; nas abertas, mande uma mensagem ou reinicie.",
            "taskTools.alreadyEnabled" to "As ferramentas de tasks já estão ativadas em {path}.",
            "taskTools.failed" to "Não foi possível atualizar {path}: {error}",
```

`"es"`:
```kotlin
            "taskTools.confirm" to "Claude Todos agregará env.CLAUDE_CODE_ENABLE_TODO_TOOLS = \"1\" en {path}. Los demás ajustes se conservan. Las sesiones nuevas de Claude Code recuperan las herramientas de tareas.",
            "taskTools.enable" to "Activar",
            "taskTools.cancel" to "Cancelar",
            "taskTools.enabled" to "Herramientas de tareas activadas. Las sesiones nuevas ya arrancan con ellas; en las abiertas, envía un mensaje o reinicia.",
            "taskTools.alreadyEnabled" to "Las herramientas de tareas ya están activadas en {path}.",
            "taskTools.failed" to "No se pudo actualizar {path}: {error}",
```

`"zh-cn"`:
```kotlin
            "taskTools.confirm" to "Claude Todos 将在 {path} 中添加 env.CLAUDE_CODE_ENABLE_TODO_TOOLS = \"1\"。其他设置会被保留。新的 Claude Code 会话将恢复任务工具。",
            "taskTools.enable" to "开启",
            "taskTools.cancel" to "取消",
            "taskTools.enabled" to "任务工具已开启。新会话会直接带有这些工具；已打开的会话请发送一条消息或重启。",
            "taskTools.alreadyEnabled" to "{path} 中已开启任务工具。",
            "taskTools.failed" to "无法更新 {path}：{error}",
```

`"zh-tw"`:
```kotlin
            "taskTools.confirm" to "Claude Todos 將在 {path} 中加入 env.CLAUDE_CODE_ENABLE_TODO_TOOLS = \"1\"。其他設定會被保留。新的 Claude Code 工作階段將恢復任務工具。",
            "taskTools.enable" to "開啟",
            "taskTools.cancel" to "取消",
            "taskTools.enabled" to "任務工具已開啟。新的工作階段會直接帶有這些工具；已開啟的工作階段請傳送一則訊息或重新啟動。",
            "taskTools.alreadyEnabled" to "{path} 中已開啟任務工具。",
            "taskTools.failed" to "無法更新 {path}：{error}",
```

- [ ] **Step 4: `NotificationBridge.notify`, `HookSetup.settingsPath` e a implementação do host**

Em `NotificationBridge.kt`, após o método `warn(messageKey)`, acrescentar:

```kotlin
    fun notify(messageKey: String, args: Map<String, String>, type: NotificationType) {
        val text = NotifyMessages.get(locale, messageKey, *args.map { it.key to it.value }.toTypedArray())
        NotificationGroupManager.getInstance().getNotificationGroup("claude-todos")
            .createNotification(text, type)
            .notify(project)
    }
```

Em `HookSetup.kt`, substituir o corpo de `ensureHookScript` para usar um helper compartilhado:

```kotlin
object HookSetup {
    fun claudeDir(): String = System.getenv("CLAUDE_CONFIG_DIR")
        ?: File(System.getProperty("user.home"), ".claude").absolutePath

    /** Mesmo arquivo que o sidecar grava em enableTaskTools — só para exibir no diálogo. */
    fun settingsPath(): String = File(claudeDir(), "settings.json").absolutePath

    fun ensureHookScript(): String {
        val target = File(claudeDir(), ".vscode-todos-bridge/hook.js")
        target.parentFile.mkdirs()
        javaClass.classLoader.getResourceAsStream("claudetodos/hook.js")!!.use { input ->
            Files.copy(input, target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
        return target.absolutePath
    }
}
```

Em `ClaudeTodosToolWindowFactory.kt`, acrescentar o import `import com.intellij.notification.NotificationType` e, dentro do `object : RouterHost { … }`, após `override fun warn(...)`, acrescentar:

```kotlin
            private val settingsPath = HookSetup.settingsPath()
            private fun withPath(args: Map<String, String>) =
                if (args["path"].isNullOrEmpty()) args + ("path" to settingsPath) else args

            override fun confirm(messageKey: String, onOk: () -> Unit) {
                SwingUtilities.invokeLater {
                    val answer = com.intellij.openapi.ui.Messages.showYesNoDialog(
                        project,
                        NotifyMessages.get(locale, messageKey, "path" to settingsPath),
                        "Claude Todos",
                        NotifyMessages.get(locale, "taskTools.enable"),
                        NotifyMessages.get(locale, "taskTools.cancel"),
                        com.intellij.openapi.ui.Messages.getQuestionIcon(),
                    )
                    if (answer == com.intellij.openapi.ui.Messages.YES) onOk()
                }
            }
            override fun info(messageKey: String, args: Map<String, String>) {
                SwingUtilities.invokeLater { bridge.notify(messageKey, withPath(args), NotificationType.INFORMATION) }
            }
            override fun error(messageKey: String, args: Map<String, String>) {
                SwingUtilities.invokeLater { bridge.notify(messageKey, withPath(args), NotificationType.ERROR) }
            }
```

- [ ] **Step 5: Variáveis de botão no `ThemeShim.kt`**

Na lista `VAR_NAMES`, após `"charts-red", "charts-yellow",`, acrescentar:

```kotlin
        "button-background", "button-foreground", "button-hoverBackground",
```

No mapa `values`, após `"charts-yellow" to "#d6a243",`, acrescentar:

```kotlin
            "button-background" to hex(accent),
            "button-foreground" to "#ffffff",
            "button-hoverBackground" to hex(accent),
```

Atualizar o comentário do topo do arquivo de "20 vars" para "23 vars".

- [ ] **Step 6: Testes e build do plugin**

Run: `cmd //c C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat test buildPlugin --console=plain`
Expected: BUILD SUCCESSFUL; `MessageRouterTest`, `NotifyMessagesTest` e `ThemeShimTest` verdes.

- [ ] **Step 7: Commit**

```bash
git add jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/MessageRouter.kt jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotificationBridge.kt jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotifyMessages.kt jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/HookSetup.kt jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ClaudeTodosToolWindowFactory.kt jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ThemeShim.kt jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/MessageRouterTest.kt jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/ThemeShimTest.kt
git commit -m "feat(jetbrains): enableTaskTools com confirmacao nativa, strings e variaveis de botao no tema" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Documentação — READMEs, CHANGELOG e ROADMAP

**Files:**
- Modify: `README.md`, `README.en.md`, `README.es.md`, `README.zh-cn.md`, `README.zh-tw.md` (linha do `settings.json` na tabela de privacidade)
- Modify: `CHANGELOG.md` (seção `## [Unreleased]`)
- Modify: `docs/ROADMAP.md` (R2, passo 1)
- Test: `tests/site/*` (paridade; já existem)

- [ ] **Step 1: Tabela de privacidade nos cinco READMEs**

Substituir a linha que começa com `` | `~/.claude/settings.json` | `` em cada arquivo:

`README.md`:
```
| `~/.claude/settings.json` | Lido + escrito (só com sua permissão) | Adiciona dois comandos de hook em `hooks.SessionStart` e `hooks.UserPromptSubmit` e, quando você clica em **Ativar ferramentas de tasks**, a chave `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`. Outros hooks e configurações são preservados; um arquivo inválido nunca é sobrescrito. |
```

`README.en.md`:
```
| `~/.claude/settings.json` | Read + written (only with your permission) | Adds two hook commands under `hooks.SessionStart` and `hooks.UserPromptSubmit` and, when you click **Enable task tools**, the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key. Other hooks and settings are preserved; an invalid file is never overwritten. |
```

`README.es.md`:
```
| `~/.claude/settings.json` | Lectura + escritura (solo con tu permiso) | Agrega dos comandos de hook en `hooks.SessionStart` y `hooks.UserPromptSubmit` y, cuando haces clic en **Activar herramientas de tareas**, la clave `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`. Los demás hooks y ajustes se conservan; un archivo inválido nunca se sobrescribe. |
```

`README.zh-cn.md`:
```
| `~/.claude/settings.json` | 读取 + 写入（仅在你授权时） | 在 `hooks.SessionStart` 和 `hooks.UserPromptSubmit` 下添加两个钩子命令；当你点击**开启任务工具**时，还会写入 `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`。其他钩子和设置会被保留；无效的文件绝不会被覆盖。 |
```

`README.zh-tw.md`:
```
| `~/.claude/settings.json` | 讀取 + 寫入（僅在你授權時） | 在 `hooks.SessionStart` 和 `hooks.UserPromptSubmit` 下新增兩個掛鉤命令；當你點擊**開啟任務工具**時，還會寫入 `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`。其他掛鉤和設定會被保留；無效的檔案絕不會被覆寫。 |
```

- [ ] **Step 2: CHANGELOG**

Em `CHANGELOG.md`, logo abaixo de `## [Unreleased]` (que hoje está vazio, seguido de `## [0.18.0] - 2026-09-05`), inserir:

```markdown
### Added
- **Smart empty state when Claude Code has the task tools off.** On Claude Code 2.1.233+ with a newer model (Opus 4.8, Opus 5, Sonnet 5, Fable, Mythos…) and no `CLAUDE_CODE_ENABLE_TODO_TOOLS` flag in any settings source, the panel now says so instead of "waiting for tasks" and offers an **Enable task tools** button that writes `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` to `~/.claude/settings.json` after a confirmation dialog — in VS Code and JetBrains. Also available as the command `Claude Todos: Enable Claude Code task tools`. Roadmap R2, step 1; spec `docs/specs/2026-09-05-task-tools-off-empty-state-design.md`.

### Changed
- **An invalid `settings.json` is never overwritten.** Both the hook installer and the new task-tools action now fail with a clear error when `~/.claude/settings.json` exists but is not valid JSON; previously the hook installer replaced such a file with just the hooks.

```

- [ ] **Step 3: ROADMAP**

Em `docs/ROADMAP.md`, no R2, substituir o início do passo 1 do plano

```
  1. **Estado vazio inteligente:** distinguir "sessão sem tasks" de "ferramentas de task
```

por

```
  1. **Estado vazio inteligente:** ✅ implementado em 2026-09-05 (release pendente) — spec
     [docs/specs/2026-09-05-task-tools-off-empty-state-design.md](specs/2026-09-05-task-tools-off-empty-state-design.md),
     plano [docs/plans/2026-09-05-task-tools-off-empty-state.md](plans/2026-09-05-task-tools-off-empty-state.md).
     Distinguir "sessão sem tasks" de "ferramentas de task
```

- [ ] **Step 4: Verificar a paridade dos READMEs**

Run: `npx vitest run tests/site`
Expected: PASS (11 seções em cada README; seção 5 continua com `~/.claude` e tabela).

- [ ] **Step 5: Commit**

```bash
git add README.md README.en.md README.es.md README.zh-cn.md README.zh-tw.md CHANGELOG.md docs/ROADMAP.md
git commit -m "docs: privacidade nos 5 READMEs, CHANGELOG e ROADMAP para o estado vazio inteligente" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Verificação final e roteiro manual

**Files:** nenhum novo; só execução.

- [ ] **Step 1: Suíte completa, tipos, Svelte e build**

Run: `npm run typecheck && npm run check:svelte && npm test && npm run build`
Expected: tudo verde (o `npm test` pode imprimir avisos `EPERM … kill` do vitest no Windows ao encerrar workers — não são falhas).

- [ ] **Step 2: Plugin JetBrains**

Run: `cmd //c C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat test buildPlugin --console=plain`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Roteiro manual no VS Code (F5, host de desenvolvimento)**

1. No `~/.claude/settings.json` da máquina, remover temporariamente a chave `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` (guardar o valor).
2. Abrir uma pasta com uma sessão recente do Claude Code gravada por 2.1.233+ e modelo novo, sem tasks (ou iniciar `claude` e mandar uma mensagem simples).
3. O painel deve mostrar **"Ferramentas de tasks desligadas neste Claude Code"** com o botão.
4. Clicar → diálogo modal com o caminho do arquivo → **Ativar** → toast "Ferramentas de tasks ativadas…" → o painel volta a "Sessão ativa — aguardando tasks".
5. Conferir no `settings.json` que só a chave `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` foi adicionada e o resto está intacto.
6. Rodar o comando **Claude Todos: Enable Claude Code task tools** de novo → toast "já estão ativadas".
7. Abrir uma sessão nova do Claude Code, pedir uma tarefa com três passos → a lista aparece no painel.
8. Trocar o `settings.json` por um conteúdo inválido (`{ broken`) e clicar no botão → toast de erro com o caminho; o arquivo continua `{ broken`. Restaurar o arquivo.

- [ ] **Step 4: Roteiro manual no JetBrains (`gradlew runIde`)**

Repetir os passos 3, 4 e 8 do roteiro acima no IDE; conferir que o botão tem a cor de destaque do LaF (variáveis de botão do shim).

- [ ] **Step 5: Registrar o resultado**

Anotar no `docs/ROADMAP.md` (R2, passo 1) a data do smoke e qualquer desvio encontrado; se houver correção, commit próprio com prefixo `fix`.
