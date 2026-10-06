# Ponte de dados via mod do Claude Code — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um mod opcional do Claude Code, instalado pela extensão com confirmação, grava por sessão a janela de contexto exata, os limites de uso de 5h e 7 dias e o fim de cada sub-agent e de cada turno do main; o painel usa esses dados quando existem e continua no parser quando não existem.

**Architecture:** O contrato do arquivo e a lógica pura ficam em `src/bridgeMod/state.ts`, compartilhado pelo mod e pelo core. O mod (`mod/claude-todos-bridge/`) viaja embutido no bundle do core por um módulo gerado (`src/generated/bridgeModFiles.ts`); o `BridgeModInstaller` o grava em `~/.claude/.vscode-todos-bridge/mod/` e o lista em `env.CLAUDE_CODE_PLUGIN_DIRS`. O `BridgeLiveReader` lê `live/<sessionId>.json`; o `SnapshotService` aplica janela, limites, ciclo de vida e o estado do rodapé; o `SessionNotifier` usa o fim do turno. Os hosts (VS Code e JetBrains) só ganham ativar e desativar com confirmação; a webview ganha o bloco de limites e o rodapé.

**Tech Stack:** TypeScript, vitest (Node), Svelte 5 (webview), Kotlin + JUnit (plugin JetBrains), API de Mods do Claude Code (early access, validada na 2.1.286 e na 2.1.289).

**Spec:** `docs/specs/2026-10-06-ponte-de-dados-mod-design.md`

## Global Constraints

- **Arquivo da ponte:** `<claudeDir>/.vscode-todos-bridge/live/<sessionId>.json`, `schema: 1`, com os campos da decisão 3 da spec: `schema`, `sessionId`, `engineVersion?`, `writtenAt`, `turn? { state: "idle" | "ended", at, reason? }`, `usage? { at, context? { tokens?, window, percent? }, rateLimits: [{ kind, percentUsed, resetsAt }] }`, `agents: { [agentId]: { state: "running" | "stopped", at, type?, description?, background?, model?, parentId?, reason? } }`. O mod nunca grava custo.
- **Mod instalado** em `<claudeDir>/.vscode-todos-bridge/mod/claude-todos-bridge/`, com `<claudeDir>/.vscode-todos-bridge/mod/install.json` (`{ "installedAt": <epoch ms> }`), e listado em `env.CLAUDE_CODE_PLUGIN_DIRS` do `<claudeDir>/settings.json`, separado por `path.delimiter`.
- **`settings.json` inválido nunca é sobrescrito:** `SettingsParseError` e nada gravado (nem os arquivos do mod).
- **Ciclo de vida dos agentes da ponte só com `engineVersion` 2.1.289 ou mais nova** (CHANGELOG 2.1.289, *"one agent id across plugin hook events"*). Janela e limites valem de qualquer versão.
- **Teto de 500 agentes por arquivo**, mantendo os de evento mais recente. **Limpeza de `live/` aos 30 dias**, a mesma janela do `pruneBridge`.
- **`src/bridgeMod/state.ts` não importa nada e não usa API de Node:** ele também roda dentro do mod.
- **Regras do mod, medidas no spike e na sonda de 2026-10-05:** o `$` só é passado a funções declaradas no topo do arquivo; todo trabalho é aguardado dentro do hook; o engine aceita `import ... from './state.ts'`; `$.plugin.root` é um caminho nativo (no Windows, com `\`); `$.fs.read` de arquivo ausente rejeita (`ENOENT`); o `$.fs` não tem rename nem delete.
- **`src/generated/` é gerado** por `npm run build:mod` e fica fora do git; `build`, `pretest` e `pretypecheck` o regeneram. Depois de mudar `mod/` ou `src/bridgeMod/state.ts`, rode `npm run build:mod` antes de `npx vitest run <arquivo>`.
- **Estados do rodapé:** `off` (mod não instalado), `active` (a sessão exibida tem arquivo), `silent` (instalado, sessão viva cujo processo começou depois de `installedAt` há mais de 60 s, sem arquivo), `next-session` (instalado, demais casos sem arquivo).
- **i18n:** toda chave nova entra nos cinco idiomas de `src/i18n/messages.ts` (`en`, `pt-br`, `es`, `zh-cn`, `zh-tw`); os textos de diálogo nativo também em `NotifyMessages.kt`, copiados verbatim; os títulos de comando nos cinco `package.nls*.json` (em `zh-cn` e `zh-tw` em inglês, como os atuais). Os testes de paridade (`tests/i18n/messages.test.ts`, `tests/i18n/packageNls.test.ts`, `NotifyMessagesTest.kt`) quebram se faltar um idioma.
- **Comandos de verificação:** `npm run typecheck`, `npm run check:svelte`, `npm test`, `npm run build`. Um arquivo: `npx vitest run <caminho>`. JetBrains, a partir de `jetbrains/` e com `npm run build` feito antes: `cmd //c "<raiz do repo, caminho absoluto>\jetbrains\gradlew.bat" test --console=plain` (o caminho relativo falha no git-bash desta máquina; num worktree, use o caminho absoluto do worktree).
- **Lançar o `claude` pelo shell** para validar o mod exige limpar as variáveis da sessão atual: `env $(env | awk -F= '/^(CLAUDE|ELECTRON_RUN_AS_NODE)/ {printf "-u %s ", $1}') claude ...`.
- **Commits:** um por tarefa, título em pt-BR **sem acentos** com prefixo convencional (`feat`, `fix`, `test`, `docs`, `build`), como o histórico do repo, terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Windows: a nossa pasta já está em `CLAUDE_CODE_PLUGIN_DIRS` com outra caixa ou com `/`.** Instalar não pode duplicar a entrada e desinstalar precisa removê-la — teste na Task 3 (`matches our entry regardless of case and separators on Windows`).
2. **Arquivo da ponte pela metade** (o `$.fs.write` não é atômico): o painel mantém a última leitura boa, sem erro e sem piscar para a estimativa — teste na Task 4 (`keeps the last good reading while the file is half-written`).
3. **Sessão retomada num processo novo:** o arquivo ainda tem um `turn` gravado pelo processo anterior, que não pode disparar o aviso imediato — teste na Task 6 (`ignores a turn end written before the live process started`). Os agentes `running` do processo anterior já caem pela regra `aliveSince` do R6.
4. **Arquivo gravado por um Claude Code anterior à 2.1.289** (o `claude` do PATH desta máquina é a 2.1.286): os agentes são ignorados, mas a janela vale — teste na Task 5 (`feeds the agents of a 2.1.289 file to the parser as extra lifecycle`).
5. **`/clear` no meio da sessão:** o mod troca de id sem `session.start`, começa um estado novo e marca o arquivo antigo como `ended` — estado testado na Task 1 (`starts empty for … another session`); o caminho real é conferido à mão na Task 10, passo 8.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/bridgeMod/state.ts` (novo) | Contrato do arquivo da ponte e lógica pura: eventos, restauração, validação, pasta de saída. Roda no mod e no core. |
| `mod/claude-todos-bridge/` (novo) | Manifesto, `hooks.json` e `register.ts` do mod (só a ligação dos hooks). |
| `scripts/buildBridgeMod.mjs` (novo) | Gera `src/generated/bridgeModFiles.ts`; com `--out`, monta o mod numa pasta. |
| `src/services/bridgeModInstaller.ts` (novo) | Instala, atualiza, desinstala e informa o estado do mod. |
| `src/services/bridgeLive.ts` (novo) | Lê `live/`, escolhe a leitura de limites mais recente, limpa arquivos velhos, converte agentes em ciclo de vida. |
| `src/types.ts` | `ContextUsage.source`, `RateLimit`, `RateLimitsReading`, `SessionUsage.rateLimits`, `BridgeStatus`, `SessionSnapshot.bridge`, mensagens da webview. |
| `src/services/todosParser.ts` | `listSessionDetail` aceita `extraLifecycle`. |
| `src/services/snapshotService.ts` | Janela exata, limites, ciclo de vida da ponte e estado do rodapé. |
| `src/services/sessionNotifier.ts` | `turnEndedAt` dispensa os 45 s de silêncio quando o turno acabou de verdade. |
| `src/services/todosWatcher.ts` | Observa `live/`. |
| `src/core/sessionCore.ts` | Liga leitor e instalador; `turnEndedAt`; limpeza de `live/`; métodos de instalar, desinstalar e atualizar. |
| `src/core/dispatcher.ts` | Comandos `installBridgeMod` e `uninstallBridgeMod`; atualização no `init`. |
| `src/extension.ts` | Confirmação, comandos da paleta e atualização na ativação. |
| `src/i18n/messages.ts`, `package.json`, `package.nls*.json` | Textos e comandos. |
| `jetbrains/.../MessageRouter.kt`, `NotifyMessages.kt`, `ClaudeTodosToolWindowFactory.kt` | Ativar e desativar com diálogo nativo e rótulo próprio. |
| `src/webview/format.ts`, `lib/UsageTable.svelte`, `App.svelte`, `stores.svelte.ts` | Bloco de limites, tooltip da janela exata e rodapé. |
| `README*.md`, `CHANGELOG.md`, `docs/ROADMAP.md` | Privacidade, limitações e registro da entrega. |

---

### Task 1: Contrato e lógica pura da ponte (`src/bridgeMod/state.ts`)

**Files:**
- Create: `src/bridgeMod/state.ts`
- Test: `tests/bridgeMod/state.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usados pelas Tasks 2, 4 e 5):
  - `BRIDGE_SCHEMA = 1`, `MAX_AGENTS = 500`, `BRIDGE_DIR_NAME = '.vscode-todos-bridge'`, `LIVE_DIR_NAME = 'live'`, `SAFE_ID`.
  - Tipos `BridgeAgentState`, `BridgeAgent`, `BridgeTurn`, `BridgeRateLimit`, `BridgeUsage`, `BridgeFile`, `BridgeEvent`.
  - `emptyFile(sessionId: string, now: number): BridgeFile`
  - `normalizeUsage(raw: unknown, at: number): BridgeUsage | undefined`
  - `parseBridgeFile(raw: unknown): BridgeFile | null`
  - `restoreFile(text: string | undefined, sessionId: string, now: number): BridgeFile`
  - `applyEvent(file: BridgeFile, ev: BridgeEvent): BridgeFile`
  - `toText(file: BridgeFile, now: number): string`
  - `liveDirFor(pluginRoot: string, env: { claudeConfigDir?: string; userProfile?: string; home?: string }): string | null`
  - `sessionFilePath(liveDir: string, sessionId: string): string | null`

- [ ] **Step 1: Escrever os testes**

Criar `tests/bridgeMod/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  applyEvent, emptyFile, liveDirFor, normalizeUsage, parseBridgeFile, restoreFile,
  sessionFilePath, toText, MAX_AGENTS,
} from '../../src/bridgeMod/state';

const SID = '5b69f6bc-5943-44c9-9385-753cc2b5fd2c';
const T = 1_791_215_940_722;

// O retorno real de $.session.usage() no spike de 2026-10-05 (Claude Code 2.1.289).
const REAL_USAGE = {
  startedAt: 1_791_077_671_828,
  context: { tokens: 137_849, window: 1_000_000, percent: 14 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-05T20:40:00.000Z' },
    { kind: 'seven_day', percentUsed: 2, resetsAt: '2026-10-12T12:00:00.000Z' },
  ],
  cost: { usd: 79.56 },
};

describe('applyEvent', () => {
  it('a spawn registers the agent as running with what the hook knows', () => {
    const f = applyEvent(emptyFile(SID, T), {
      kind: 'spawn', at: T + 1, agentId: 'a8a7e239c5bda24cb', type: 'Explore',
      description: 'spike', background: true, model: 'claude-haiku-4-5-20251001',
    });
    expect(f.agents['a8a7e239c5bda24cb']).toEqual({
      state: 'running', at: T + 1, type: 'Explore', description: 'spike', background: true,
      model: 'claude-haiku-4-5-20251001',
    });
  });

  it("an agent's turn end stops it and keeps what the spawn recorded", () => {
    let f = applyEvent(emptyFile(SID, T), { kind: 'spawn', at: T + 1, agentId: 'ag1', type: 'Explore' });
    f = applyEvent(f, { kind: 'agentEnd', at: T + 9, agentId: 'ag1', reason: 'answer' });
    expect(f.agents.ag1).toEqual({ state: 'stopped', at: T + 9, type: 'Explore', reason: 'answer' });
  });

  it('an agent born before the mod loaded gets its entry at the end', () => {
    const f = applyEvent(emptyFile(SID, T), { kind: 'agentEnd', at: T + 9, agentId: 'old1', reason: 'answer' });
    expect(f.agents.old1).toEqual({ state: 'stopped', at: T + 9, reason: 'answer' });
  });

  it('a new spawn of a stopped agent clears the old end reason', () => {
    let f = applyEvent(emptyFile(SID, T), { kind: 'agentEnd', at: T + 1, agentId: 'ag1', reason: 'aborted' });
    f = applyEvent(f, { kind: 'spawn', at: T + 2, agentId: 'ag1' });
    expect(f.agents.ag1).toEqual({ state: 'running', at: T + 2 });
  });

  it('the main turn end marks the turn idle; the session end marks it ended', () => {
    let f = applyEvent(emptyFile(SID, T), { kind: 'mainTurnEnd', at: T + 5, reason: 'answer' });
    expect(f.turn).toEqual({ state: 'idle', at: T + 5, reason: 'answer' });
    f = applyEvent(f, { kind: 'sessionEnd', at: T + 6, reason: 'clear' });
    expect(f.turn).toEqual({ state: 'ended', at: T + 6, reason: 'clear' });
  });

  it('a usage reading keeps context and rate limits and drops the cost', () => {
    const f = applyEvent(emptyFile(SID, T), { kind: 'usage', at: T + 3, usage: REAL_USAGE });
    expect(f.usage).toEqual({
      at: T + 3,
      context: { tokens: 137_849, window: 1_000_000, percent: 14 },
      rateLimits: REAL_USAGE.rateLimits,
    });
    expect(JSON.stringify(f)).not.toContain('usd');
  });

  it('a usage call that returned garbage leaves the previous reading alone', () => {
    const f1 = applyEvent(emptyFile(SID, T), { kind: 'usage', at: T + 3, usage: REAL_USAGE });
    const f2 = applyEvent(f1, { kind: 'usage', at: T + 4, usage: 'nope' });
    expect(f2.usage).toEqual(f1.usage);
  });

  it('records the engine version', () => {
    expect(applyEvent(emptyFile(SID, T), { kind: 'engine', version: '2.1.289' }).engineVersion).toBe('2.1.289');
  });

  it('does not mutate the previous state', () => {
    const before = emptyFile(SID, T);
    applyEvent(before, { kind: 'spawn', at: T, agentId: 'ag1' });
    expect(before.agents).toEqual({});
  });

  it(`keeps at most ${MAX_AGENTS} agents, the ones with the most recent event`, () => {
    let f = emptyFile(SID, T);
    for (let i = 0; i < MAX_AGENTS + 3; i++) f = applyEvent(f, { kind: 'spawn', at: T + i, agentId: `ag${i}` });
    expect(Object.keys(f.agents)).toHaveLength(MAX_AGENTS);
    expect(f.agents.ag0).toBeUndefined();
    expect(f.agents.ag2).toBeUndefined();
    expect(f.agents.ag3).toBeDefined();
    expect(f.agents[`ag${MAX_AGENTS + 2}`]).toBeDefined();
  });
});

describe('normalizeUsage', () => {
  it('drops malformed rate limits and a context without a window', () => {
    expect(normalizeUsage({
      context: { tokens: 10 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: '2', resetsAt: 'x' },
        { kind: 'seven_day', percentUsed: 5, resetsAt: '2026-10-12T12:00:00.000Z' },
      ],
    }, T)).toEqual({ at: T, rateLimits: [{ kind: 'seven_day', percentUsed: 5, resetsAt: '2026-10-12T12:00:00.000Z' }] });
  });

  it('returns undefined for a non-object', () => {
    expect(normalizeUsage(null, T)).toBeUndefined();
  });
});

describe('restoreFile', () => {
  it('restores the state written for the same session', () => {
    const written = applyEvent(emptyFile(SID, T), { kind: 'spawn', at: T + 1, agentId: 'ag1' });
    expect(restoreFile(toText(written, T + 2), SID, T + 3)).toEqual({ ...written, writtenAt: T + 2 });
  });

  it('starts empty for a missing file, a half-written file, another schema or another session', () => {
    const empty = emptyFile(SID, T + 3);
    expect(restoreFile(undefined, SID, T + 3)).toEqual(empty);
    expect(restoreFile('{"schema":1,"sessi', SID, T + 3)).toEqual(empty);
    expect(restoreFile(JSON.stringify({ ...emptyFile(SID, T), schema: 2 }), SID, T + 3)).toEqual(empty);
    expect(restoreFile(toText(emptyFile('other-session', T), T), SID, T + 3)).toEqual(empty);
  });
});

describe('parseBridgeFile', () => {
  it('drops invalid agents and keeps the valid ones', () => {
    const parsed = parseBridgeFile({
      schema: 1, sessionId: SID, writtenAt: T,
      agents: { ok: { state: 'stopped', at: T }, bad: { state: 'zombie', at: T }, '../x': { state: 'running', at: T } },
    });
    expect(parsed?.agents).toEqual({ ok: { state: 'stopped', at: T } });
  });

  it('rejects an unsafe session id', () => {
    expect(parseBridgeFile({ schema: 1, sessionId: '../etc', writtenAt: T, agents: {} })).toBeNull();
  });
});

describe('liveDirFor', () => {
  it('writes next to the mod folder the extension installed (Windows)', () => {
    expect(liveDirFor('C:\\Users\\carlo\\.claude\\.vscode-todos-bridge\\mod\\claude-todos-bridge', {}))
      .toBe('C:\\Users\\carlo\\.claude\\.vscode-todos-bridge\\live');
  });

  it('writes next to the mod folder the extension installed (POSIX, trailing slash)', () => {
    expect(liveDirFor('/home/u/.claude/.vscode-todos-bridge/mod/claude-todos-bridge/', {}))
      .toBe('/home/u/.claude/.vscode-todos-bridge/live');
  });

  it('falls back to CLAUDE_CONFIG_DIR, then USERPROFILE, then HOME', () => {
    const root = '/repo/dist/mod/claude-todos-bridge';
    expect(liveDirFor(root, { claudeConfigDir: '/cfg', userProfile: '/up', home: '/h' }))
      .toBe('/cfg/.vscode-todos-bridge/live');
    expect(liveDirFor(root, { userProfile: '/up', home: '/h' })).toBe('/up/.claude/.vscode-todos-bridge/live');
    expect(liveDirFor(root, { home: '/h/' })).toBe('/h/.claude/.vscode-todos-bridge/live');
  });

  it('returns null when nothing is known', () => {
    expect(liveDirFor('/repo/dist/mod/claude-todos-bridge', {})).toBeNull();
    expect(liveDirFor('/repo/dist/mod/claude-todos-bridge', { home: '' })).toBeNull();
  });
});

describe('sessionFilePath', () => {
  it('builds the per-session path with the separator of the folder', () => {
    expect(sessionFilePath('C:\\c\\.vscode-todos-bridge\\live', SID)).toBe(`C:\\c\\.vscode-todos-bridge\\live\\${SID}.json`);
    expect(sessionFilePath('/c/.vscode-todos-bridge/live', SID)).toBe(`/c/.vscode-todos-bridge/live/${SID}.json`);
  });

  it('refuses an unsafe session id', () => {
    expect(sessionFilePath('/c/live', '../../evil')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/bridgeMod/state.test.ts`
Expected: FAIL na coleta — o módulo `../../src/bridgeMod/state` não existe ("Cannot find module" ou "Failed to load url").

- [ ] **Step 3: Implementar**

Criar `src/bridgeMod/state.ts`:

```ts
// Ponte de dados (ROADMAP item 25): o contrato do arquivo que o mod
// claude-todos-bridge grava por sessão e a lógica pura que o mantém. Roda em
// DOIS lugares: dentro do mod (ambiente do Claude Code, sem Node e sem DOM) e no
// core da extensão, que lê o arquivo. Por isso este módulo não importa nada e
// não usa API de Node. Spec: docs/specs/2026-10-06-ponte-de-dados-mod-design.md.

export const BRIDGE_SCHEMA = 1;
export const MAX_AGENTS = 500;
export const BRIDGE_DIR_NAME = '.vscode-todos-bridge';
export const LIVE_DIR_NAME = 'live';
export const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export type BridgeAgentState = 'running' | 'stopped';

export interface BridgeAgent {
  state: BridgeAgentState;
  at: number;            // epoch ms do último evento do agente
  type?: string;
  description?: string;
  background?: boolean;
  model?: string;
  parentId?: string;
  reason?: string;       // motivo do fim (turn.complete), só quando parado
}

export interface BridgeTurn {
  state: 'idle' | 'ended'; // idle: o turno do main terminou; ended: a sessão terminou
  at: number;
  reason?: string;
}

export interface BridgeRateLimit {
  kind: string;          // five_hour | seven_day | spend_limit | outro
  percentUsed: number;
  resetsAt: string;      // ISO 8601
}

export interface BridgeUsage {
  at: number;            // hora da leitura de $.session.usage()
  context?: { tokens?: number; window: number; percent?: number };
  rateLimits: BridgeRateLimit[];
}

export interface BridgeFile {
  schema: 1;
  sessionId: string;
  engineVersion?: string;
  writtenAt: number;
  turn?: BridgeTurn;
  usage?: BridgeUsage;
  agents: Record<string, BridgeAgent>;
}

export type BridgeEvent =
  | { kind: 'engine'; version: string }
  | { kind: 'usage'; at: number; usage: unknown }
  | {
      kind: 'spawn'; at: number; agentId: string; type?: string; description?: string;
      background?: boolean; model?: string; parentId?: string;
    }
  | { kind: 'agentEnd'; at: number; agentId: string; reason?: string }
  | { kind: 'mainTurnEnd'; at: number; reason?: string }
  | { kind: 'sessionEnd'; at: number; reason?: string };

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function lastSep(p: string): number {
  return Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
}

function trimSep(p: string): string {
  return p.replace(/[\\/]+$/, '');
}

export function emptyFile(sessionId: string, now: number): BridgeFile {
  return { schema: BRIDGE_SCHEMA, sessionId, writtenAt: now, agents: {} };
}

// Só os campos do contrato, nunca o custo. undefined quando nada se aproveita.
export function normalizeUsage(raw: unknown, at: number): BridgeUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const out: BridgeUsage = { at, rateLimits: [] };
  const ctx = raw.context;
  if (isRecord(ctx) && isNum(ctx.window) && ctx.window > 0) {
    out.context = {
      window: ctx.window,
      ...(isNum(ctx.tokens) ? { tokens: ctx.tokens } : {}),
      ...(isNum(ctx.percent) ? { percent: ctx.percent } : {}),
    };
  }
  if (Array.isArray(raw.rateLimits)) {
    for (const r of raw.rateLimits) {
      if (isRecord(r) && typeof r.kind === 'string' && isNum(r.percentUsed) && typeof r.resetsAt === 'string') {
        out.rateLimits.push({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt });
      }
    }
  }
  return out;
}

function parseAgent(raw: unknown): BridgeAgent | null {
  if (!isRecord(raw)) return null;
  const state = raw.state;
  const at = raw.at;
  if ((state !== 'running' && state !== 'stopped') || !isNum(at)) return null;
  const agent: BridgeAgent = { state, at };
  if (typeof raw.type === 'string') agent.type = raw.type;
  if (typeof raw.description === 'string') agent.description = raw.description;
  if (typeof raw.background === 'boolean') agent.background = raw.background;
  if (typeof raw.model === 'string') agent.model = raw.model;
  if (typeof raw.parentId === 'string') agent.parentId = raw.parentId;
  if (typeof raw.reason === 'string') agent.reason = raw.reason;
  return agent;
}

// Valida um valor qualquer como BridgeFile do schema atual; null quando não
// serve. Usado pelo mod (restauração) e pelo leitor da extensão.
export function parseBridgeFile(raw: unknown): BridgeFile | null {
  if (!isRecord(raw) || raw.schema !== BRIDGE_SCHEMA) return null;
  const sessionId = raw.sessionId;
  const writtenAt = raw.writtenAt;
  if (typeof sessionId !== 'string' || !SAFE_ID.test(sessionId) || !isNum(writtenAt)) return null;
  const file = emptyFile(sessionId, writtenAt);
  if (typeof raw.engineVersion === 'string') file.engineVersion = raw.engineVersion;
  const turn = raw.turn;
  if (isRecord(turn)) {
    const state = turn.state;
    const at = turn.at;
    if ((state === 'idle' || state === 'ended') && isNum(at)) {
      file.turn = { state, at, ...(typeof turn.reason === 'string' ? { reason: turn.reason } : {}) };
    }
  }
  const usage = raw.usage;
  if (isRecord(usage) && isNum(usage.at)) {
    const normalized = normalizeUsage(usage, usage.at);
    if (normalized) file.usage = normalized;
  }
  if (isRecord(raw.agents)) {
    for (const [id, value] of Object.entries(raw.agents)) {
      const agent = parseAgent(value);
      if (agent && SAFE_ID.test(id)) file.agents[id] = agent;
    }
  }
  return file;
}

// Estado inicial do mod para `sessionId`: o do arquivo, quando o texto é um
// BridgeFile válido da mesma sessão (recarga do módulo, sessão retomada); senão
// um estado vazio. Texto ausente, pela metade ou de outra sessão nunca lança.
export function restoreFile(text: string | undefined, sessionId: string, now: number): BridgeFile {
  if (text !== undefined) {
    try {
      const parsed = parseBridgeFile(JSON.parse(text));
      if (parsed && parsed.sessionId === sessionId) return parsed;
    } catch { /* arquivo pela metade: começa do zero */ }
  }
  return emptyFile(sessionId, now);
}

function capAgents(file: BridgeFile): BridgeFile {
  const ids = Object.keys(file.agents);
  if (ids.length <= MAX_AGENTS) return file;
  const keep = ids.sort((a, b) => file.agents[b].at - file.agents[a].at).slice(0, MAX_AGENTS);
  const agents: Record<string, BridgeAgent> = {};
  for (const id of keep) agents[id] = file.agents[id];
  return { ...file, agents };
}

// Aplica um evento e devolve um estado NOVO; o anterior não muda.
export function applyEvent(file: BridgeFile, ev: BridgeEvent): BridgeFile {
  switch (ev.kind) {
    case 'engine':
      return { ...file, engineVersion: ev.version };
    case 'usage': {
      const usage = normalizeUsage(ev.usage, ev.at);
      return usage ? { ...file, usage } : file;
    }
    case 'spawn': {
      const agent: BridgeAgent = { ...file.agents[ev.agentId], state: 'running', at: ev.at };
      delete agent.reason;
      if (ev.type !== undefined) agent.type = ev.type;
      if (ev.description !== undefined) agent.description = ev.description;
      if (ev.background !== undefined) agent.background = ev.background;
      if (ev.model !== undefined) agent.model = ev.model;
      if (ev.parentId !== undefined) agent.parentId = ev.parentId;
      return capAgents({ ...file, agents: { ...file.agents, [ev.agentId]: agent } });
    }
    case 'agentEnd': {
      const agent: BridgeAgent = { ...file.agents[ev.agentId], state: 'stopped', at: ev.at };
      if (ev.reason !== undefined) agent.reason = ev.reason;
      return capAgents({ ...file, agents: { ...file.agents, [ev.agentId]: agent } });
    }
    case 'mainTurnEnd':
      return { ...file, turn: { state: 'idle', at: ev.at, ...(ev.reason !== undefined ? { reason: ev.reason } : {}) } };
    case 'sessionEnd':
      return { ...file, turn: { state: 'ended', at: ev.at, ...(ev.reason !== undefined ? { reason: ev.reason } : {}) } };
  }
}

export function toText(file: BridgeFile, now: number): string {
  return JSON.stringify({ ...file, writtenAt: now });
}

// Pasta onde o mod grava. Instalado pela extensão em
// <claudeDir>/.vscode-todos-bridge/mod/<plugin>, grava em
// <claudeDir>/.vscode-todos-bridge/live — o mesmo claudeDir da extensão.
// Carregado de outro lugar (desenvolvimento), usa CLAUDE_CONFIG_DIR ou
// USERPROFILE/HOME + .claude. null quando nada serve.
export function liveDirFor(
  pluginRoot: string,
  env: { claudeConfigDir?: string; userProfile?: string; home?: string },
): string | null {
  const sep = pluginRoot.includes('\\') ? '\\' : '/';
  const root = trimSep(pluginRoot);
  const modDir = root.slice(0, Math.max(0, lastSep(root)));
  const bridgeDir = modDir.slice(0, Math.max(0, lastSep(modDir)));
  if (bridgeDir !== '' && bridgeDir.slice(lastSep(bridgeDir) + 1) === BRIDGE_DIR_NAME) {
    return `${bridgeDir}${sep}${LIVE_DIR_NAME}`;
  }
  const home = env.userProfile || env.home;
  const claudeDir = env.claudeConfigDir || (home ? `${trimSep(home)}${sep}.claude` : '');
  return claudeDir ? `${trimSep(claudeDir)}${sep}${BRIDGE_DIR_NAME}${sep}${LIVE_DIR_NAME}` : null;
}

export function sessionFilePath(liveDir: string, sessionId: string): string | null {
  if (!SAFE_ID.test(sessionId)) return null;
  const sep = liveDir.includes('\\') ? '\\' : '/';
  return `${liveDir}${sep}${sessionId}.json`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/bridgeMod/state.test.ts && npm run typecheck`
Expected: PASS (todos os testes) e `tsc` sem erros. (O `pretypecheck` ainda não existe nesta tarefa; o `typecheck` roda direto.)

- [ ] **Step 5: Commit**

```bash
git add src/bridgeMod/state.ts tests/bridgeMod/state.test.ts
git commit -m "feat(bridge): contrato e logica pura do arquivo da ponte (item 25)

Modulo sem imports, compartilhado pelo mod do Claude Code e pelo core:
eventos, restauracao, validacao e a pasta de saida derivada de onde a
extensao instala o mod.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: O mod `claude-todos-bridge` embutido no bundle do core

**Files:**
- Create: `mod/claude-todos-bridge/.claude-plugin/plugin.json`
- Create: `mod/claude-todos-bridge/hooks/hooks.json`
- Create: `mod/claude-todos-bridge/hooks/register.ts`
- Create: `scripts/buildBridgeMod.mjs`
- Modify: `package.json` (`scripts`, linhas 225-239)
- Modify: `.gitignore`, `.vscodeignore`
- Test: `tests/bridgeMod/generated.test.ts`

**Interfaces:**
- Consumes: `src/bridgeMod/state.ts` (Task 1), copiado para dentro do mod como `hooks/state.ts`.
- Produces: `src/generated/bridgeModFiles.ts` com `BRIDGE_MOD_VERSION: string` e `BRIDGE_MOD_FILES: Readonly<Record<string, string>>`, de chaves `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts`, `hooks/state.ts` (usados pela Task 3). Scripts `build:mod` e `mod:dev`.

- [ ] **Step 1: Escrever o teste**

Criar `tests/bridgeMod/generated.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRIDGE_MOD_FILES, BRIDGE_MOD_VERSION } from '../../src/generated/bridgeModFiles';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('bridge mod embedded in the core bundle', () => {
  it('carries exactly the four files of the mod', () => {
    expect(Object.keys(BRIDGE_MOD_FILES).sort()).toEqual([
      '.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.ts', 'hooks/state.ts',
    ]);
  });

  it('ships the shared state module and the hooks verbatim', () => {
    expect(BRIDGE_MOD_FILES['hooks/state.ts']).toBe(read('src/bridgeMod/state.ts'));
    expect(BRIDGE_MOD_FILES['hooks/register.ts']).toBe(read('mod/claude-todos-bridge/hooks/register.ts'));
    expect(JSON.parse(BRIDGE_MOD_FILES['hooks/hooks.json'])).toEqual({ modules: ['./register.ts'] });
  });

  it('stamps the extension version into the manifest', () => {
    const version = JSON.parse(read('package.json')).version;
    expect(BRIDGE_MOD_VERSION).toBe(version);
    expect(JSON.parse(BRIDGE_MOD_FILES['.claude-plugin/plugin.json'])).toMatchObject({ name: 'claude-todos-bridge', version });
  });

  it('keeps the shared state module free of imports (it also runs inside the mod)', () => {
    expect(read('src/bridgeMod/state.ts')).not.toMatch(/^\s*import\s/m);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/bridgeMod/generated.test.ts`
Expected: FAIL na coleta — `../../src/generated/bridgeModFiles` não existe.

- [ ] **Step 3: Criar o mod**

`mod/claude-todos-bridge/.claude-plugin/plugin.json` (a versão real é carimbada pelo gerador):

```json
{
  "name": "claude-todos-bridge",
  "version": "0.0.0",
  "description": "Claude Todos data bridge: records each session's exact context window, usage limits and sub-agent lifecycle for the Claude Todos panel. No UI."
}
```

`mod/claude-todos-bridge/hooks/hooks.json`:

```json
{
  "modules": ["./register.ts"]
}
```

`mod/claude-todos-bridge/hooks/register.ts`:

```ts
import type { EngineInterface, Register } from 'claude-code'
import {
  applyEvent, liveDirFor, restoreFile, sessionFilePath, toText,
  type BridgeEvent, type BridgeFile,
} from './state.ts'

// Ponte de dados do Claude Todos (ROADMAP item 25; spec
// docs/specs/2026-10-06-ponte-de-dados-mod-design.md, decisão 2). Sem UI: grava,
// por sessão, o arquivo que o painel lê. Regras da API que este arquivo segue,
// medidas no spike de 2026-10-05: o `$` só é passado a funções declaradas no
// topo; todo trabalho é aguardado dentro do hook; uma chamada que falha não
// derruba as outras; as gravações saem em ordem, uma de cada vez.

let state: BridgeFile | null = null
let liveDir: string | null | undefined
let tail: Promise<void> = Promise.resolve()

async function resolveLiveDir($: EngineInterface): Promise<string | null> {
  if (liveDir !== undefined) return liveDir
  const [claudeConfigDir, userProfile, home] = await Promise.all([
    $.env.get('CLAUDE_CONFIG_DIR'),
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  liveDir = liveDirFor($.plugin.root, { claudeConfigDir, userProfile, home })
  return liveDir
}

async function readText($: EngineInterface, file: string): Promise<string | undefined> {
  try {
    return await $.fs.read(file)
  } catch {
    return undefined
  }
}

// Aplica os eventos de `build(now)` ao estado da sessão e regrava o arquivo.
// Serializado: cada chamada espera a anterior, então o arquivo termina com o
// estado mais novo. `sessionId` explícito só no session.end (o id que termina).
async function record(
  $: EngineInterface,
  build: (now: number) => BridgeEvent[],
  withUsage: boolean,
  sessionId?: string,
): Promise<void> {
  const previous = tail
  let release: () => void = () => undefined
  tail = new Promise<void>(resolve => { release = resolve })
  try {
    await previous
    const dir = await resolveLiveDir($)
    if (dir === null) return
    const [id, now] = await Promise.all([
      sessionId !== undefined ? Promise.resolve(sessionId) : $.session.id(),
      $.clock.now(),
    ])
    const file = sessionFilePath(dir, id)
    if (file === null) return
    let current = state !== null && state.sessionId === id ? state : restoreFile(await readText($, file), id, now)
    const events = build(now)
    if (current.engineVersion === undefined) {
      const version = await $.session.version().then(v => v.version, () => undefined)
      if (version !== undefined) events.push({ kind: 'engine', version })
    }
    if (withUsage) {
      const usage = await $.session.usage().catch(() => undefined)
      if (usage !== undefined) events.push({ kind: 'usage', at: now, usage })
    }
    for (const ev of events) current = applyEvent(current, ev)
    state = current
    await $.fs.write(file, toText(current, now))
  } catch (err) {
    $.ui.log(`claude-todos-bridge: ${String(err)}`, { to: 'debug' })
  } finally {
    release()
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await record($, () => [], true)
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const agentId = result.agentId
    if (agentId !== undefined) {
      await record($, now => [{
        kind: 'spawn',
        at: now,
        agentId,
        type: e.subagentType,
        description: e.description,
        background: e.background,
        model: result.model,
        ...(e.parentAgentId !== undefined ? { parentId: e.parentAgentId } : {}),
      }], false)
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const agentId = e.agentId
    const reason = e.reason
    await record($, now => (agentId !== undefined
      ? [{ kind: 'agentEnd', at: now, agentId, reason }]
      : [{ kind: 'mainTurnEnd', at: now, reason }]), true)
    return result
  })

  on('session.end', async ($, e, next) => {
    const reason = e.reason
    await record($, now => [{ kind: 'sessionEnd', at: now, reason }], false, e.sessionId)
    return next(e)
  })
}
```

- [ ] **Step 4: Criar o gerador**

`scripts/buildBridgeMod.mjs`:

```js
// Gera src/generated/bridgeModFiles.ts com o conteúdo de cada arquivo do mod
// claude-todos-bridge (spec 2026-10-06, decisão 4). O módulo gerado entra no
// bundle do core: o mod viaja dentro da extensão e do sidecar do JetBrains.
// Com --out <pasta>, também monta o mod nessa pasta (desenvolvimento:
// `claude plugin validate` e `CLAUDE_CODE_PLUGIN_DIRS`).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = join(ROOT, 'mod', 'claude-todos-bridge');
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const manifest = JSON.parse(readFileSync(join(MOD, '.claude-plugin', 'plugin.json'), 'utf8'));
manifest.version = version;

const files = {
  '.claude-plugin/plugin.json': JSON.stringify(manifest, null, 2) + '\n',
  'hooks/hooks.json': readFileSync(join(MOD, 'hooks', 'hooks.json'), 'utf8'),
  'hooks/register.ts': readFileSync(join(MOD, 'hooks', 'register.ts'), 'utf8'),
  'hooks/state.ts': readFileSync(join(ROOT, 'src', 'bridgeMod', 'state.ts'), 'utf8'),
};

const outModule = join(ROOT, 'src', 'generated', 'bridgeModFiles.ts');
mkdirSync(dirname(outModule), { recursive: true });
writeFileSync(outModule, [
  '// GERADO por scripts/buildBridgeMod.mjs. Não editar: a fonte é mod/claude-todos-bridge/ e src/bridgeMod/state.ts.',
  `export const BRIDGE_MOD_VERSION = ${JSON.stringify(version)};`,
  `export const BRIDGE_MOD_FILES: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)};`,
  '',
].join('\n'));

const outIdx = process.argv.indexOf('--out');
if (outIdx > 0 && process.argv[outIdx + 1]) {
  const dest = resolve(ROOT, process.argv[outIdx + 1]);
  for (const [rel, content] of Object.entries(files)) {
    const target = join(dest, ...rel.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  console.log(`mod montado em ${dest}`);
}
```

- [ ] **Step 5: Ligar o gerador ao build e excluir o gerado**

Em `package.json`, no bloco `scripts`, trocar a linha do `build`:

```json
    "build": "npm run build:ext && npm run build:hook && npm run build:core && npm run build:webview",
```

por:

```json
    "build:mod": "node scripts/buildBridgeMod.mjs",
    "build": "npm run build:mod && npm run build:ext && npm run build:hook && npm run build:core && npm run build:webview",
    "mod:dev": "node scripts/buildBridgeMod.mjs --out dist/mod/claude-todos-bridge",
```

e trocar:

```json
    "typecheck": "tsc --noEmit",
```

por:

```json
    "pretypecheck": "npm run build:mod",
    "typecheck": "tsc --noEmit",
```

e:

```json
    "test": "vitest run",
```

por:

```json
    "pretest": "npm run build:mod",
    "test": "vitest run",
```

Em `.gitignore`, acrescentar ao fim:

```
# Gerado por scripts/buildBridgeMod.mjs (mod da ponte embutido no core)
src/generated/
```

Em `.vscodeignore`, acrescentar ao fim (o mod já viaja dentro do bundle):

```
mod/**
```

- [ ] **Step 6: Gerar, rodar e ver passar**

Run: `npm run build:mod && npx vitest run tests/bridgeMod/generated.test.ts && npm run typecheck`
Expected: PASS (4 testes) e `tsc` sem erros. `git status --short` não lista `src/generated/`.

- [ ] **Step 7: Validar o mod no engine real (local; o CI não tem o `claude`)**

```bash
npm run build:mod -- --out dist/bridge-smoke/.vscode-todos-bridge/mod/claude-todos-bridge
CLEAN=$(env | awk -F= '/^(CLAUDE|ELECTRON_RUN_AS_NODE)/ {printf "-u %s ", $1}')
env $CLEAN claude plugin validate "$(pwd -W 2>/dev/null || pwd)/dist/bridge-smoke/.vscode-todos-bridge/mod/claude-todos-bridge"
```

Expected: `✔ Validation passed` (aviso de `author` é aceitável), listando `hooks: session.start, agent.spawn, turn.complete, session.end`, `env reads: CLAUDE_CONFIG_DIR, HOME, USERPROFILE` e as chamadas `$.clock.now`, `$.env.get`, `$.fs.read`, `$.fs.write`, `$.session.id`, `$.session.usage`, `$.session.version`, `$.ui.log` (via `record`/`resolveLiveDir`/`readText`).

Depois, uma sessão real curta com o mod carregado por `CLAUDE_CODE_PLUGIN_DIRS`. Como a pasta do mod fica dentro de `.vscode-todos-bridge/mod/`, ele grava em `dist/bridge-smoke/.vscode-todos-bridge/live/`, isolado do `~/.claude` real:

```bash
env $CLEAN CLAUDE_CODE_PLUGIN_DIRS="$(pwd -W 2>/dev/null || pwd)/dist/bridge-smoke/.vscode-todos-bridge/mod/claude-todos-bridge" \
  claude -p "Responda apenas: OK" --model haiku
node -e "const fs=require('fs');const d='dist/bridge-smoke/.vscode-todos-bridge/live';for(const f of fs.readdirSync(d)){const j=JSON.parse(fs.readFileSync(d+'/'+f,'utf8'));console.log(f,j.schema,j.engineVersion,JSON.stringify(j.turn),JSON.stringify(j.usage&&j.usage.context))}"
```

Expected: `OK` no stdout do `claude` e uma linha `<uuid>.json 1 <versão do claude do PATH> {"state":"ended",…,"reason":"other"} {"window":…}` com `window` > 0. Se o `claude` não estiver no PATH, registre `Ruling: validação no engine pulada — claude ausente — custo: register.ts só é exercitado na Task 10`.

Com o mod já carregado uma vez, o engine deixa os tipos ao lado dele; confira os tipos do `register.ts`:

Run: `npx tsc -p dist/bridge-smoke/.vscode-todos-bridge/mod/claude-todos-bridge`
Expected: exit 0. Um erro só de versão (os tipos são os do `claude` do PATH, que pode ser anterior à 2.1.289) vira `Ruling:` no ledger com a mensagem; erro de digitação no `register.ts` se corrige.

- [ ] **Step 8: Rodar a suíte e commitar**

Run: `npm test`
Expected: PASS (todos).

```bash
git add mod/claude-todos-bridge scripts/buildBridgeMod.mjs package.json .gitignore .vscodeignore tests/bridgeMod/generated.test.ts
git commit -m "feat(bridge): mod claude-todos-bridge embutido no bundle do core (item 25)

Quatro hooks sem UI (session.start, agent.spawn, turn.complete,
session.end) gravam o arquivo da ponte. O gerador embute os arquivos do
mod num modulo do core, entao o mod viaja na extensao e no sidecar do
JetBrains; build, pretest e pretypecheck o regeneram.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Instalador do mod (`BridgeModInstaller`)

**Files:**
- Create: `src/services/bridgeModInstaller.ts`
- Test: `tests/services/bridgeModInstaller.test.ts`

**Interfaces:**
- Consumes: `BRIDGE_MOD_FILES` (Task 2); `ClaudeSettingsFile`, `SettingsParseError`, `type ClaudeSettings` de `src/services/claudeSettings.ts`; `atomicWriteFileSync` de `src/services/atomicWrite.ts`.
- Produces (usados pelas Tasks 5 e 6):
  - `PLUGIN_DIRS_ENV = 'CLAUDE_CODE_PLUGIN_DIRS'`, `BRIDGE_MOD_NAME = 'claude-todos-bridge'`
  - `interface BridgeModStatus { installed: boolean; installedAt?: number }`
  - `interface BridgeModInstallerOptions { files?: Readonly<Record<string, string>>; now?: () => number; delimiter?: string }`
  - `splitPluginDirs(value: string | undefined, delimiter?: string): string[]`
  - `class BridgeModInstaller { constructor(claudeDir: string, settings: ClaudeSettingsFile, opts?: BridgeModInstallerOptions); readonly modDir: string; status(): BridgeModStatus; install(): { changed: boolean; path: string }; uninstall(): { changed: boolean; path: string }; refresh(): void }`

- [ ] **Step 1: Escrever os testes**

Criar `tests/services/bridgeModInstaller.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeModInstaller, PLUGIN_DIRS_ENV, splitPluginDirs } from '../../src/services/bridgeModInstaller';
import { ClaudeSettingsFile } from '../../src/services/claudeSettings';

const FILES = {
  '.claude-plugin/plugin.json': '{"name":"claude-todos-bridge","version":"9.9.9"}\n',
  'hooks/hooks.json': '{"modules":["./register.ts"]}\n',
  'hooks/register.ts': 'export const register = () => {}\n',
  'hooks/state.ts': 'export const BRIDGE_SCHEMA = 1;\n',
};

describe('BridgeModInstaller', () => {
  let claudeDir: string;
  let settingsPath: string;
  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-mod-'));
    settingsPath = path.join(claudeDir, 'settings.json');
  });
  afterEach(() => fs.rmSync(claudeDir, { recursive: true, force: true }));

  const make = (files: Record<string, string> = FILES, now = 1_000) =>
    new BridgeModInstaller(claudeDir, new ClaudeSettingsFile(settingsPath), { files, now: () => now, delimiter: ';' });
  const settings = () => JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  const modDir = () => path.join(claudeDir, '.vscode-todos-bridge', 'mod', 'claude-todos-bridge');

  it('installs into a missing settings.json: files, env entry and install time', () => {
    expect(make().install()).toEqual({ changed: true, path: settingsPath });
    expect(settings()).toEqual({ env: { [PLUGIN_DIRS_ENV]: modDir() } });
    expect(fs.readFileSync(path.join(modDir(), 'hooks', 'register.ts'), 'utf-8')).toBe(FILES['hooks/register.ts']);
    expect(make().status()).toEqual({ installed: true, installedAt: 1_000 });
  });

  it("keeps the user's plugin dirs and other settings", () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus', env: { [PLUGIN_DIRS_ENV]: 'D:\\mine;E:\\other', FOO: '1' } }));
    make().install();
    expect(settings()).toEqual({ model: 'opus', env: { [PLUGIN_DIRS_ENV]: `D:\\mine;E:\\other;${modDir()}`, FOO: '1' } });
  });

  it('is idempotent: a second install neither duplicates the entry nor moves the install time', () => {
    make(FILES, 1_000).install();
    expect(make(FILES, 2_000).install().changed).toBe(false);
    expect(splitPluginDirs(settings().env[PLUGIN_DIRS_ENV], ';')).toEqual([modDir()]);
    expect(make().status().installedAt).toBe(1_000);
  });

  it('throws on an invalid settings.json and writes nothing', () => {
    fs.writeFileSync(settingsPath, '{ broken');
    expect(() => make().install()).toThrow(/not valid JSON/);
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ broken');
    expect(fs.existsSync(modDir())).toBe(false);
  });

  it('refuses a non-string plugin dirs value instead of overwriting it', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { [PLUGIN_DIRS_ENV]: 42 } }));
    expect(() => make().install()).toThrow(/is not a string/);
    expect(settings()).toEqual({ env: { [PLUGIN_DIRS_ENV]: 42 } });
  });

  it('uninstall removes only our entry and the mod folder', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { [PLUGIN_DIRS_ENV]: 'D:\\mine', FOO: '1' } }));
    make().install();
    expect(make().uninstall()).toEqual({ changed: true, path: settingsPath });
    expect(settings()).toEqual({ env: { [PLUGIN_DIRS_ENV]: 'D:\\mine', FOO: '1' } });
    expect(fs.existsSync(path.dirname(modDir()))).toBe(false);
    expect(make().status()).toEqual({ installed: false });
  });

  it('uninstall restores a settings.json that had no env at all', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus' }));
    make().install();
    make().uninstall();
    expect(settings()).toEqual({ model: 'opus' });
  });

  it('uninstall without an install changes nothing in settings.json', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus' }));
    expect(make().uninstall().changed).toBe(false);
    expect(settings()).toEqual({ model: 'opus' });
  });

  it('status is false when the entry exists but the folder is gone, and on an invalid settings.json', () => {
    make().install();
    fs.rmSync(modDir(), { recursive: true, force: true });
    expect(make().status()).toEqual({ installed: false });
    fs.writeFileSync(settingsPath, '{ broken');
    expect(make().status()).toEqual({ installed: false });
  });

  it('refresh rewrites only the files that changed, and only when installed', () => {
    make().refresh();
    expect(fs.existsSync(modDir())).toBe(false);
    make().install();
    const registerPath = path.join(modDir(), 'hooks', 'register.ts');
    const old = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(registerPath, old, old);
    make({ ...FILES, 'hooks/state.ts': 'export const BRIDGE_SCHEMA = 2;\n' }).refresh();
    expect(fs.readFileSync(path.join(modDir(), 'hooks', 'state.ts'), 'utf-8')).toBe('export const BRIDGE_SCHEMA = 2;\n');
    expect(fs.statSync(registerPath).mtimeMs).toBe(old.getTime());
  });

  // Review Focus 1
  it('matches our entry regardless of case and separators on Windows', () => {
    if (process.platform !== 'win32') return;
    fs.mkdirSync(path.join(modDir(), '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(modDir(), '.claude-plugin', 'plugin.json'), '{}');
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { [PLUGIN_DIRS_ENV]: modDir().toUpperCase().replace(/\\/g, '/') } }));
    expect(make().status().installed).toBe(true);
    expect(make().install().changed).toBe(false);
    expect(make().uninstall().changed).toBe(true);
    expect(settings()).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/bridgeModInstaller.test.ts`
Expected: FAIL na coleta — `../../src/services/bridgeModInstaller` não existe.

- [ ] **Step 3: Implementar**

Criar `src/services/bridgeModInstaller.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeSettingsFile, SettingsParseError, type ClaudeSettings } from './claudeSettings';
import { atomicWriteFileSync } from './atomicWrite';
import { BRIDGE_MOD_FILES } from '../generated/bridgeModFiles';

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
}

// Entradas de uma lista no formato do CLAUDE_CODE_PLUGIN_DIRS, sem vazios.
export function splitPluginDirs(value: string | undefined, delimiter: string = path.delimiter): string[] {
  return (value ?? '').split(delimiter).map(s => s.trim()).filter(s => s !== '');
}

// No Windows a comparação ignora maiúsculas e unifica os separadores.
function samePath(a: string, b: string): boolean {
  return process.platform === 'win32'
    ? path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase()
    : path.normalize(a) === path.normalize(b);
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
  private readonly files: Readonly<Record<string, string>>;
  private readonly now: () => number;
  private readonly delimiter: string;

  constructor(
    claudeDir: string,
    private readonly settings: ClaudeSettingsFile,
    opts: BridgeModInstallerOptions = {},
  ) {
    const modRoot = path.join(claudeDir, '.vscode-todos-bridge', 'mod');
    this.modDir = path.join(modRoot, BRIDGE_MOD_NAME);
    this.markerPath = path.join(modRoot, 'install.json');
    this.files = opts.files ?? BRIDGE_MOD_FILES;
    this.now = opts.now ?? (() => Date.now());
    this.delimiter = opts.delimiter ?? path.delimiter;
  }

  // Instalado = a nossa entrada no env e a pasta do mod existem. Um
  // settings.json inválido conta como não instalado: o painel oferece Ativar, e
  // a ativação mostra o erro real.
  status(): BridgeModStatus {
    let listed = false;
    try {
      listed = this.pluginDirsOf(this.envOf(this.settings.read())).some(d => samePath(d, this.modDir));
    } catch { /* settings.json inválido */ }
    if (!listed || !fs.existsSync(path.join(this.modDir, '.claude-plugin', 'plugin.json'))) return { installed: false };
    const installedAt = this.readInstalledAt();
    return { installed: true, ...(installedAt !== undefined ? { installedAt } : {}) };
  }

  // Lança SettingsParseError quando o settings.json existe e não parseia, ou
  // quando o env ou a lista de pastas têm um formato que não é o nosso: nada é
  // gravado. `changed` = a entrada no env foi criada agora.
  install(): { changed: boolean; path: string } {
    const settings = this.settings.read();
    const env = this.envOf(settings);
    const dirs = this.pluginDirsOf(env);
    this.writeFiles();
    const listed = dirs.some(d => samePath(d, this.modDir));
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
    const settings = this.settings.read();
    const env = this.envOf(settings);
    const dirs = this.pluginDirsOf(env);
    const kept = dirs.filter(d => !samePath(d, this.modDir));
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/services/bridgeModInstaller.test.ts && npm run typecheck`
Expected: PASS (todos; o teste de Windows roda nesta máquina) e `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/services/bridgeModInstaller.ts tests/services/bridgeModInstaller.test.ts
git commit -m "feat(bridge): instalador do mod via CLAUDE_CODE_PLUGIN_DIRS (item 25)

Grava o mod em .vscode-todos-bridge/mod/, lista a pasta no env do
settings.json preservando as entradas do usuario e nunca sobrescreve um
arquivo invalido; desinstalar remove so a nossa entrada.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Leitor dos arquivos da ponte (`BridgeLiveReader`)

**Files:**
- Create: `src/services/bridgeLive.ts`
- Modify: `src/types.ts` (depois de `CacheStats`, linhas 60-64)
- Test: `tests/services/bridgeLive.test.ts`

**Interfaces:**
- Consumes: `parseBridgeFile`, `type BridgeFile` (Task 1); `SAFE_SESSION_ID` de `src/services/transcriptPaths.ts`; `type LifecycleEntry` de `src/services/agentLifecycle.ts`.
- Produces (usados pelas Tasks 5, 6 e 9):
  - Em `src/types.ts`: `interface RateLimit { kind: string; percentUsed: number; resetsAt: string }` e `interface RateLimitsReading { readAt: number; limits: RateLimit[] }`.
  - `MIN_LIFECYCLE_ENGINE = [2, 1, 289] as const`
  - `engineAtLeast(version: string | undefined, min: readonly [number, number, number]): boolean`
  - `lifecycleFromBridge(file: BridgeFile | undefined): Map<string, LifecycleEntry> | undefined`
  - `class BridgeLiveReader { constructor(claudeDir: string); readonly liveDir: string; forSession(sessionId: string): BridgeFile | undefined; latestRateLimits(): RateLimitsReading | undefined; prune(maxAgeMs: number, now: number): void }`

- [ ] **Step 1: Escrever os testes**

Criar `tests/services/bridgeLive.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeLiveReader, engineAtLeast, lifecycleFromBridge } from '../../src/services/bridgeLive';
import { applyEvent, emptyFile, toText, type BridgeEvent, type BridgeFile } from '../../src/bridgeMod/state';

const SID = 'aaaa1111-2222-3333-4444-555566667777';
const T = 1_791_215_940_722;

function fileWith(sessionId: string, events: BridgeEvent[], engine = '2.1.289'): BridgeFile {
  let f = applyEvent(emptyFile(sessionId, T), { kind: 'engine', version: engine });
  for (const ev of events) f = applyEvent(f, ev);
  return f;
}

describe('BridgeLiveReader', () => {
  let claudeDir: string;
  let live: string;
  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-live-'));
    live = path.join(claudeDir, '.vscode-todos-bridge', 'live');
    fs.mkdirSync(live, { recursive: true });
  });
  afterEach(() => fs.rmSync(claudeDir, { recursive: true, force: true }));

  const write = (sessionId: string, text: string, mtime?: Date) => {
    const p = path.join(live, `${sessionId}.json`);
    fs.writeFileSync(p, text);
    if (mtime) fs.utimesSync(p, mtime, mtime);
  };

  it('returns undefined for a missing file or an unsafe id', () => {
    const r = new BridgeLiveReader(claudeDir);
    expect(r.forSession(SID)).toBeUndefined();
    expect(r.forSession('../evil')).toBeUndefined();
  });

  it('reads a valid file', () => {
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 5, reason: 'answer' }]), T + 6));
    expect(new BridgeLiveReader(claudeDir).forSession(SID)?.turn).toEqual({ state: 'idle', at: T + 5, reason: 'answer' });
  });

  // Review Focus 2
  it('keeps the last good reading while the file is half-written', () => {
    const r = new BridgeLiveReader(claudeDir);
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 5 }]), T + 6));
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
    write(SID, '{"schema":1,"sessionId":"aaaa');
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
  });

  it('ignores another schema and a file that names another session', () => {
    write(SID, JSON.stringify({ ...emptyFile(SID, T), schema: 2 }));
    expect(new BridgeLiveReader(claudeDir).forSession(SID)).toBeUndefined();
    write(SID, toText(emptyFile('bbbb', T), T));
    expect(new BridgeLiveReader(claudeDir).forSession(SID)).toBeUndefined();
  });

  it('rereads only when mtime or size change', () => {
    const r = new BridgeLiveReader(claudeDir);
    const stamp = new Date('2026-10-05T12:00:00Z');
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 5 }]), T), stamp);
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
    // mesmo tamanho e mesmo mtime: vale o cache
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 7 }]), T), stamp);
    expect(r.forSession(SID)?.turn?.at).toBe(T + 5);
    write(SID, toText(fileWith(SID, [{ kind: 'mainTurnEnd', at: T + 7 }]), T), new Date('2026-10-05T12:00:05Z'));
    expect(r.forSession(SID)?.turn?.at).toBe(T + 7);
  });

  it('latestRateLimits picks the most recent reading across files with limits', () => {
    const limits = (pct: number) => [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2026-10-05T20:40:00.000Z' }];
    write('s1', toText(fileWith('s1', [{ kind: 'usage', at: T + 1, usage: { context: { window: 1e6 }, rateLimits: limits(10) } }]), T));
    write('s2', toText(fileWith('s2', [{ kind: 'usage', at: T + 9, usage: { context: { window: 1e6 }, rateLimits: limits(40) } }]), T));
    write('s3', toText(fileWith('s3', [{ kind: 'usage', at: T + 20, usage: { context: { window: 1e6 }, rateLimits: [] } }]), T));
    expect(new BridgeLiveReader(claudeDir).latestRateLimits()).toEqual({ readAt: T + 9, limits: limits(40) });
  });

  it('latestRateLimits is undefined without the folder', () => {
    fs.rmSync(live, { recursive: true, force: true });
    expect(new BridgeLiveReader(claudeDir).latestRateLimits()).toBeUndefined();
  });

  it('prune removes files older than the window and keeps the rest', () => {
    write('old1', toText(emptyFile('old1', T), T), new Date('2026-08-01T00:00:00Z'));
    write('new1', toText(emptyFile('new1', T), T), new Date('2026-10-05T00:00:00Z'));
    new BridgeLiveReader(claudeDir).prune(30 * 86_400_000, Date.parse('2026-10-06T00:00:00Z'));
    expect(fs.readdirSync(live).sort()).toEqual(['new1.json']);
  });
});

describe('lifecycleFromBridge', () => {
  const agents: BridgeEvent[] = [
    { kind: 'spawn', at: T + 1, agentId: 'ag1' },
    { kind: 'agentEnd', at: T + 2, agentId: 'ag2', reason: 'answer' },
  ];

  it('maps the agents to lifecycle entries on 2.1.289 or newer', () => {
    expect(lifecycleFromBridge(fileWith(SID, agents, '2.1.289'))).toEqual(new Map([
      ['ag1', { state: 'running', at: T + 1 }],
      ['ag2', { state: 'stopped', at: T + 2 }],
    ]));
  });

  it('ignores the agents of an older engine, an unknown version or a missing file', () => {
    expect(lifecycleFromBridge(fileWith(SID, agents, '2.1.286'))).toBeUndefined();
    expect(lifecycleFromBridge({ ...fileWith(SID, agents), engineVersion: undefined })).toBeUndefined();
    expect(lifecycleFromBridge(undefined)).toBeUndefined();
  });
});

describe('engineAtLeast', () => {
  it('compares numerically, part by part', () => {
    expect(engineAtLeast('2.1.289', [2, 1, 289])).toBe(true);
    expect(engineAtLeast('2.1.300', [2, 1, 289])).toBe(true);
    expect(engineAtLeast('2.2.0', [2, 1, 289])).toBe(true);
    expect(engineAtLeast('2.1.29', [2, 1, 289])).toBe(false);
    expect(engineAtLeast('2.1.288-beta', [2, 1, 289])).toBe(false);
    expect(engineAtLeast('nope', [2, 1, 289])).toBe(false);
    expect(engineAtLeast(undefined, [2, 1, 289])).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/services/bridgeLive.test.ts`
Expected: FAIL na coleta — `../../src/services/bridgeLive` não existe.

- [ ] **Step 3: Tipos de limites no snapshot**

Em `src/types.ts`, depois da interface `CacheStats` (linhas 60-64), acrescentar:

```ts
// Ponte de dados (ROADMAP item 25): limites de uso da CONTA, não da sessão,
// da leitura mais recente que o mod gravou.
export interface RateLimit {
  kind: string;          // five_hour | seven_day | spend_limit | outro
  percentUsed: number;
  resetsAt: string;      // ISO 8601
}

export interface RateLimitsReading {
  readAt: number;        // epoch ms da leitura (usage.at do arquivo)
  limits: RateLimit[];
}
```

- [ ] **Step 4: Implementar o leitor**

Criar `src/services/bridgeLive.ts`:

```ts
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

// Os agentes do arquivo como mais uma fonte do mergeLifecycles; só quando o
// arquivo veio de um engine que garante o mesmo id do transcript.
export function lifecycleFromBridge(file: BridgeFile | undefined): Map<string, LifecycleEntry> | undefined {
  if (!file || !engineAtLeast(file.engineVersion, MIN_LIFECYCLE_ENGINE)) return undefined;
  const out = new Map<string, LifecycleEntry>();
  for (const [id, agent] of Object.entries(file.agents)) out.set(id, { state: agent.state, at: agent.at });
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
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/services/bridgeLive.test.ts && npm run typecheck`
Expected: PASS (todos) e `tsc` sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/services/bridgeLive.ts src/types.ts tests/services/bridgeLive.test.ts
git commit -m "feat(bridge): leitor tolerante dos arquivos da ponte (item 25)

Le live/<sessionId>.json com cache por mtime e tamanho, mantem a ultima
leitura boa de um arquivo pela metade, escolhe a leitura de limites mais
recente e so entrega o ciclo de vida dos agentes de engine 2.1.289+.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Janela, limites, ciclo de vida e estado da ponte no snapshot

**Files:**
- Modify: `src/types.ts` (`ContextUsage`, linhas 55-58; `SessionUsage`, 66-71; `SessionSnapshot`, 87-99)
- Modify: `src/services/todosParser.ts:215-245` (`listSessionDetail`) e `:295-368` (`listSubAgents`)
- Modify: `src/services/snapshotService.ts` (imports, construtor, `build()`)
- Test: `tests/services/snapshotService.test.ts`, `tests/services/todosParser.test.ts`

**Interfaces:**
- Consumes: `lifecycleFromBridge` (Task 4); `type BridgeFile` (Task 1); `type BridgeModStatus` (Task 3); `RateLimitsReading` (Task 4).
- Produces (usados pelas Tasks 6 e 9):
  - `ContextUsage.source?: 'mod'`; `SessionUsage.rateLimits?: RateLimitsReading`; `type BridgeStatus = 'off' | 'active' | 'next-session' | 'silent'`; `SessionSnapshot.bridge?: BridgeStatus`.
  - `listSessionDetail(sessionId, cwd, opts?: { alive?: boolean; aliveSince?: number; extraLifecycle?: Map<string, LifecycleEntry> })`.
  - `export interface SnapshotBridge { forSession(sessionId: string): BridgeFile | undefined; latestRateLimits(): RateLimitsReading | undefined; status(): BridgeModStatus }`
  - `SnapshotService` ganha o 8º parâmetro opcional `bridge?: SnapshotBridge`.
  - `SILENT_AFTER_MS = 60_000` (exportado de `snapshotService.ts`).

- [ ] **Step 1: Escrever os testes do parser**

Em `tests/services/todosParser.test.ts`, trocar a linha 5:

```ts
import { TodosParser, detectAwaitingInput, detectPendingQuestions } from '../../src/services/todosParser';
```

por:

```ts
import { TodosParser, detectAwaitingInput, detectPendingQuestions } from '../../src/services/todosParser';
import type { LifecycleEntry } from '../../src/services/agentLifecycle';
```

e, dentro de `describe('background sub-agents (R6)', ...)`, depois do teste `'a resume by SendMessage in the current process makes an old agent running again'`, acrescentar:

```ts
    // Ponte de dados (item 25): os agentes do arquivo do mod entram no mergeLifecycles.
    const withBridge = (agentId: string, extra: Map<string, LifecycleEntry>) =>
      parser.listSessionDetail('s1', CWD, { alive: true, extraLifecycle: extra }).agents.find(a => a.agentId === agentId)!.status;

    it('a stop recorded by the bridge after the launch completes the agent', () => {
      writeBackgroundSession();   // lançado em T(0), sem notificação no transcript
      expect(withBridge('bg0001', new Map<string, LifecycleEntry>([['bg0001', { state: 'stopped', at: Date.parse(T(3)) }]])))
        .toBe('completed');
    });

    it('a resume in the transcript after the bridge stop keeps the agent running', () => {
      writeBackgroundSession([
        taskNotification('bg0001', 'toolu_BG', T(8)),
        sendMessageToolUse('toolu_SM', 'bg0001'),
        resumeResult('toolu_SM', 'bg0001', T(20)),
      ]);
      expect(withBridge('bg0001', new Map<string, LifecycleEntry>([['bg0001', { state: 'stopped', at: Date.parse(T(8)) }]])))
        .toBe('running');
    });
```

- [ ] **Step 2: Escrever os testes do snapshot**

Em `tests/services/snapshotService.test.ts`, trocar as linhas 1-3:

```ts
import { describe, it, expect, vi } from 'vitest';
import { SnapshotService } from '../../src/services/snapshotService';
import type { PendingQuestion } from '../../src/types';
```

por:

```ts
import { describe, it, expect, vi } from 'vitest';
import { SnapshotService } from '../../src/services/snapshotService';
import type { PendingQuestion, RateLimitsReading } from '../../src/types';
import type { LiveSession } from '../../src/services/liveSessions';
import type { BridgeFile } from '../../src/bridgeMod/state';
```

e acrescentar ao fim do arquivo:

```ts
describe('SnapshotService with the data bridge (item 25)', () => {
  const resolver = { resolveCandidates: () => [{ cwd: '/p', sessionId: 'a', terminalPid: null, startedAt: 1 }] };
  const NOW = Date.parse('2026-10-05T18:00:00.000Z');
  const usageWithContext = {
    usageForSession: () => ({ byModel: [], byAgent: [], context: { tokens: 150_000, limit: 200_000 } }),
  };
  const bridgeFile = (over: Partial<BridgeFile> = {}): BridgeFile => ({
    schema: 1, sessionId: 'a', engineVersion: '2.1.289', writtenAt: NOW, agents: {},
    usage: { at: NOW - 60_000, context: { tokens: 150_000, window: 1_000_000, percent: 15 }, rateLimits: [] },
    ...over,
  });
  const bridgeOf = (opts: {
    file?: BridgeFile;
    reading?: RateLimitsReading;
    status?: { installed: boolean; installedAt?: number };
  }) => ({
    forSession: (id: string) => (opts.file && opts.file.sessionId === id ? opts.file : undefined),
    latestRateLimits: () => opts.reading,
    status: () => opts.status ?? { installed: true, installedAt: NOW - 3_600_000 },
  });
  const make = (
    bridge: ReturnType<typeof bridgeOf> | undefined,
    live: Map<string, LiveSession> = new Map(),
    usage: object = usageWithContext,
    parser: object = makeParser({ mtimes: { a: 10 } }),
  ) => new SnapshotService(resolver as any, parser as any, usage as any, () => live, undefined, () => NOW, undefined, bridge);

  it('replaces the estimated window with the exact one and marks the source', () => {
    expect(make(bridgeOf({ file: bridgeFile() })).build()?.usage?.context)
      .toEqual({ tokens: 150_000, limit: 1_000_000, source: 'mod' });
  });

  it('keeps the estimate when the bridge has no window for the session, or without a bridge', () => {
    expect(make(bridgeOf({ file: bridgeFile({ usage: undefined }) })).build()?.usage?.context)
      .toEqual({ tokens: 150_000, limit: 200_000 });
    expect(make(undefined).build()?.usage?.context).toEqual({ tokens: 150_000, limit: 200_000 });
  });

  it('does not invent a context the parser does not have', () => {
    const noContext = { usageForSession: () => ({ byModel: [], byAgent: [] }) };
    expect(make(bridgeOf({ file: bridgeFile() }), new Map(), noContext).build()?.usage?.context).toBeUndefined();
  });

  it('shows the most recent rate limits and hides the windows that already reset', () => {
    const reading: RateLimitsReading = { readAt: NOW - 120_000, limits: [
      { kind: 'five_hour', percentUsed: 32, resetsAt: '2026-10-05T20:40:00.000Z' },
      { kind: 'seven_day', percentUsed: 9, resetsAt: '2026-10-05T17:00:00.000Z' },
    ] };
    expect(make(bridgeOf({ file: bridgeFile(), reading })).build()?.usage?.rateLimits).toEqual({
      readAt: NOW - 120_000, limits: [{ kind: 'five_hour', percentUsed: 32, resetsAt: '2026-10-05T20:40:00.000Z' }],
    });
  });

  it('omits rate limits when every window already reset, or when the mod is not installed', () => {
    const stale: RateLimitsReading = { readAt: NOW - 86_400_000, limits: [
      { kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-04T20:40:00.000Z' },
    ] };
    expect(make(bridgeOf({ file: bridgeFile(), reading: stale })).build()?.usage?.rateLimits).toBeUndefined();
    const fresh: RateLimitsReading = { readAt: NOW, limits: [
      { kind: 'five_hour', percentUsed: 5, resetsAt: '2026-10-05T20:40:00.000Z' },
    ] };
    expect(make(bridgeOf({ file: bridgeFile(), reading: fresh, status: { installed: false } })).build()?.usage?.rateLimits)
      .toBeUndefined();
  });

  // Review Focus 4
  it('feeds the agents of a 2.1.289 file to the parser as extra lifecycle', () => {
    const received: Array<{ extraLifecycle?: unknown }> = [];
    const parser = {
      ...makeParser({ mtimes: { a: 10 } }),
      listSessionDetail: (_s: string, _c: string, opts?: { extraLifecycle?: unknown }) => {
        received.push(opts ?? {});
        return { agents: [], awaitingInput: null, pendingQuestions: [] };
      },
    };
    const file = bridgeFile({ agents: { ag1: { state: 'stopped', at: NOW - 5_000 } } });
    make(bridgeOf({ file }), new Map(), usageWithContext, parser).build();
    expect(received[0].extraLifecycle).toEqual(new Map([['ag1', { state: 'stopped', at: NOW - 5_000 }]]));
    received.length = 0;
    const older = make(bridgeOf({ file: { ...file, engineVersion: '2.1.286' } }), new Map(), usageWithContext, parser).build();
    expect(received[0].extraLifecycle).toBeUndefined();
    expect(older?.usage?.context).toEqual({ tokens: 150_000, limit: 1_000_000, source: 'mod' });
  });

  describe('bridge status', () => {
    const installed = { installed: true, installedAt: NOW - 3_600_000 };
    const liveA = (startedAt: number) =>
      new Map<string, LiveSession>([['a', { pid: 1, sessionId: 'a', cwd: '/p', startedAt }]]);

    it('off when the mod is not installed', () => {
      expect(make(bridgeOf({ status: { installed: false } })).build()?.bridge).toBe('off');
    });

    it('active when the session has a file', () => {
      expect(make(bridgeOf({ file: bridgeFile() })).build()?.bridge).toBe('active');
    });

    it('silent when a live session started after the install has no file after a minute', () => {
      expect(make(bridgeOf({ status: installed }), liveA(NOW - 120_000)).build()?.bridge).toBe('silent');
    });

    it('next-session for a session started before the install, too recent, or not alive', () => {
      expect(make(bridgeOf({ status: installed }), liveA(NOW - 7_200_000)).build()?.bridge).toBe('next-session');
      expect(make(bridgeOf({ status: installed }), liveA(NOW - 30_000)).build()?.bridge).toBe('next-session');
      expect(make(bridgeOf({ status: installed })).build()?.bridge).toBe('next-session');
    });

    it('absent when the host injects no bridge', () => {
      expect(make(undefined).build()?.bridge).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/services/todosParser.test.ts tests/services/snapshotService.test.ts`
Expected: FAIL. No parser, `a stop recorded by the bridge after the launch completes the agent` falha (`expected 'running' to be 'completed'`): a opção ainda é ignorada. No snapshot, os testes novos falham porque o 8º parâmetro é ignorado (`limit: 200000`, `bridge` indefinido, `extraLifecycle` indefinido). Os testes antigos seguem verdes.

- [ ] **Step 4: Tipos do snapshot**

Em `src/types.ts`, trocar `ContextUsage` (linhas 55-58):

```ts
export interface ContextUsage {
  tokens: number;  // input + cache da última mensagem do transcript principal
  limit: number;   // 200_000 | 1_000_000
}
```

por:

```ts
export interface ContextUsage {
  tokens: number;  // input + cache da última mensagem do transcript principal
  limit: number;   // 200_000 | 1_000_000 (estimado) ou a janela exata da ponte
  source?: 'mod';  // presente quando `limit` veio da ponte de dados (item 25)
}
```

trocar `SessionUsage` (linhas 66-71):

```ts
export interface SessionUsage {
  byModel: ModelUsage[];  // totais da sessão agrupados por modelo
  byAgent: AgentUsage[];  // quebra por agente
  context?: ContextUsage;
  cache?: CacheStats;
}
```

por:

```ts
export interface SessionUsage {
  byModel: ModelUsage[];  // totais da sessão agrupados por modelo
  byAgent: AgentUsage[];  // quebra por agente
  context?: ContextUsage;
  cache?: CacheStats;
  rateLimits?: RateLimitsReading;  // ponte de dados (item 25): limites da conta
}

// Estado do rodapé da ponte de dados (item 25): mod não instalado, sessão com
// arquivo, sessão que deveria ter arquivo e não tem, ou demais casos.
export type BridgeStatus = 'off' | 'active' | 'next-session' | 'silent';
```

e, em `SessionSnapshot`, depois de `taskToolsOff?: true;`, acrescentar:

```ts
  // Ponte de dados (item 25): presente quando o host injeta a ponte.
  bridge?: BridgeStatus;
```

- [ ] **Step 5: `extraLifecycle` no parser**

Em `src/services/todosParser.ts`, trocar o comentário e a assinatura de `listSessionDetail` (linhas 215-220):

```ts
  // `alive`: a sessão tem processo do Claude Code vivo (registro em
  // ~/.claude/sessions). Sem a opção, nenhum sub-agent assíncrono conta como
  // rodando — o comportamento de antes do R6. `aliveSince`: início desse
  // processo (epoch ms); um lançamento ou retomada anterior a ele é de um
  // processo que já morreu (sessão retomada). Ausente = sem limite.
  listSessionDetail(sessionId: string, cwd: string, opts: { alive?: boolean; aliveSince?: number } = {}): {
```

por:

```ts
  // `alive`: a sessão tem processo do Claude Code vivo (registro em
  // ~/.claude/sessions). Sem a opção, nenhum sub-agent assíncrono conta como
  // rodando — o comportamento de antes do R6. `aliveSince`: início desse
  // processo (epoch ms); um lançamento ou retomada anterior a ele é de um
  // processo que já morreu (sessão retomada). Ausente = sem limite.
  // `extraLifecycle`: eventos de ciclo de vida de fora do transcript (a ponte de
  // dados, item 25), juntados pelo evento mais recente de cada agente.
  listSessionDetail(sessionId: string, cwd: string, opts: {
    alive?: boolean;
    aliveSince?: number;
    extraLifecycle?: Map<string, LifecycleEntry>;
  } = {}): {
```

trocar a linha 245:

```ts
    agents.push(...this.listSubAgents(sessionId, cwd, mainLines, opts.alive === true, opts.aliveSince));
```

por:

```ts
    agents.push(...this.listSubAgents(sessionId, cwd, mainLines, opts.alive === true, opts.aliveSince, opts.extraLifecycle));
```

trocar a assinatura de `listSubAgents` (linhas 295-301):

```ts
  private listSubAgents(
    sessionId: string,
    cwd: string,
    mainLines: string[],
    sessionAlive: boolean,
    aliveSince: number | undefined,
  ): AgentTodos[] {
```

por:

```ts
  private listSubAgents(
    sessionId: string,
    cwd: string,
    mainLines: string[],
    sessionAlive: boolean,
    aliveSince: number | undefined,
    extraLifecycle: Map<string, LifecycleEntry> | undefined,
  ): AgentTodos[] {
```

e trocar o bloco das linhas 365-368:

```ts
    const lifecycle = mergeLifecycles([
      collectAgentLifecycle(mainLines),
      ...infos.map(i => i.lifecycle),
    ]);
```

por:

```ts
    const lifecycle = mergeLifecycles([
      collectAgentLifecycle(mainLines),
      ...infos.map(i => i.lifecycle),
      ...(extraLifecycle ? [extraLifecycle] : []),
    ]);
```

- [ ] **Step 6: Ponte no `SnapshotService`**

Em `src/services/snapshotService.ts`, trocar os imports (linhas 1-7):

```ts
import type { SessionResolver } from './sessionResolver';
import type { TodosParser } from './todosParser';
import type { UsageParser } from './usageParser';
import type { LiveSession } from './liveSessions';
import type { SessionNames } from './sessionNames';
import type { AgentTodos, SessionSnapshot, SessionSummary } from '../types';
import { evaluateTaskTools, type FlagState } from './taskToolsGate';
```

por:

```ts
import type { SessionResolver } from './sessionResolver';
import type { TodosParser } from './todosParser';
import type { UsageParser } from './usageParser';
import type { LiveSession } from './liveSessions';
import type { SessionNames } from './sessionNames';
import type {
  AgentTodos, BridgeStatus, RateLimitsReading, SessionSnapshot, SessionSummary, SessionUsage,
} from '../types';
import { evaluateTaskTools, type FlagState } from './taskToolsGate';
import type { BridgeFile } from '../bridgeMod/state';
import type { BridgeModStatus } from './bridgeModInstaller';
import { lifecycleFromBridge } from './bridgeLive';

// Ponte de dados (item 25): sessão viva há mais que isto, iniciada depois da
// ativação e sem arquivo = o mod não respondeu.
export const SILENT_AFTER_MS = 60_000;

// O que o snapshot precisa do leitor e do instalador da ponte. Opcional: sem
// ele, nada muda (compatível com quem constrói só o básico).
export interface SnapshotBridge {
  forSession(sessionId: string): BridgeFile | undefined;
  latestRateLimits(): RateLimitsReading | undefined;
  status(): BridgeModStatus;
}
```

no construtor, depois do parâmetro `taskToolsFlags` (linha 23), acrescentar:

```ts
    // Ponte de dados (item 25): janela exata, limites, ciclo de vida e o estado
    // do rodapé. Opcional pelo mesmo motivo do taskToolsFlags.
    private readonly bridge?: SnapshotBridge,
```

em `build()`, trocar o trecho das linhas 65-72:

```ts
    // R6: sub-agent em background só roda com o processo da sessão vivo — e só
    // o que esse processo lançou ou retomou. Numa sessão retomada (mesmo id,
    // processo novo), o que o processo anterior deixou rodando morreu com ele.
    const aliveSince = live.get(chosen.sessionId)?.startedAt;
    const detail = this.parser.listSessionDetail(chosen.sessionId, chosen.cwd, {
      alive: chosen.alive === true,
      ...(aliveSince !== undefined ? { aliveSince } : {}),
    });
```

por:

```ts
    // R6: sub-agent em background só roda com o processo da sessão vivo — e só
    // o que esse processo lançou ou retomou. Numa sessão retomada (mesmo id,
    // processo novo), o que o processo anterior deixou rodando morreu com ele.
    const liveSession = live.get(chosen.sessionId);
    const aliveSince = liveSession?.startedAt;
    // Ponte de dados (item 25): o arquivo do mod para a sessão, quando existe.
    const modStatus = this.bridge?.status();
    const bridgeFile = this.bridge?.forSession(chosen.sessionId);
    const extraLifecycle = lifecycleFromBridge(bridgeFile);
    const detail = this.parser.listSessionDetail(chosen.sessionId, chosen.cwd, {
      alive: chosen.alive === true,
      ...(aliveSince !== undefined ? { aliveSince } : {}),
      ...(extraLifecycle !== undefined ? { extraLifecycle } : {}),
    });
```

trocar a linha 86:

```ts
    const usage = this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents);
```

por:

```ts
    const usage = this.withBridgeUsage(
      this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents),
      bridgeFile,
      modStatus?.installed === true,
    );
    const bridgeState = this.bridgeStatus(modStatus, bridgeFile, liveSession);
```

no objeto devolvido, depois da linha `...(taskToolsOff ? { taskToolsOff: true as const } : {}),`, acrescentar:

```ts
      ...(bridgeState !== undefined ? { bridge: bridgeState } : {}),
```

e, depois do método `choose`, acrescentar:

```ts
  // Janela exata e limites de uso vindos da ponte (spec 2026-10-06, decisão 6).
  // A janela vale para qualquer sessão com arquivo; os limites são da conta e só
  // aparecem com o mod instalado, sem as janelas que já reiniciaram.
  private withBridgeUsage(usage: SessionUsage, file: BridgeFile | undefined, installed: boolean): SessionUsage {
    if (!this.bridge) return usage;
    let out = usage;
    const window = file?.usage?.context?.window;
    if (out.context && window !== undefined) {
      out = { ...out, context: { ...out.context, limit: window, source: 'mod' } };
    }
    const reading = installed ? this.bridge.latestRateLimits() : undefined;
    if (reading) {
      const now = this.now();
      const limits = reading.limits.filter(l => {
        const reset = Date.parse(l.resetsAt);
        return Number.isFinite(reset) && reset > now;
      });
      if (limits.length > 0) out = { ...out, rateLimits: { readAt: reading.readAt, limits } };
    }
    return out;
  }

  // Estado do rodapé da ponte (spec 2026-10-06, decisão 8).
  private bridgeStatus(
    status: BridgeModStatus | undefined,
    file: BridgeFile | undefined,
    live: LiveSession | undefined,
  ): BridgeStatus | undefined {
    if (status === undefined) return undefined;
    if (!status.installed) return 'off';
    if (file) return 'active';
    const started = live?.startedAt;
    if (started !== undefined && status.installedAt !== undefined
      && started > status.installedAt && this.now() - started > SILENT_AFTER_MS) return 'silent';
    return 'next-session';
  }
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run tests/services/todosParser.test.ts tests/services/snapshotService.test.ts && npm run typecheck`
Expected: PASS (todos, antigos e novos) e `tsc` sem erros.

- [ ] **Step 8: Rodar a suíte e commitar**

Run: `npm test`
Expected: PASS (todos).

```bash
git add src/types.ts src/services/todosParser.ts src/services/snapshotService.ts tests/services/todosParser.test.ts tests/services/snapshotService.test.ts
git commit -m "feat(bridge): janela exata, limites e ciclo de vida da ponte no snapshot (item 25)

O window do Claude Code substitui a estimativa por nome de modelo, os
limites de 5h e 7 dias vem da leitura mais recente, os agentes do
arquivo entram no mergeLifecycles e o snapshot ganha o estado do rodape.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Fim do turno no aviso de ociosidade e o core ligado à ponte

**Files:**
- Modify: `src/services/sessionNotifier.ts:10-19` (`NotifierInput`) e `:77-86` (`observe`)
- Modify: `src/core/sessionCore.ts` (imports, campos, construtor, `pruneBridge`, métodos novos, `observeForNotifications`)
- Modify: `src/services/todosWatcher.ts:12-22`
- Test: `tests/services/sessionNotifier.test.ts`, `tests/core/sessionCore.test.ts`, `tests/services/todosWatcher.test.ts`

**Interfaces:**
- Consumes: `BridgeLiveReader` (Task 4), `BridgeModInstaller` (Task 3), `SnapshotBridge` (Task 5), `readLiveSessions`.
- Produces (usados pela Task 7):
  - `NotifierInput.turnEndedAt?: number`
  - `SessionCore.installBridgeMod(): { changed: boolean; path: string }`, `uninstallBridgeMod(): { changed: boolean; path: string }`, `refreshBridgeMod(): void`
  - `SessionCore.pruneBridge` também limpa `live/`.

- [ ] **Step 1: Escrever os testes do notifier**

Em `tests/services/sessionNotifier.test.ts`, dentro de `describe('SessionNotifier', ...)`, ao fim do bloco, acrescentar:

```ts
  describe('turn end from the data bridge (item 25)', () => {
    it('fires idle right away when the bridge says the main turn ended after the last message', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const last = burst(n, 's1', T0, ACTIVITY_MIN_MS);
      expect(n.observe({ sessionId: 's1', mtime: last, allComplete: false, turnEndedAt: last + 500, now: last + 1_000 }))
        .toEqual(['idle']);
    });

    it('a turn end older than the last message belongs to an earlier turn: waits for the 45 s', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const last = burst(n, 's1', T0, ACTIVITY_MIN_MS);
      expect(n.observe({ sessionId: 's1', mtime: last, allComplete: false, turnEndedAt: last - 60_000, now: last + 1_000 }))
        .toEqual([]);
      expect(n.observe({ sessionId: 's1', mtime: last, allComplete: false, turnEndedAt: last - 60_000, now: last + IDLE_MS }))
        .toEqual(['idle']);
    });

    it('does not fire on a fresh turn end while a sub-agent runs', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const last = burst(n, 's1', T0, ACTIVITY_MIN_MS);
      expect(n.observe({
        sessionId: 's1', mtime: last, allComplete: false, subAgentRunning: true, turnEndedAt: last + 500, now: last + 1_000,
      })).toEqual([]);
    });

    it('still requires the minimum burst of activity', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const last = burst(n, 's1', T0, 20_000);
      expect(n.observe({ sessionId: 's1', mtime: last, allComplete: false, turnEndedAt: last + 500, now: last + 1_000 }))
        .toEqual([]);
    });

    it('does not repeat in the same cycle', () => {
      const n = new SessionNotifier();
      n.observe({ sessionId: 's1', mtime: 0, allComplete: false, now: T0 });
      const last = burst(n, 's1', T0, ACTIVITY_MIN_MS);
      expect(n.observe({ sessionId: 's1', mtime: last, allComplete: false, turnEndedAt: last + 500, now: last + 1_000 }))
        .toEqual(['idle']);
      expect(n.observe({ sessionId: 's1', mtime: last, allComplete: false, turnEndedAt: last + 500, now: last + 2_000 }))
        .toEqual([]);
    });
  });
```

- [ ] **Step 2: Escrever os testes do core e do watcher**

Em `tests/core/sessionCore.test.ts`, dentro de `describe('SessionCore', ...)`, ao fim do bloco, acrescentar:

```ts
  // Ponte de dados (item 25)
  function writeBridgeFile(file: object): void {
    const live = path.join(claudeDir, '.vscode-todos-bridge', 'live');
    fs.mkdirSync(live, { recursive: true });
    fs.writeFileSync(path.join(live, `${SID}.json`), JSON.stringify(file));
  }

  function writeLiveRegistry(startedAt: number): void {
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: SID, cwd: CWD, startedAt }));
  }

  function writeMainWithMessagesAt(times: number[]): void {
    const projDir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), times.map(t =>
      JSON.stringify({ ...assistant('claude-opus-4-8'), timestamp: new Date(t).toISOString() })).join('\n') + '\n');
    const bridgeDir = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'sessions.json'), JSON.stringify([
      { cwd: CWD, sessionId: SID, terminalPid: null, startedAt: 1 },
    ]));
  }

  // Rajada de 60 s de atividade no main, observada pelo core.
  function burstThroughCore(T: number, setNow: (v: number) => void, core: SessionCore): void {
    setNow(T);
    writeMainWithMessagesAt([T]);
    core.observeForNotifications();                       // inicializa
    for (const dt of [30_000, 60_000]) {
      setNow(T + dt);
      writeMainWithMessagesAt([T, T + dt]);
      expect(core.observeForNotifications().kinds).toEqual([]);
    }
  }

  it('a turn end reported by the bridge fires the idle toast without the 45 s wait (item 25)', () => {
    const T = Date.parse('2026-10-05T10:00:00.000Z');
    writeLiveRegistry(T - 60_000);
    let now = T;
    const core = new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now });
    burstThroughCore(T, v => { now = v; }, core);
    now = T + 61_000;
    writeBridgeFile({ schema: 1, sessionId: SID, engineVersion: '2.1.289', writtenAt: now, agents: {},
      turn: { state: 'idle', at: T + 60_500, reason: 'answer' } });
    expect(core.observeForNotifications().kinds).toEqual(['idle']);
  });

  // Review Focus 3
  it('ignores a turn end written before the live process started (item 25)', () => {
    const T = Date.parse('2026-10-05T10:00:00.000Z');
    writeLiveRegistry(T + 60_800);
    let now = T;
    const core = new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => now });
    burstThroughCore(T, v => { now = v; }, core);
    now = T + 61_000;
    writeBridgeFile({ schema: 1, sessionId: SID, engineVersion: '2.1.289', writtenAt: now, agents: {},
      turn: { state: 'idle', at: T + 60_500, reason: 'answer' } });
    expect(core.observeForNotifications().kinds).toEqual([]);
  });

  it('installs and uninstalls the bridge mod through settings.json (item 25)', () => {
    writeSession();
    const core = make();
    expect(core.buildSnapshot()?.bridge).toBe('off');
    expect(core.installBridgeMod()).toEqual({ changed: true, path: path.join(claudeDir, 'settings.json') });
    const modDir = path.join(claudeDir, '.vscode-todos-bridge', 'mod', 'claude-todos-bridge');
    expect(fs.existsSync(path.join(modDir, 'hooks', 'register.ts'))).toBe(true);
    expect(core.buildSnapshot()?.bridge).toBe('next-session');
    writeBridgeFile({ schema: 1, sessionId: SID, writtenAt: 1, agents: {} });
    expect(core.buildSnapshot()?.bridge).toBe('active');
    expect(core.uninstallBridgeMod().changed).toBe(true);
    expect(core.buildSnapshot()?.bridge).toBe('off');
    expect(JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'))).toEqual({});
  });

  it('pruneBridge also removes bridge files older than the window (item 25)', () => {
    writeBridgeFile({ schema: 1, sessionId: SID, writtenAt: 1, agents: {} });
    const file = path.join(claudeDir, '.vscode-todos-bridge', 'live', `${SID}.json`);
    const old = new Date('2026-09-01T00:00:00Z');
    fs.utimesSync(file, old, old);
    const core = new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => Date.parse('2026-10-06T00:00:00Z') });
    core.pruneBridge(30 * 24 * 3600 * 1000);
    expect(fs.existsSync(file)).toBe(false);
  });
```

Em `tests/services/todosWatcher.test.ts`, dentro de `describe('TodosWatcher', ...)`, ao fim do bloco, acrescentar:

```ts
  it('fires onChange when the data bridge writes a session file (item 25)', async () => {
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-'));
    w = new TodosWatcher(claudeDir);
    let hits = 0;
    w.onChange(() => { hits++; });
    await new Promise(r => setTimeout(r, 50));
    fs.writeFileSync(path.join(claudeDir, '.vscode-todos-bridge', 'live', 's1.json'), '{}');
    await new Promise(r => setTimeout(r, 400)); // > debounce (150ms)
    expect(hits).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/services/sessionNotifier.test.ts tests/core/sessionCore.test.ts tests/services/todosWatcher.test.ts`
Expected: FAIL.
- `fires idle right away…` (`[]` em vez de `['idle']`) e `does not repeat in the same cycle`.
- `a turn end reported by the bridge fires…` (`[]`).
- `installBridgeMod is not a function`.
- O teste da limpeza falha porque o arquivo continua lá.
- No watcher, `ENOENT` ao gravar em `live/`, que ninguém criou.

Os testes que esperam `[]` passam já.

- [ ] **Step 4: `turnEndedAt` no notifier**

Em `src/services/sessionNotifier.ts`, em `NotifierInput`, depois de `subAgentRunning?: boolean;`, acrescentar:

```ts
  // Ponte de dados (item 25): fim do último turno do main informado pelo mod;
  // presente só com a sessão viva e a partir do início do processo.
  turnEndedAt?: number;
```

trocar a condição do `else if` (linhas 77-82):

```ts
    } else if (
      awaiting === null
      && !this.idleNotified
      && this.lastChangeAt - this.activeSince >= ACTIVITY_MIN_MS
      && input.now - this.lastChangeAt >= IDLE_MS
    ) {
```

por:

```ts
    } else if (
      awaiting === null
      && !this.idleNotified
      && this.lastChangeAt - this.activeSince >= ACTIVITY_MIN_MS
      && (input.now - this.lastChangeAt >= IDLE_MS || turnEndedFresh(input))
    ) {
```

e, depois das constantes `ACTIVITY_MIN_MS` e `IDLE_MS`, acrescentar:

```ts
// Ponte de dados (item 25): o fim do turno do main é mais recente que a última
// mensagem do transcript, então o turno acabou de verdade e o silêncio de
// IDLE_MS deixa de ser exigido. Sem marcador de atividade (mtime 0) não dá para
// comparar: vale a regra de sempre. (No ramo que chama esta função nenhum
// sub-agent está rodando: sub-agent rodando cai no ramo de atividade.)
function turnEndedFresh(input: NotifierInput): boolean {
  return input.turnEndedAt !== undefined && input.mtime > 0 && input.turnEndedAt >= input.mtime;
}
```

- [ ] **Step 5: Core e watcher**

Em `src/core/sessionCore.ts`, depois do import de `TaskToolsFlagReader` (linha 16), acrescentar:

```ts
import { BridgeLiveReader } from '../services/bridgeLive';
import { BridgeModInstaller } from '../services/bridgeModInstaller';
```

depois do campo `private readonly taskToolsFlags: TaskToolsFlagReader;`, acrescentar:

```ts
  private readonly bridgeLive: BridgeLiveReader;
  private readonly bridgeMod: BridgeModInstaller;
```

no construtor, trocar o bloco das linhas 54-62:

```ts
    this.taskToolsFlags = new TaskToolsFlagReader(this.settingsFile.path);
    const resolver = new SessionResolver(this.bridge, this.workspaceCwds);
    this.snapshotService = new SnapshotService(
      resolver, this.parser, this.usageParser,
      () => readLiveSessions(this.claudeDir),
      this.sessionNames,
      this.now,
      this.taskToolsFlags,
    );
```

por:

```ts
    this.taskToolsFlags = new TaskToolsFlagReader(this.settingsFile.path);
    this.bridgeLive = new BridgeLiveReader(this.claudeDir);
    this.bridgeMod = new BridgeModInstaller(this.claudeDir, this.settingsFile, { now: this.now });
    const resolver = new SessionResolver(this.bridge, this.workspaceCwds);
    this.snapshotService = new SnapshotService(
      resolver, this.parser, this.usageParser,
      () => readLiveSessions(this.claudeDir),
      this.sessionNames,
      this.now,
      this.taskToolsFlags,
      {
        forSession: (sessionId) => this.bridgeLive.forSession(sessionId),
        latestRateLimits: () => this.bridgeLive.latestRateLimits(),
        status: () => this.bridgeMod.status(),
      },
    );
```

trocar `pruneBridge` (linhas 66-69):

```ts
  pruneBridge(maxAgeMs: number): void {
    this.bridge.prune(maxAgeMs);
    this.sessionNames.prune(maxAgeMs, this.now());
  }
```

por:

```ts
  pruneBridge(maxAgeMs: number): void {
    this.bridge.prune(maxAgeMs);
    this.sessionNames.prune(maxAgeMs, this.now());
    this.bridgeLive.prune(maxAgeMs, this.now());
  }

  // Ponte de dados (item 25): grava o mod e o lista em env.CLAUDE_CODE_PLUGIN_DIRS.
  // Lança SettingsParseError com um settings.json inválido (nada é gravado).
  installBridgeMod(): { changed: boolean; path: string } { return this.bridgeMod.install(); }
  uninstallBridgeMod(): { changed: boolean; path: string } { return this.bridgeMod.uninstall(); }
  // Na ativação: regrava os arquivos do mod instalado que mudaram. Nunca lança.
  refreshBridgeMod(): void { this.bridgeMod.refresh(); }
```

em `observeForNotifications()`, trocar:

```ts
    const subAgentRunning = snapshot.agents.some(a => !a.isMain && a.status === 'running');
    const kinds = this.notifier.observe({
      sessionId: snapshot.sessionId, mtime, allComplete, awaitingInput, subAgentRunning, now: this.now(),
    });
```

por:

```ts
    const subAgentRunning = snapshot.agents.some(a => !a.isMain && a.status === 'running');
    // Ponte de dados (item 25): fim do turno do main informado pelo mod.
    const turnEndedAt = this.bridgeTurnEndedAt(snapshot.sessionId);
    const kinds = this.notifier.observe({
      sessionId: snapshot.sessionId, mtime, allComplete, awaitingInput, subAgentRunning,
      ...(turnEndedAt !== undefined ? { turnEndedAt } : {}),
      now: this.now(),
    });
```

e, depois de `shouldPollNotifications()`, acrescentar:

```ts
  // Só com a sessão viva e a partir do início do processo atual: um fim gravado
  // por um processo anterior (sessão retomada) não diz nada sobre o turno de agora.
  private bridgeTurnEndedAt(sessionId: string): number | undefined {
    const turn = this.bridgeLive.forSession(sessionId)?.turn;
    if (turn?.state !== 'idle') return undefined;
    const live = readLiveSessions(this.claudeDir).get(sessionId);
    if (!live) return undefined;
    if (live.startedAt !== undefined && turn.at < live.startedAt) return undefined;
    return turn.at;
  }
```

Em `src/services/todosWatcher.ts`, depois da linha `this.tryWatch(bridgeDir, { recursive: false });`, acrescentar:

```ts
    // Ponte de dados (item 25): o mod grava um arquivo por sessão em live/; a
    // observação da pasta acima não vê o que muda dentro dela.
    this.tryWatch(path.join(bridgeDir, 'live'), { recursive: false });
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/services/sessionNotifier.test.ts tests/core/sessionCore.test.ts tests/services/todosWatcher.test.ts && npm run typecheck`
Expected: PASS (todos) e `tsc` sem erros.

- [ ] **Step 7: Rodar a suíte e commitar**

Run: `npm test`
Expected: PASS (todos).

```bash
git add src/services/sessionNotifier.ts src/core/sessionCore.ts src/services/todosWatcher.ts tests/services/sessionNotifier.test.ts tests/core/sessionCore.test.ts tests/services/todosWatcher.test.ts
git commit -m "feat(bridge): fim do turno no aviso de ociosidade e core ligado a ponte (item 25)

Com o fim do turno do main gravado pela ponte depois da ultima mensagem,
o aviso de ociosidade sai sem esperar 45 s; um fim gravado por um processo
anterior nao conta. O core liga leitor e instalador, limpa live/ aos 30
dias e o watcher observa a pasta.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Ativar e desativar pelo VS Code e pelo sidecar

**Files:**
- Modify: `src/core/dispatcher.ts` (`CoreCommand`, `CoreEvent`, `init`, `switch`)
- Modify: `src/extension.ts` (ativação, `handleMessage`, comandos)
- Modify: `src/types.ts` (`WebviewMessage`, linhas 123-130)
- Modify: `src/i18n/messages.ts` (cinco idiomas)
- Modify: `package.json` (`contributes.commands`), `package.nls.json`, `package.nls.pt-br.json`, `package.nls.es.json`, `package.nls.zh-cn.json`, `package.nls.zh-tw.json`
- Test: `tests/core/dispatcher.test.ts`

**Interfaces:**
- Consumes: `SessionCore.installBridgeMod/uninstallBridgeMod/refreshBridgeMod` (Task 6).
- Produces (usados pelas Tasks 8 e 9):
  - `CoreCommand` `{ cmd: 'installBridgeMod' }` e `{ cmd: 'uninstallBridgeMod' }`; `CoreEvent` `{ ev: 'bridgeModChanged'; installed: boolean; changed: boolean; path: string }`.
  - `WebviewMessage` `{ type: 'installBridgeMod' }` e `{ type: 'uninstallBridgeMod' }`.
  - Chaves `bridgeMod.confirmInstall`, `bridgeMod.confirmUninstall`, `bridgeMod.enable`, `bridgeMod.disable`, `bridgeMod.installed`, `bridgeMod.uninstalled`, `bridgeMod.failed` (textos abaixo; a Task 8 os copia verbatim).
  - Comandos `claudeTodos.installBridgeMod` e `claudeTodos.uninstallBridgeMod`.

- [ ] **Step 1: Escrever os testes do dispatcher**

Em `tests/core/dispatcher.test.ts`, no `fakeCore` (linhas 4-20), trocar:

```ts
    pruneBridge: vi.fn(), setPinnedSession: vi.fn(), dispose: vi.fn(),
```

por:

```ts
    pruneBridge: vi.fn(), setPinnedSession: vi.fn(), dispose: vi.fn(), refreshBridgeMod: vi.fn(),
```

e, dentro de `describe('createDispatcher', ...)`, ao fim do bloco, acrescentar:

```ts
  it('init refreshes the installed bridge mod (item 25)', () => {
    const core = fakeCore();
    run([{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }], core);
    expect(core.refreshBridgeMod).toHaveBeenCalledOnce();
  });

  it('installBridgeMod and uninstallBridgeMod answer with bridgeModChanged (item 25)', () => {
    const core = fakeCore({
      installBridgeMod: () => ({ changed: true, path: '/c/settings.json' }),
      uninstallBridgeMod: () => ({ changed: false, path: '/c/settings.json' }),
    });
    const base = [{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }];
    expect(run([...base, { cmd: 'installBridgeMod', id: 'b1' }], core).at(-1))
      .toEqual({ ev: 'bridgeModChanged', installed: true, changed: true, path: '/c/settings.json', id: 'b1' });
    expect(run([...base, { cmd: 'uninstallBridgeMod', id: 'b2' }], core).at(-1))
      .toEqual({ ev: 'bridgeModChanged', installed: false, changed: false, path: '/c/settings.json', id: 'b2' });
  });

  it('a settings.json error during the bridge install becomes an error event with the id (item 25)', () => {
    const core = fakeCore({ installBridgeMod: () => { throw new Error('settings.json is not valid JSON'); } });
    expect(run([{ cmd: 'init', claudeDir: '/c', cwds: ['/p'] }, { cmd: 'installBridgeMod', id: 'b3' }], core).at(-1))
      .toEqual({ ev: 'error', message: 'Error: settings.json is not valid JSON', id: 'b3' });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/core/dispatcher.test.ts`
Expected: FAIL nos três testes novos: `refreshBridgeMod` não é chamado, e os comandos caem em `unknown command: installBridgeMod` e `unknown command: uninstallBridgeMod`.

- [ ] **Step 3: Dispatcher**

Em `src/core/dispatcher.ts`, em `CoreCommand`, depois de `| { cmd: 'enableTaskTools' }`, acrescentar:

```ts
  | { cmd: 'installBridgeMod' }
  | { cmd: 'uninstallBridgeMod' }
```

em `CoreEvent`, depois de `| { ev: 'taskToolsEnabled'; changed: boolean; path: string }`, acrescentar:

```ts
  | { ev: 'bridgeModChanged'; installed: boolean; changed: boolean; path: string }
```

no ramo de `init`, depois de `core.pruneBridge(BRIDGE_MAX_AGE_MS);`, acrescentar:

```ts
      // Ponte de dados (item 25): o sidecar do JetBrains é o ponto de ativação
      // do lado JetBrains, como o activate() no VS Code.
      core.refreshBridgeMod();
```

e, no `switch`, depois do `case 'enableTaskTools'` (antes do `default`), acrescentar:

```ts
      case 'installBridgeMod':
      case 'uninstallBridgeMod': {
        const install = cmd.cmd === 'installBridgeMod';
        try {
          const r = install ? core.installBridgeMod() : core.uninstallBridgeMod();
          emit(withId({ ev: 'bridgeModChanged', installed: install, changed: r.changed, path: r.path }, cmd.id));
        } catch (err) {
          emit(withId({ ev: 'error', message: String(err) }, cmd.id));
        }
        break;
      }
```

- [ ] **Step 4: Mensagens da webview e textos**

Em `src/types.ts`, em `WebviewMessage`, depois de `| { type: 'enableTaskTools' }`, acrescentar:

```ts
  | { type: 'installBridgeMod' }
  | { type: 'uninstallBridgeMod' }
```

Em `src/i18n/messages.ts`, acrescentar ao fim de cada bloco de idioma (depois de `'taskTools.failed'`):

`en`:

```ts
    'bridgeMod.confirmInstall': 'Claude Todos will copy its Claude Code mod to ~/.claude/.vscode-todos-bridge/mod/ and add that folder to env.CLAUDE_CODE_PLUGIN_DIRS in {path}. Other settings are preserved. New Claude Code sessions then record the exact context window, the 5-hour and 7-day usage limits and when each agent ends. Mods are an early-access Claude Code feature.',
    'bridgeMod.confirmUninstall': 'Claude Todos will remove its folder from env.CLAUDE_CODE_PLUGIN_DIRS in {path} and delete the mod copy. New Claude Code sessions stop recording the exact data, and the panel goes back to its estimates.',
    'bridgeMod.enable': 'Enable',
    'bridgeMod.disable': 'Disable',
    'bridgeMod.installed': 'Exact data enabled. It shows up from the next Claude Code session; open sessions need a restart.',
    'bridgeMod.uninstalled': 'Exact data disabled. New Claude Code sessions no longer load the mod.',
    'bridgeMod.failed': 'Could not update {path}: {error}',
```

`pt-br`:

```ts
    'bridgeMod.confirmInstall': 'O Claude Todos vai copiar o mod dele para ~/.claude/.vscode-todos-bridge/mod/ e acrescentar essa pasta a env.CLAUDE_CODE_PLUGIN_DIRS em {path}. As outras configurações são preservadas. Sessões novas do Claude Code passam a gravar a janela de contexto exata, os limites de uso de 5h e 7 dias e o fim de cada agente. Mods são um recurso do Claude Code em early access.',
    'bridgeMod.confirmUninstall': 'O Claude Todos vai tirar a pasta dele de env.CLAUDE_CODE_PLUGIN_DIRS em {path} e apagar a cópia do mod. Sessões novas do Claude Code deixam de gravar os dados exatos, e o painel volta às estimativas.',
    'bridgeMod.enable': 'Ativar',
    'bridgeMod.disable': 'Desativar',
    'bridgeMod.installed': 'Dados exatos ativados. Eles aparecem a partir da próxima sessão do Claude Code; as abertas precisam ser reiniciadas.',
    'bridgeMod.uninstalled': 'Dados exatos desativados. Sessões novas do Claude Code não carregam mais o mod.',
    'bridgeMod.failed': 'Não foi possível atualizar {path}: {error}',
```

`es`:

```ts
    'bridgeMod.confirmInstall': 'Claude Todos copiará su mod de Claude Code a ~/.claude/.vscode-todos-bridge/mod/ y agregará esa carpeta a env.CLAUDE_CODE_PLUGIN_DIRS en {path}. Los demás ajustes se conservan. Las sesiones nuevas de Claude Code registrarán la ventana de contexto exacta, los límites de uso de 5 h y 7 días y el fin de cada agente. Los mods son una función de Claude Code en acceso anticipado.',
    'bridgeMod.confirmUninstall': 'Claude Todos quitará su carpeta de env.CLAUDE_CODE_PLUGIN_DIRS en {path} y borrará la copia del mod. Las sesiones nuevas de Claude Code dejarán de registrar los datos exactos y el panel volverá a sus estimaciones.',
    'bridgeMod.enable': 'Activar',
    'bridgeMod.disable': 'Desactivar',
    'bridgeMod.installed': 'Datos exactos activados. Aparecen desde la próxima sesión de Claude Code; las abiertas necesitan reiniciarse.',
    'bridgeMod.uninstalled': 'Datos exactos desactivados. Las sesiones nuevas de Claude Code ya no cargan el mod.',
    'bridgeMod.failed': 'No se pudo actualizar {path}: {error}',
```

`zh-cn`:

```ts
    'bridgeMod.confirmInstall': 'Claude Todos 将把它的 Claude Code mod 复制到 ~/.claude/.vscode-todos-bridge/mod/，并把该文件夹加入 {path} 中的 env.CLAUDE_CODE_PLUGIN_DIRS。其他设置会被保留。之后新的 Claude Code 会话会记录准确的上下文窗口、5 小时和 7 天的用量限制以及每个智能体结束的时间。Mod 是 Claude Code 的抢先体验功能。',
    'bridgeMod.confirmUninstall': 'Claude Todos 将从 {path} 的 env.CLAUDE_CODE_PLUGIN_DIRS 中移除它的文件夹并删除 mod 副本。新的 Claude Code 会话将不再记录准确数据，面板会恢复为估算值。',
    'bridgeMod.enable': '开启',
    'bridgeMod.disable': '关闭',
    'bridgeMod.installed': '已开启准确数据。从下一个 Claude Code 会话开始生效；已打开的会话需要重启。',
    'bridgeMod.uninstalled': '已关闭准确数据。新的 Claude Code 会话不再加载该 mod。',
    'bridgeMod.failed': '无法更新 {path}：{error}',
```

`zh-tw`:

```ts
    'bridgeMod.confirmInstall': 'Claude Todos 會把它的 Claude Code mod 複製到 ~/.claude/.vscode-todos-bridge/mod/，並把該資料夾加入 {path} 中的 env.CLAUDE_CODE_PLUGIN_DIRS。其他設定會被保留。之後新的 Claude Code 工作階段會記錄精確的上下文視窗、5 小時和 7 天的用量限制，以及每個智慧體結束的時間。Mod 是 Claude Code 的搶先體驗功能。',
    'bridgeMod.confirmUninstall': 'Claude Todos 會從 {path} 的 env.CLAUDE_CODE_PLUGIN_DIRS 中移除它的資料夾並刪除 mod 副本。新的 Claude Code 工作階段將不再記錄精確資料，面板會恢復為估算值。',
    'bridgeMod.enable': '開啟',
    'bridgeMod.disable': '關閉',
    'bridgeMod.installed': '已開啟精確資料。從下一個 Claude Code 工作階段開始生效；已開啟的工作階段需要重新啟動。',
    'bridgeMod.uninstalled': '已關閉精確資料。新的 Claude Code 工作階段不再載入該 mod。',
    'bridgeMod.failed': '無法更新 {path}：{error}',
```

- [ ] **Step 5: Host do VS Code**

Em `src/extension.ts`, depois de `core.pruneBridge(BRIDGE_MAX_AGE_MS);` (linha 65), acrescentar:

```ts
  // Ponte de dados (item 25): regrava os arquivos do mod instalado que mudaram
  // nesta versão da extensão. Nunca lança.
  core.refreshBridgeMod();
```

depois da função `enableTaskTools` (antes de `const handleMessage`), acrescentar:

```ts
  // Ponte de dados (item 25): ativa ou desativa o mod do Claude Code que grava a
  // janela exata, os limites de uso e o fim de cada agente. Sempre atrás de
  // confirmação modal; usado pelo rodapé do bloco de uso e pela paleta.
  const setBridgeMod = async (enable: boolean): Promise<void> => {
    const t = createT(resolveLocale());
    const action = enable ? t('bridgeMod.enable') : t('bridgeMod.disable');
    const choice = await vscode.window.showInformationMessage(
      t(enable ? 'bridgeMod.confirmInstall' : 'bridgeMod.confirmUninstall', { path: settingsPath }),
      { modal: true },
      action,
    );
    if (choice !== action) return;
    try {
      if (enable) core.installBridgeMod(); else core.uninstallBridgeMod();
      vscode.window.showInformationMessage(t(enable ? 'bridgeMod.installed' : 'bridgeMod.uninstalled'));
    } catch (err) {
      vscode.window.showErrorMessage(t('bridgeMod.failed', { path: settingsPath, error: String(err) }));
    }
    viewProvider.pushSnapshot();
    panelProvider.pushSnapshot();
  };
```

em `handleMessage`, depois do ramo `enableTaskTools`:

```ts
    } else if (msg.type === 'enableTaskTools') {
      void enableTaskTools();
```

acrescentar:

```ts
    } else if (msg.type === 'installBridgeMod') {
      void setBridgeMod(true);
    } else if (msg.type === 'uninstallBridgeMod') {
      void setBridgeMod(false);
```

e, no `registerCommand` em lote, depois do comando `claudeTodos.enableTaskTools`, acrescentar:

```ts
    vscode.commands.registerCommand('claudeTodos.installBridgeMod', () => {
      void setBridgeMod(true);
    }),
    vscode.commands.registerCommand('claudeTodos.uninstallBridgeMod', () => {
      void setBridgeMod(false);
    }),
```

- [ ] **Step 6: Comandos no manifesto**

Em `package.json`, em `contributes.commands`, depois do objeto de `claudeTodos.enableTaskTools`, acrescentar:

```json
      {
        "command": "claudeTodos.installBridgeMod",
        "title": "%command.installBridgeMod.title%"
      },
      {
        "command": "claudeTodos.uninstallBridgeMod",
        "title": "%command.uninstallBridgeMod.title%"
      }
```

Nos cinco `package.nls*.json`, depois de `"command.enableTaskTools.title"`, acrescentar:

- `package.nls.json`, `package.nls.zh-cn.json` e `package.nls.zh-tw.json` (em inglês, como os títulos atuais desses dois idiomas):

```json
  "command.installBridgeMod.title": "Claude Todos: Enable exact data from Claude Code (experimental)",
  "command.uninstallBridgeMod.title": "Claude Todos: Disable exact data from Claude Code",
```

- `package.nls.pt-br.json`:

```json
  "command.installBridgeMod.title": "Claude Todos: Ativar dados exatos do Claude Code (experimental)",
  "command.uninstallBridgeMod.title": "Claude Todos: Desativar dados exatos do Claude Code",
```

- `package.nls.es.json`:

```json
  "command.installBridgeMod.title": "Claude Todos: Activar datos exactos de Claude Code (experimental)",
  "command.uninstallBridgeMod.title": "Claude Todos: Desactivar datos exactos de Claude Code",
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run tests/core/dispatcher.test.ts tests/i18n && npm run typecheck`
Expected: PASS (dispatcher e paridade de i18n e `package.nls`) e `tsc` sem erros.

- [ ] **Step 8: Rodar a suíte e commitar**

Run: `npm test && npm run build`
Expected: PASS e build sem erros.

```bash
git add src/core/dispatcher.ts src/extension.ts src/types.ts src/i18n/messages.ts package.json package.nls.json package.nls.pt-br.json package.nls.es.json package.nls.zh-cn.json package.nls.zh-tw.json tests/core/dispatcher.test.ts
git commit -m "feat(bridge): ativar e desativar a ponte pelo VS Code e pelo sidecar (item 25)

Confirmacao modal, comandos da paleta e mensagens da webview no VS Code;
comandos installBridgeMod e uninstallBridgeMod no sidecar. A ativacao e
o init do sidecar regravam os arquivos do mod que mudaram.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Ativar e desativar no JetBrains

**Files:**
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/MessageRouter.kt` (`RouterHost.confirm`, `onWebviewMessage`, função nova)
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ClaudeTodosToolWindowFactory.kt:98-110` (`confirm`)
- Modify: `jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotifyMessages.kt` (`KEYS` e os cinco idiomas)
- Test: `jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/MessageRouterTest.kt`

**Interfaces:**
- Consumes: mensagens da webview `installBridgeMod`/`uninstallBridgeMod` e o evento `bridgeModChanged` (Task 7); textos `bridgeMod.*` (Task 7, copiados verbatim).
- Produces: `RouterHost.confirm(messageKey: String, okKey: String = "taskTools.enable", onOk: () -> Unit)`.

- [ ] **Step 1: Escrever os testes**

Em `MessageRouterTest.kt`, no `FakeHost`, trocar:

```kotlin
        override fun confirm(messageKey: String, onOk: () -> Unit) { confirms += messageKey; if (autoConfirm) onOk() }
```

por:

```kotlin
        val okKeys = mutableListOf<String>()
        override fun confirm(messageKey: String, okKey: String, onOk: () -> Unit) {
            confirms += messageKey; okKeys += okKey; if (autoConfirm) onOk()
        }
```

e, ao fim da classe, acrescentar:

```kotlin
    @Test fun `installBridgeMod confirms with the enable label, calls the sidecar and toasts`() {
        router.onWebviewMessage("""{"type":"installBridgeMod"}""")
        assertEquals(listOf("bridgeMod.confirmInstall"), host.confirms)
        assertEquals(listOf("bridgeMod.enable"), host.okKeys)
        val cmd = parse(toSidecar.single())
        assertEquals("installBridgeMod", cmd["cmd"]!!.jsonPrimitive.content)
        val id = cmd["id"]!!.jsonPrimitive.content
        router.onSidecarEvent("""{"ev":"bridgeModChanged","installed":true,"changed":true,"path":"/c/settings.json","id":"$id"}""")
        assertEquals("bridgeMod.installed", host.infos.single().first)
        assertEquals("getSnapshot", parse(toSidecar.last())["cmd"]!!.jsonPrimitive.content)
    }

    @Test fun `uninstallBridgeMod confirms with the disable label and reports a sidecar error`() {
        router.onWebviewMessage("""{"type":"uninstallBridgeMod"}""")
        assertEquals(listOf("bridgeMod.confirmUninstall"), host.confirms)
        assertEquals(listOf("bridgeMod.disable"), host.okKeys)
        val id = parse(toSidecar.single())["id"]!!.jsonPrimitive.content
        router.onSidecarEvent("""{"ev":"error","message":"boom","id":"$id"}""")
        assertEquals("bridgeMod.failed", host.errors.single().first)
        assertEquals("boom", host.errors.single().second["error"])
    }

    @Test fun `bridge mod declined sends nothing to the sidecar`() {
        host.autoConfirm = false
        router.onWebviewMessage("""{"type":"installBridgeMod"}""")
        assertTrue(toSidecar.isEmpty())
    }

    @Test fun `enableTaskTools keeps its own confirm label`() {
        router.onWebviewMessage("""{"type":"enableTaskTools"}""")
        assertEquals(listOf("taskTools.enable"), host.okKeys)
    }
```

- [ ] **Step 2: Rodar e ver falhar**

Run (com `npm run build` feito, a partir de `jetbrains/`): `cmd //c "<raiz do repo>\jetbrains\gradlew.bat" test --console=plain`
Expected: FAIL de compilação do teste: `'confirm' overrides nothing` (o `RouterHost.confirm` ainda não tem `okKey`).

- [ ] **Step 3: `RouterHost.confirm` com rótulo**

Em `MessageRouter.kt`, trocar:

```kotlin
    /** Diálogo modal Sim/Não; chama [onOk] só se o usuário confirmar. O host preenche `{path}`. */
    fun confirm(messageKey: String, onOk: () -> Unit)
```

por:

```kotlin
    /**
     * Diálogo modal Sim/Não; chama [onOk] só se o usuário confirmar. O host preenche `{path}`.
     * [okKey] rotula o botão de confirmar (Ativar, Desativar…).
     */
    fun confirm(messageKey: String, okKey: String = "taskTools.enable", onOk: () -> Unit)
```

em `onWebviewMessage`, depois do ramo `"enableTaskTools" -> host.confirm(...) { ... }`, acrescentar:

```kotlin
            "installBridgeMod" -> bridgeMod(install = true)
            "uninstallBridgeMod" -> bridgeMod(install = false)
```

e, depois de `installHook(...)`, acrescentar:

```kotlin
    // Ponte de dados (item 25): mesmo molde do enableTaskTools — confirma, chama o
    // sidecar e avisa o resultado; o snapshot seguinte já traz o estado novo.
    private fun bridgeMod(install: Boolean) {
        val confirmKey = if (install) "bridgeMod.confirmInstall" else "bridgeMod.confirmUninstall"
        val okKey = if (install) "bridgeMod.enable" else "bridgeMod.disable"
        host.confirm(confirmKey, okKey) {
            val id = "bm-${nextId.getAndIncrement()}"
            pending[id] = { ev ->
                if (ev["ev"]?.jsonPrimitive?.content == "bridgeModChanged") {
                    host.info(if (install) "bridgeMod.installed" else "bridgeMod.uninstalled")
                } else {
                    host.error("bridgeMod.failed", mapOf(
                        "error" to (ev["message"]?.jsonPrimitive?.contentOrNull ?: "unknown error"),
                    ))
                }
                sendToSidecar("""{"cmd":"getSnapshot"}""")
            }
            sendToSidecar(buildJsonObject {
                put("cmd", if (install) "installBridgeMod" else "uninstallBridgeMod"); put("id", id)
            }.toString())
        }
    }
```

Em `ClaudeTodosToolWindowFactory.kt`, trocar o `confirm` (linhas 98-110):

```kotlin
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
```

por:

```kotlin
            override fun confirm(messageKey: String, okKey: String, onOk: () -> Unit) {
                SwingUtilities.invokeLater {
                    val answer = com.intellij.openapi.ui.Messages.showYesNoDialog(
                        project,
                        NotifyMessages.get(locale, messageKey, "path" to settingsPath),
                        "Claude Todos",
                        NotifyMessages.get(locale, okKey),
                        NotifyMessages.get(locale, "taskTools.cancel"),
                        com.intellij.openapi.ui.Messages.getQuestionIcon(),
                    )
                    if (answer == com.intellij.openapi.ui.Messages.YES) onOk()
                }
            }
```

- [ ] **Step 4: Textos nativos**

Em `NotifyMessages.kt`, em `KEYS`, depois da linha `"taskTools.enabled", "taskTools.alreadyEnabled", "taskTools.failed",`, acrescentar:

```kotlin
        "bridgeMod.confirmInstall", "bridgeMod.confirmUninstall", "bridgeMod.enable", "bridgeMod.disable",
        "bridgeMod.installed", "bridgeMod.uninstalled", "bridgeMod.failed",
```

e, em cada idioma do `catalog`, depois da entrada `"taskTools.failed" to …`, acrescentar as sete entradas com os mesmos textos da Task 7, Step 4 (nenhum deles tem aspas duplas internas nem `$`).

Em `"en"`:

```kotlin
            "bridgeMod.confirmInstall" to "Claude Todos will copy its Claude Code mod to ~/.claude/.vscode-todos-bridge/mod/ and add that folder to env.CLAUDE_CODE_PLUGIN_DIRS in {path}. Other settings are preserved. New Claude Code sessions then record the exact context window, the 5-hour and 7-day usage limits and when each agent ends. Mods are an early-access Claude Code feature.",
            "bridgeMod.confirmUninstall" to "Claude Todos will remove its folder from env.CLAUDE_CODE_PLUGIN_DIRS in {path} and delete the mod copy. New Claude Code sessions stop recording the exact data, and the panel goes back to its estimates.",
            "bridgeMod.enable" to "Enable",
            "bridgeMod.disable" to "Disable",
            "bridgeMod.installed" to "Exact data enabled. It shows up from the next Claude Code session; open sessions need a restart.",
            "bridgeMod.uninstalled" to "Exact data disabled. New Claude Code sessions no longer load the mod.",
            "bridgeMod.failed" to "Could not update {path}: {error}",
```

Em `"pt-br"`:

```kotlin
            "bridgeMod.confirmInstall" to "O Claude Todos vai copiar o mod dele para ~/.claude/.vscode-todos-bridge/mod/ e acrescentar essa pasta a env.CLAUDE_CODE_PLUGIN_DIRS em {path}. As outras configurações são preservadas. Sessões novas do Claude Code passam a gravar a janela de contexto exata, os limites de uso de 5h e 7 dias e o fim de cada agente. Mods são um recurso do Claude Code em early access.",
            "bridgeMod.confirmUninstall" to "O Claude Todos vai tirar a pasta dele de env.CLAUDE_CODE_PLUGIN_DIRS em {path} e apagar a cópia do mod. Sessões novas do Claude Code deixam de gravar os dados exatos, e o painel volta às estimativas.",
            "bridgeMod.enable" to "Ativar",
            "bridgeMod.disable" to "Desativar",
            "bridgeMod.installed" to "Dados exatos ativados. Eles aparecem a partir da próxima sessão do Claude Code; as abertas precisam ser reiniciadas.",
            "bridgeMod.uninstalled" to "Dados exatos desativados. Sessões novas do Claude Code não carregam mais o mod.",
            "bridgeMod.failed" to "Não foi possível atualizar {path}: {error}",
```

Em `"es"`:

```kotlin
            "bridgeMod.confirmInstall" to "Claude Todos copiará su mod de Claude Code a ~/.claude/.vscode-todos-bridge/mod/ y agregará esa carpeta a env.CLAUDE_CODE_PLUGIN_DIRS en {path}. Los demás ajustes se conservan. Las sesiones nuevas de Claude Code registrarán la ventana de contexto exacta, los límites de uso de 5 h y 7 días y el fin de cada agente. Los mods son una función de Claude Code en acceso anticipado.",
            "bridgeMod.confirmUninstall" to "Claude Todos quitará su carpeta de env.CLAUDE_CODE_PLUGIN_DIRS en {path} y borrará la copia del mod. Las sesiones nuevas de Claude Code dejarán de registrar los datos exactos y el panel volverá a sus estimaciones.",
            "bridgeMod.enable" to "Activar",
            "bridgeMod.disable" to "Desactivar",
            "bridgeMod.installed" to "Datos exactos activados. Aparecen desde la próxima sesión de Claude Code; las abiertas necesitan reiniciarse.",
            "bridgeMod.uninstalled" to "Datos exactos desactivados. Las sesiones nuevas de Claude Code ya no cargan el mod.",
            "bridgeMod.failed" to "No se pudo actualizar {path}: {error}",
```

Em `"zh-cn"`:

```kotlin
            "bridgeMod.confirmInstall" to "Claude Todos 将把它的 Claude Code mod 复制到 ~/.claude/.vscode-todos-bridge/mod/，并把该文件夹加入 {path} 中的 env.CLAUDE_CODE_PLUGIN_DIRS。其他设置会被保留。之后新的 Claude Code 会话会记录准确的上下文窗口、5 小时和 7 天的用量限制以及每个智能体结束的时间。Mod 是 Claude Code 的抢先体验功能。",
            "bridgeMod.confirmUninstall" to "Claude Todos 将从 {path} 的 env.CLAUDE_CODE_PLUGIN_DIRS 中移除它的文件夹并删除 mod 副本。新的 Claude Code 会话将不再记录准确数据，面板会恢复为估算值。",
            "bridgeMod.enable" to "开启",
            "bridgeMod.disable" to "关闭",
            "bridgeMod.installed" to "已开启准确数据。从下一个 Claude Code 会话开始生效；已打开的会话需要重启。",
            "bridgeMod.uninstalled" to "已关闭准确数据。新的 Claude Code 会话不再加载该 mod。",
            "bridgeMod.failed" to "无法更新 {path}：{error}",
```

Em `"zh-tw"`:

```kotlin
            "bridgeMod.confirmInstall" to "Claude Todos 會把它的 Claude Code mod 複製到 ~/.claude/.vscode-todos-bridge/mod/，並把該資料夾加入 {path} 中的 env.CLAUDE_CODE_PLUGIN_DIRS。其他設定會被保留。之後新的 Claude Code 工作階段會記錄精確的上下文視窗、5 小時和 7 天的用量限制，以及每個智慧體結束的時間。Mod 是 Claude Code 的搶先體驗功能。",
            "bridgeMod.confirmUninstall" to "Claude Todos 會從 {path} 的 env.CLAUDE_CODE_PLUGIN_DIRS 中移除它的資料夾並刪除 mod 副本。新的 Claude Code 工作階段將不再記錄精確資料，面板會恢復為估算值。",
            "bridgeMod.enable" to "開啟",
            "bridgeMod.disable" to "關閉",
            "bridgeMod.installed" to "已開啟精確資料。從下一個 Claude Code 工作階段開始生效；已開啟的工作階段需要重新啟動。",
            "bridgeMod.uninstalled" to "已關閉精確資料。新的 Claude Code 工作階段不再載入該 mod。",
            "bridgeMod.failed" to "無法更新 {path}：{error}",
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cmd //c "<raiz do repo>\jetbrains\gradlew.bat" test --console=plain`
Expected: `BUILD SUCCESSFUL`, com `MessageRouterTest` (os 4 testes novos e os antigos) e `NotifyMessagesTest` (paridade das chaves nos cinco idiomas) passando.

- [ ] **Step 6: Commit**

```bash
git add jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/MessageRouter.kt jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/ClaudeTodosToolWindowFactory.kt jetbrains/src/main/kotlin/com/carlosdealmeida/claudetodos/NotifyMessages.kt jetbrains/src/test/kotlin/com/carlosdealmeida/claudetodos/MessageRouterTest.kt
git commit -m "feat(jetbrains): ativar e desativar a ponte com dialogo nativo (item 25)

O confirm do RouterHost ganha o rotulo do botao, e o roteador manda
installBridgeMod e uninstallBridgeMod ao sidecar com os textos do
catalogo nos cinco idiomas.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Bloco de limites, janela exata e rodapé no painel

**Files:**
- Modify: `src/webview/format.ts` (imports e funções novas)
- Modify: `src/webview/lib/UsageTable.svelte`
- Modify: `src/webview/App.svelte:44`
- Modify: `src/webview/stores.svelte.ts` (métodos novos)
- Modify: `src/i18n/messages.ts` (cinco idiomas)
- Test: `tests/webview/format.test.ts`

**Interfaces:**
- Consumes: `SessionUsage.rateLimits`, `ContextUsage.source`, `BridgeStatus`, `SessionSnapshot.bridge` (Task 5); mensagens `installBridgeMod`/`uninstallBridgeMod` (Task 7).
- Produces: `limitLabelKey(kind: string): MessageKey | null`, `formatResetTime(iso: string, now: number, locale: Locale, timeZone?: string): string`, `bridgeTextKey(status: BridgeStatus): MessageKey`; `todosStore.installBridgeMod()`, `todosStore.uninstallBridgeMod()`.

- [ ] **Step 1: Escrever os testes**

Em `tests/webview/format.test.ts`, trocar a linha 2:

```ts
import { formatCompact, shortModel, modelBadge, contextLevel, cacheLevel, formatDuration, summarizeTiming, completedTaskDurations, agentTotalTokens, agentTypeTone, listStaleness, pendingSummary } from '../../src/webview/format';
```

por:

```ts
import { formatCompact, shortModel, modelBadge, contextLevel, cacheLevel, formatDuration, summarizeTiming, completedTaskDurations, agentTotalTokens, agentTypeTone, listStaleness, pendingSummary, limitLabelKey, formatResetTime, bridgeTextKey } from '../../src/webview/format';
```

e acrescentar ao fim do arquivo:

```ts
describe('limitLabelKey', () => {
  it('maps the known kinds and leaves the others raw', () => {
    expect(limitLabelKey('five_hour')).toBe('usage.limit.fiveHour');
    expect(limitLabelKey('seven_day')).toBe('usage.limit.sevenDay');
    expect(limitLabelKey('spend_limit')).toBe('usage.limit.spend');
    expect(limitLabelKey('seven_day_opus')).toBeNull();
  });
});

describe('formatResetTime', () => {
  const NOW = Date.parse('2026-10-05T14:05:00Z');
  it('shows only the time on the same day', () => {
    expect(formatResetTime('2026-10-05T20:40:00.000Z', NOW, 'pt-br', 'UTC')).toBe('20:40');
  });
  it('puts the date first on another day, in the panel language', () => {
    expect(formatResetTime('2026-10-12T12:00:00.000Z', NOW, 'pt-br', 'UTC')).toBe('12/10 12:00');
    expect(formatResetTime('2026-10-12T12:00:00.000Z', NOW, 'en', 'UTC')).toBe('10/12 12:00');
  });
  it('returns an empty string for an invalid date', () => {
    expect(formatResetTime('nope', NOW, 'en', 'UTC')).toBe('');
  });
});

describe('bridgeTextKey', () => {
  it('has a text for every state', () => {
    expect(bridgeTextKey('off')).toBe('usage.bridge.off');
    expect(bridgeTextKey('active')).toBe('usage.bridge.active');
    expect(bridgeTextKey('next-session')).toBe('usage.bridge.nextSession');
    expect(bridgeTextKey('silent')).toBe('usage.bridge.silent');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/webview/format.test.ts`
Expected: FAIL nos três `describe` novos (`limitLabelKey is not a function` e equivalentes); os testes antigos passam.

- [ ] **Step 3: Textos do painel**

Em `src/i18n/messages.ts`, em cada idioma, depois de `'usage.total'`, acrescentar:

`en`:

```ts
    'usage.limits': 'Usage limits',
    'usage.limitsReadAt': 'read at {time}',
    'usage.limitResets': 'resets {time}',
    'usage.limit.fiveHour': '5h',
    'usage.limit.sevenDay': '7 days',
    'usage.limit.spend': 'spend',
    'usage.ctxExactTitle': 'Window reported by Claude Code',
    'usage.bridge.off': 'Exact data (experimental)',
    'usage.bridge.active': 'Exact data from Claude Code',
    'usage.bridge.nextSession': 'Exact data from the next session',
    'usage.bridge.silent': "The bridge didn't respond in this session (Mods may be off)",
    'usage.bridge.enable': 'Enable',
    'usage.bridge.disable': 'Disable',
```

`pt-br`:

```ts
    'usage.limits': 'Limites de uso',
    'usage.limitsReadAt': 'lido às {time}',
    'usage.limitResets': 'reinicia {time}',
    'usage.limit.fiveHour': '5h',
    'usage.limit.sevenDay': '7 dias',
    'usage.limit.spend': 'gasto',
    'usage.ctxExactTitle': 'Janela informada pelo Claude Code',
    'usage.bridge.off': 'Dados exatos (experimental)',
    'usage.bridge.active': 'Dados exatos do Claude Code',
    'usage.bridge.nextSession': 'Dados exatos a partir da próxima sessão',
    'usage.bridge.silent': 'A ponte não respondeu nesta sessão (os Mods podem estar desligados)',
    'usage.bridge.enable': 'Ativar',
    'usage.bridge.disable': 'Desativar',
```

`es`:

```ts
    'usage.limits': 'Límites de uso',
    'usage.limitsReadAt': 'leído a las {time}',
    'usage.limitResets': 'se reinicia {time}',
    'usage.limit.fiveHour': '5 h',
    'usage.limit.sevenDay': '7 días',
    'usage.limit.spend': 'gasto',
    'usage.ctxExactTitle': 'Ventana informada por Claude Code',
    'usage.bridge.off': 'Datos exactos (experimental)',
    'usage.bridge.active': 'Datos exactos de Claude Code',
    'usage.bridge.nextSession': 'Datos exactos desde la próxima sesión',
    'usage.bridge.silent': 'El puente no respondió en esta sesión (los Mods pueden estar desactivados)',
    'usage.bridge.enable': 'Activar',
    'usage.bridge.disable': 'Desactivar',
```

`zh-cn`:

```ts
    'usage.limits': '用量限制',
    'usage.limitsReadAt': '读取于 {time}',
    'usage.limitResets': '{time} 重置',
    'usage.limit.fiveHour': '5 小时',
    'usage.limit.sevenDay': '7 天',
    'usage.limit.spend': '支出',
    'usage.ctxExactTitle': '由 Claude Code 报告的窗口',
    'usage.bridge.off': '准确数据（实验性）',
    'usage.bridge.active': '来自 Claude Code 的准确数据',
    'usage.bridge.nextSession': '从下一个会话开始提供准确数据',
    'usage.bridge.silent': '桥接在此会话中没有响应（Mod 可能已关闭）',
    'usage.bridge.enable': '开启',
    'usage.bridge.disable': '关闭',
```

`zh-tw`:

```ts
    'usage.limits': '用量限制',
    'usage.limitsReadAt': '讀取於 {time}',
    'usage.limitResets': '{time} 重設',
    'usage.limit.fiveHour': '5 小時',
    'usage.limit.sevenDay': '7 天',
    'usage.limit.spend': '支出',
    'usage.ctxExactTitle': '由 Claude Code 回報的視窗',
    'usage.bridge.off': '精確資料（實驗性）',
    'usage.bridge.active': '來自 Claude Code 的精確資料',
    'usage.bridge.nextSession': '從下一個工作階段開始提供精確資料',
    'usage.bridge.silent': '橋接在此工作階段中沒有回應（Mod 可能已關閉）',
    'usage.bridge.enable': '開啟',
    'usage.bridge.disable': '關閉',
```

- [ ] **Step 4: Funções puras do painel**

Em `src/webview/format.ts`, trocar os imports (linhas 1-2):

```ts
import type { Todo, AgentUsage, PendingQuestion } from '../types';
import type { MessageKey } from '../i18n/messages';
```

por:

```ts
import type { Todo, AgentUsage, PendingQuestion, BridgeStatus } from '../types';
import type { MessageKey } from '../i18n/messages';
import type { Locale } from '../i18n/locale';
```

e acrescentar ao fim do arquivo:

```ts
// Ponte de dados (item 25): rótulo de cada limite de uso por kind. null para um
// kind que o painel não conhece; aí ele aparece como o engine o escreve.
export function limitLabelKey(kind: string): MessageKey | null {
  if (kind === 'five_hour') return 'usage.limit.fiveHour';
  if (kind === 'seven_day') return 'usage.limit.sevenDay';
  if (kind === 'spend_limit') return 'usage.limit.spend';
  return null;
}

const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US', 'pt-br': 'pt-BR', es: 'es', 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW',
};

// Hora de um instante ISO no idioma do painel: só "HH:MM" quando cai no mesmo
// dia de `now`; com a data antes nos outros dias. String vazia para um ISO
// inválido. `timeZone` existe para os testes; o painel usa o fuso local.
export function formatResetTime(iso: string, now: number, locale: Locale, timeZone?: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const tag = INTL_LOCALE[locale] ?? 'en-US';
  const zone = timeZone !== undefined ? { timeZone } : {};
  const day = new Intl.DateTimeFormat(tag, { ...zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat(tag, { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  if (day.format(at) === day.format(now)) return time;
  return `${new Intl.DateTimeFormat(tag, { ...zone, day: '2-digit', month: '2-digit' }).format(at)} ${time}`;
}

// Texto do rodapé da ponte para cada estado.
export function bridgeTextKey(status: BridgeStatus): MessageKey {
  switch (status) {
    case 'off': return 'usage.bridge.off';
    case 'active': return 'usage.bridge.active';
    case 'next-session': return 'usage.bridge.nextSession';
    case 'silent': return 'usage.bridge.silent';
  }
}
```

- [ ] **Step 5: Rodar os testes de formatação**

Run: `npx vitest run tests/webview/format.test.ts tests/i18n`
Expected: PASS (todos).

- [ ] **Step 6: Store, App e tabela de uso**

Em `src/webview/stores.svelte.ts`, depois do método `enableTaskTools()`, acrescentar:

```ts
  // Ponte de dados (item 25): o rodapé do bloco de uso. O host confirma e grava;
  // o snapshot seguinte já traz o estado novo.
  installBridgeMod(): void {
    this.post({ type: 'installBridgeMod' });
  }

  uninstallBridgeMod(): void {
    this.post({ type: 'uninstallBridgeMod' });
  }
```

Em `src/webview/App.svelte`, trocar a linha 44:

```svelte
      <UsageTable usage={snapshot.usage} />
```

por:

```svelte
      <UsageTable usage={snapshot.usage} bridge={snapshot.bridge} />
```

Em `src/webview/lib/UsageTable.svelte`, trocar as linhas 2-6:

```svelte
  import type { SessionUsage, ModelUsage } from '../../types';
  import { formatCompact, shortModel, contextLevel, cacheLevel } from '../format';
  import { todosStore } from '../stores.svelte';

  let { usage }: { usage: SessionUsage } = $props();
```

por:

```svelte
  import type { SessionUsage, ModelUsage, BridgeStatus } from '../../types';
  import { formatCompact, shortModel, contextLevel, cacheLevel, limitLabelKey, formatResetTime, bridgeTextKey } from '../format';
  import { todosStore } from '../stores.svelte';

  let { usage, bridge }: { usage: SessionUsage; bridge?: BridgeStatus } = $props();
  // Ponte de dados (item 25): limites de uso da conta, quando a ponte os tem.
  let limits = $derived(usage.rateLimits);
```

trocar a linha 43:

```svelte
        <span class="ctx-count">{formatCompact(ctx.tokens)}/{formatCompact(ctx.limit)}</span>
```

por:

```svelte
        <span class="ctx-count" title={ctx.source === 'mod' ? todosStore.t('usage.ctxExactTitle') : undefined}>{formatCompact(ctx.tokens)}/{formatCompact(ctx.limit)}</span>
```

depois do `{/if}` que fecha o bloco `{#if ctx}` da barra de contexto (linha 45), acrescentar:

```svelte
    {#if limits}
      <div class="limits">
        <div class="limits-head">
          <span class="limits-label">{todosStore.t('usage.limits')}</span>
          <span class="limits-read">{todosStore.t('usage.limitsReadAt', { time: formatResetTime(new Date(limits.readAt).toISOString(), Date.now(), todosStore.locale) })}</span>
        </div>
        {#each limits.limits as limit (limit.kind)}
          {@const key = limitLabelKey(limit.kind)}
          {@const level = contextLevel(limit.percentUsed / 100)}
          <div class="limit-row">
            <span class="limit-name">{key ? todosStore.t(key) : limit.kind}</span>
            <div class="ctx-bar" aria-hidden="true"><div class="ctx-fill {level}" style="width: {Math.min(100, Math.max(0, Math.round(limit.percentUsed)))}%"></div></div>
            <span class="limit-pct">{Math.round(limit.percentUsed)}%</span>
            <span class="limit-reset">{todosStore.t('usage.limitResets', { time: formatResetTime(limit.resetsAt, Date.now(), todosStore.locale) })}</span>
          </div>
        {/each}
      </div>
    {/if}
```

depois do `</table>` (linha 106, antes de `</section>`), acrescentar:

```svelte
    {#if bridge}
      <div class="bridge-foot">
        <span>{todosStore.t(bridgeTextKey(bridge))}</span>
        <button class="bridge-action" onclick={() => (bridge === 'off' ? todosStore.installBridgeMod() : todosStore.uninstallBridgeMod())}>
          {todosStore.t(bridge === 'off' ? 'usage.bridge.enable' : 'usage.bridge.disable')}
        </button>
      </div>
    {/if}
```

e, no `<style>`, antes do `</style>`, acrescentar:

```css
  .limits { margin-bottom: 0.4rem; }
  .limits-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.2rem;
  }
  .limits-label { font-size: 0.9em; }
  .limits-read, .limit-reset {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
  .limit-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.2rem;
  }
  .limit-name { font-size: 0.85em; white-space: nowrap; }
  .limit-pct { font-size: 0.8em; font-weight: 600; }
  .bridge-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    margin-top: 0.35rem;
    font-size: 0.75em;
    color: var(--vscode-descriptionForeground);
  }
  .bridge-action {
    background: transparent;
    border: none;
    color: var(--vscode-textLink-foreground);
    font: inherit;
    padding: 0;
    cursor: pointer;
  }
  .bridge-action:hover { text-decoration: underline; }
```

- [ ] **Step 7: Verificar tipos, suíte e build**

Run: `npm run check:svelte && npm run typecheck && npm test && npm run build`
Expected: `svelte-check` com 0 erros, `tsc` sem erros, suíte toda verde e build sem erros.

- [ ] **Step 8: Conferir a UI**

Use a skill `preview-webview` para renderizar o `UsageTable` real com uma fixture de snapshot:
- `usage.context = { tokens: 150000, limit: 1000000, source: 'mod' }`;
- `usage.rateLimits = { readAt: <agora - 2 min>, limits: [{ kind: 'five_hour', percentUsed: 32, resetsAt: <hoje 17:40> }, { kind: 'seven_day', percentUsed: 9, resetsAt: <+7 dias> }] }`;
- `bridge: 'active'`.

Depois repita com `bridge: 'off'` e sem `rateLimits`.

Expected:
- com limites, o bloco "LIMITES DE USO" aparece abaixo da barra de contexto, com "lido às HH:MM" à direita;
- cada linha mostra rótulo, barra verde, porcentagem e "reinicia …";
- o rodapé mostra "Dados exatos do Claude Code · Desativar", ou "Dados exatos (experimental) · Ativar" sem a ponte;
- o tooltip da contagem diz "Janela informada pelo Claude Code".

Se a skill não estiver disponível no ambiente da execução, registre `Ruling: conferência visual adiada para a Task 10 (E2E) — custo: um ajuste de CSS depois`.

- [ ] **Step 9: Commit**

```bash
git add src/webview/format.ts src/webview/lib/UsageTable.svelte src/webview/App.svelte src/webview/stores.svelte.ts src/i18n/messages.ts tests/webview/format.test.ts
git commit -m "feat(bridge): limites de uso e rodape da ponte no painel (item 25)

O bloco de uso ganha os limites de 5h e 7 dias com o horario de reset,
o tooltip da janela informada pelo Claude Code e o rodape que ativa e
desativa a ponte, nos cinco idiomas.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Documentação e verificação de ponta a ponta

**Files:**
- Modify: `README.md`, `README.en.md`, `README.es.md`, `README.zh-cn.md`, `README.zh-tw.md` (tabela de privacidade, frase sobre apagar, limitações)
- Modify: `CHANGELOG.md` (`[Unreleased]`)
- Modify: `docs/ROADMAP.md` (item 2, linha 157; item 25, linha 864)

**Interfaces:**
- Consumes: tudo o que as Tasks 1-9 entregaram.
- Produces: a documentação da entrega e o registro do teste manual.

- [ ] **Step 1: READMEs**

Em cada README, na tabela de "Privacidade e fluxo de dados" (e equivalentes):
- substituir a linha de `~/.claude/settings.json`;
- acrescentar duas linhas logo depois da linha de `~/.claude/.vscode-todos-bridge/sessions.json`;
- substituir a frase que diz que a extensão nunca apaga nada;
- acrescentar um item ao fim de "Limitações conhecidas" (e equivalentes).

`README.md` (pt-BR):

```markdown
| `~/.claude/settings.json` | Lido + escrito (só com sua permissão) | Adiciona dois comandos de hook em `hooks.SessionStart` e `hooks.UserPromptSubmit`; quando você clica em **Ativar ferramentas de tasks**, a chave `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`; e, quando você ativa os **Dados exatos**, a pasta do mod em `env.CLAUDE_CODE_PLUGIN_DIRS`. Outros hooks e configurações são preservados; um arquivo inválido nunca é sobrescrito. |
```

```markdown
| `~/.claude/.vscode-todos-bridge/mod/` | Escrito pela extensão (só com sua permissão) | Cópia do mod `claude-todos-bridge` do Claude Code e a data da ativação. Apagada quando você desativa os Dados exatos. |
| `~/.claude/.vscode-todos-bridge/live/<sessionId>.json` | Escrito pelo mod, dentro do Claude Code | Por sessão: janela de contexto, limites de uso de 5h e 7 dias, fim do último turno e início e fim de cada sub-agent (tipo, descrição, modelo). Nada de custo nem do conteúdo das mensagens. Arquivos com mais de 30 dias são apagados. |
```

Frase: `A extensão nunca modifica seus transcripts. Ela só apaga o que ela mesma criou: a cópia do mod, quando você desativa os Dados exatos, e os arquivos da ponte com mais de 30 dias.`

Limitação:

```markdown
- Os **Dados exatos** dependem dos Mods do Claude Code, em early access. Se o rodapé do bloco de uso disser que a ponte não respondeu, os Mods podem estar desligados na sua conta, ou um `CLAUDE_CODE_PLUGIN_DIRS` definido no ambiente pode estar prevalecendo sobre o do `settings.json`; o painel continua com as estimativas. Desinstalar a extensão não remove a pasta do mod nem a entrada no `settings.json`: rode antes `Claude Todos: Disable exact data from Claude Code` ou remova as duas à mão.
```

`README.en.md`:

```markdown
| `~/.claude/settings.json` | Read + written (only with your permission) | Adds two hook commands under `hooks.SessionStart` and `hooks.UserPromptSubmit`; when you click **Enable task tools**, the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key; and, when you turn on **Exact data**, the mod folder in `env.CLAUDE_CODE_PLUGIN_DIRS`. Other hooks and settings are preserved; an invalid file is never overwritten. |
```

```markdown
| `~/.claude/.vscode-todos-bridge/mod/` | Written by the extension (only with your permission) | A copy of the `claude-todos-bridge` Claude Code mod and the time you turned it on. Deleted when you turn Exact data off. |
| `~/.claude/.vscode-todos-bridge/live/<sessionId>.json` | Written by the mod, inside Claude Code | Per session: context window, 5-hour and 7-day usage limits, the end of the last turn, and the start and end of each sub-agent (type, description, model). No cost and no message content. Files older than 30 days are deleted. |
```

Frase: `The extension never modifies your transcripts. It only deletes what it created: the mod copy, when you turn Exact data off, and bridge files older than 30 days.`

Limitação:

```markdown
- **Exact data** relies on Claude Code Mods, an early-access feature. If the footer of the usage block says the bridge didn't respond, Mods may be off for your account, or a `CLAUDE_CODE_PLUGIN_DIRS` set in your environment may win over the one in `settings.json`; the panel keeps its estimates. Uninstalling the extension does not remove the mod folder or the `settings.json` entry: run `Claude Todos: Disable exact data from Claude Code` first, or remove both by hand.
```

`README.es.md`:

```markdown
| `~/.claude/settings.json` | Lectura + escritura (solo con tu permiso) | Agrega dos comandos de hook en `hooks.SessionStart` y `hooks.UserPromptSubmit`; cuando haces clic en **Activar herramientas de tareas**, la clave `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`; y, cuando activas los **Datos exactos**, la carpeta del mod en `env.CLAUDE_CODE_PLUGIN_DIRS`. Los demás hooks y ajustes se conservan; un archivo inválido nunca se sobrescribe. |
```

```markdown
| `~/.claude/.vscode-todos-bridge/mod/` | Escrito por la extensión (solo con tu permiso) | Copia del mod `claude-todos-bridge` de Claude Code y la fecha de activación. Se borra cuando desactivas los Datos exactos. |
| `~/.claude/.vscode-todos-bridge/live/<sessionId>.json` | Escrito por el mod, dentro de Claude Code | Por sesión: ventana de contexto, límites de uso de 5 h y 7 días, fin del último turno e inicio y fin de cada subagente (tipo, descripción, modelo). Sin costo ni contenido de mensajes. Los archivos con más de 30 días se borran. |
```

Frase: `La extensión nunca modifica tus transcripts. Solo borra lo que ella misma creó: la copia del mod, cuando desactivas los Datos exactos, y los archivos del puente con más de 30 días.`

Limitação:

```markdown
- Los **Datos exactos** dependen de los Mods de Claude Code, en acceso anticipado. Si el pie del bloque de uso dice que el puente no respondió, los Mods pueden estar desactivados en tu cuenta, o un `CLAUDE_CODE_PLUGIN_DIRS` definido en el entorno puede prevalecer sobre el de `settings.json`; el panel sigue con sus estimaciones. Desinstalar la extensión no quita la carpeta del mod ni la entrada en `settings.json`: ejecuta antes `Claude Todos: Disable exact data from Claude Code` o quita ambas a mano.
```

`README.zh-cn.md`:

```markdown
| `~/.claude/settings.json` | 读取 + 写入（仅在你授权时） | 在 `hooks.SessionStart` 和 `hooks.UserPromptSubmit` 下添加两个钩子命令；当你点击**开启任务工具**时，写入 `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`；当你开启**准确数据**时，把 mod 文件夹写入 `env.CLAUDE_CODE_PLUGIN_DIRS`。其他钩子和设置会被保留；无效的文件绝不会被覆盖。 |
```

```markdown
| `~/.claude/.vscode-todos-bridge/mod/` | 由扩展写入（仅在你授权时） | Claude Code mod `claude-todos-bridge` 的副本以及开启的时间。关闭准确数据时会被删除。 |
| `~/.claude/.vscode-todos-bridge/live/<sessionId>.json` | 由 mod 在 Claude Code 内写入 | 每个会话：上下文窗口、5 小时和 7 天的用量限制、最后一轮的结束时间，以及每个子智能体的开始和结束（类型、描述、模型）。不包含费用和消息内容。超过 30 天的文件会被删除。 |
```

Frase: `此扩展不会修改你的对话记录。它只会删除自己创建的内容：关闭准确数据时的 mod 副本，以及超过 30 天的桥接文件。`

Limitação:

```markdown
- **准确数据**依赖 Claude Code 的 Mod 功能，目前处于抢先体验阶段。如果用量区块底部显示桥接没有响应，可能是你的账户关闭了 Mod，或者环境中设置的 `CLAUDE_CODE_PLUGIN_DIRS` 覆盖了 `settings.json` 中的设置；面板会继续使用估算值。卸载扩展不会删除 mod 文件夹和 `settings.json` 中的条目：请先运行 `Claude Todos: Disable exact data from Claude Code`，或手动删除两者。
```

`README.zh-tw.md`:

```markdown
| `~/.claude/settings.json` | 讀取 + 寫入（僅在你授權時） | 在 `hooks.SessionStart` 和 `hooks.UserPromptSubmit` 下新增兩個掛鉤命令；當你點擊**開啟任務工具**時，寫入 `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`；當你開啟**精確資料**時，把 mod 資料夾寫入 `env.CLAUDE_CODE_PLUGIN_DIRS`。其他掛鉤和設定會被保留；無效的檔案絕不會被覆寫。 |
```

```markdown
| `~/.claude/.vscode-todos-bridge/mod/` | 由擴充功能寫入（僅在你授權時） | Claude Code mod `claude-todos-bridge` 的副本以及開啟的時間。關閉精確資料時會被刪除。 |
| `~/.claude/.vscode-todos-bridge/live/<sessionId>.json` | 由 mod 在 Claude Code 內寫入 | 每個工作階段：上下文視窗、5 小時和 7 天的用量限制、最後一輪的結束時間，以及每個子智慧體的開始和結束（類型、描述、模型）。不包含費用和訊息內容。超過 30 天的檔案會被刪除。 |
```

Frase: `此擴充功能不會修改你的對話記錄。它只會刪除自己建立的內容：關閉精確資料時的 mod 副本，以及超過 30 天的橋接檔案。`

Limitação:

```markdown
- **精確資料**依賴 Claude Code 的 Mod 功能，目前處於搶先體驗階段。如果用量區塊底部顯示橋接沒有回應，可能是你的帳戶關閉了 Mod，或者環境中設定的 `CLAUDE_CODE_PLUGIN_DIRS` 覆蓋了 `settings.json` 中的設定；面板會繼續使用估算值。解除安裝擴充功能不會刪除 mod 資料夾和 `settings.json` 中的項目：請先執行 `Claude Todos: Disable exact data from Claude Code`，或手動刪除兩者。
```

- [ ] **Step 2: CHANGELOG**

Em `CHANGELOG.md`, logo abaixo de `## [Unreleased]` e acima de `### Fixed`, acrescentar:

```markdown
### Added
- **Exact data from Claude Code (experimental).** An optional Claude Code mod (`claude-todos-bridge`, built on the early-access Mods API) records, per session, the exact context window, the 5-hour and 7-day usage limits, and when each sub-agent and each main turn ends. The panel uses this data when it exists and keeps its own estimates otherwise:
  - the context bar uses the window Claude Code reports instead of guessing it from the model name, so 200k windows on Pro and Team plans show right;
  - a new **Usage limits** block shows the 5-hour and 7-day percentages with their reset times;
  - sub-agents end exactly when Claude Code says so;
  - the idle notification fires as soon as the turn ends instead of after 45 s of silence.

  Turn it on from the footer of the usage block or with `Claude Todos: Enable exact data from Claude Code (experimental)`, in VS Code and JetBrains. After a confirmation, it copies the mod to `~/.claude/.vscode-todos-bridge/mod/` and adds that folder to `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. Roadmap item 25; spec `docs/specs/2026-10-06-ponte-de-dados-mod-design.md`.
```

- [ ] **Step 3: ROADMAP**

Em `docs/ROADMAP.md`, trocar o título do item 25 (linha 864):

```markdown
### 25. Mods (function hooks) — nova superfície de extensão do Claude Code ⏸️ observar · 🧪 spike da ponte ✅ (2026-10-05)
```

por:

```markdown
### 25. Mods (function hooks) — nova superfície de extensão do Claude Code · ✅ ponte de dados v1 entregue
```

e, ao fim do item 25 (depois do bullet **Recomendação do spike**), acrescentar:

```markdown
- **✅ Ponte v1 entregue:** o mod `claude-todos-bridge`, instalado pela extensão via
  `CLAUDE_CODE_PLUGIN_DIRS`, grava a janela exata, os limites de 5h e 7 dias, o fim exato de
  sub-agents e turnos; o aviso de ociosidade sai no fim do turno. Spec
  `docs/specs/2026-10-06-ponte-de-dados-mod-design.md`, plano
  `docs/plans/2026-10-06-ponte-de-dados-mod.md`. Fora da v1: custo, `failed`/`killed` na UI,
  aviso de "esperando permissão", marketplace. A ideia (b), um mod "Claude Todos" para o
  terminal, segue ⏸️.
```

No item 2 (linha 157), ao fim da lista de bullets do item, acrescentar:

```markdown
- **Janela exata para quem ativa a ponte (item 25, v1):** o `window` que o Claude Code informa
  substitui a estimativa por nome de modelo; a heurística segue como reserva para quem não ativa.
```

- [ ] **Step 4: Verificar e commitar a documentação**

Run: `npm test && npm run build`
Expected: PASS e build sem erros (os testes de i18n não leem os READMEs; o build garante o bundle final).

```bash
git add README.md README.en.md README.es.md README.zh-cn.md README.zh-tw.md CHANGELOG.md docs/ROADMAP.md
git commit -m "docs: ponte de dados via mod nos READMEs, CHANGELOG e ROADMAP (item 25)

Privacidade com as pastas mod/ e live/ e a entrada em
CLAUDE_CODE_PLUGIN_DIRS, a limitacao do early access e a entrega no
ROADMAP.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Verificação de ponta a ponta (com o parceiro humano)**

Lançar o host de extensão a partir do Claude Code contamina o ambiente (`ELECTRON_RUN_AS_NODE`, `CLAUDE_CODE_SESSION_ID`). Por isso, quem executa a verificação é o parceiro humano, no VS Code dele; o executor do plano prepara a lista e registra o resultado no ledger.

1. Backup: `cp ~/.claude/settings.json ~/.claude/settings.json.antes-da-ponte`.
2. F5 no VS Code (Extension Development Host).
   Expected: o rodapé do bloco de uso mostra "Dados exatos (experimental) · Ativar".
3. Clicar em Ativar e confirmar.
   Expected: toast "Dados exatos ativados…"; `~/.claude/settings.json` tem `env.CLAUDE_CODE_PLUGIN_DIRS` com a pasta `…\.vscode-todos-bridge\mod\claude-todos-bridge`; a pasta existe; o rodapé passa a "Dados exatos a partir da próxima sessão · Desativar".
4. No host de desenvolvimento, abrir uma sessão **nova** do Claude Code e mandar um prompt.
   Expected:
   - existe `~/.claude/.vscode-todos-bridge/live/<id>.json` com `schema: 1` e `engineVersion` 2.1.289 ou mais nova;
   - o rodapé mostra "Dados exatos do Claude Code";
   - o tooltip da contagem de contexto diz "Janela informada pelo Claude Code";
   - o bloco "Limites de uso" mostra 5h e 7 dias.
5. Pedir ao Claude um agente curto em background.
   Expected: o nó aparece rodando e passa a concluído quando o agente termina.
6. Com a janela sem foco, um turno de pelo menos 60 s.
   Expected: o aviso de ociosidade sai logo no fim do turno, sem esperar 45 s.
7. Fechar e reabrir o VS Code com o mod instalado.
   Expected: a pasta do mod não é regravada à toa, porque o mtime dos arquivos não muda.
8. `/clear` na sessão (Review Focus 5).
   Expected: surge um arquivo novo para o id novo, e o antigo mostra `turn.state: "ended"` com `reason: "clear"`.
9. Desativar e confirmar.
   Expected: `diff ~/.claude/settings.json ~/.claude/settings.json.antes-da-ponte` sem diferenças; `~/.claude/.vscode-todos-bridge/mod/` não existe mais; o rodapé volta a "Ativar".
10. JetBrains: a partir de `jetbrains/`, `cmd //c "<raiz>\jetbrains\gradlew.bat" runIde`.
    Expected: o rodapé aparece na tool window; Ativar abre o diálogo nativo com o botão "Ativar", e Desativar com o botão "Desativar".

Resultado no ledger: `Task 10: E2E <passos ok>/<passos totais>`. Um passo que não puder ser executado entra como `Ruling:` com o motivo. Se o parceiro humano não estiver disponível, registrar `E2E: pendente do parceiro humano`, como aconteceu com o F5 da Tarefa 0.
