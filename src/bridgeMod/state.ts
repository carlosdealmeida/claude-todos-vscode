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
