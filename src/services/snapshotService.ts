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

export class SnapshotService {
  private pinnedSessionId: string | null = null;

  constructor(
    private readonly resolver: SessionResolver,
    private readonly parser: TodosParser,
    private readonly usageParser: UsageParser,
    private readonly liveSessions: () => Map<string, LiveSession> = () => new Map(),
    private readonly names?: SessionNames,
    // Injetavel pra testar o updatedAt gravado por resolveTitle() sem depender
    // do relogio real — mesmo padrao do `now` que o SessionCore ja usa pra poda.
    private readonly now: () => number = () => Date.now(),
    // R2: leitor da flag CLAUDE_CODE_ENABLE_TODO_TOOLS. Opcional: sem ele, o
    // snapshot nunca marca taskToolsOff (compatível com quem constrói só o básico).
    private readonly taskToolsFlags?: { read(cwd: string | null): FlagState },
    // Ponte de dados (item 25): janela exata, limites, ciclo de vida e o estado
    // do rodapé. Opcional pelo mesmo motivo do taskToolsFlags.
    private readonly bridge?: SnapshotBridge,
  ) {}

  setPinnedSession(sessionId: string | null): void {
    this.pinnedSessionId = sessionId;
  }

  listSessions(): SessionSummary[] {
    return this.summarize(this.liveSessions());
  }

  // `live` lido uma vez por chamada pública: o build() precisa do mesmo mapa
  // para o startedAt do processo vivo, sem reler ~/.claude/sessions.
  private summarize(live: Map<string, LiveSession>): SessionSummary[] {
    // Uma leitura do arquivo de nomes por chamada, igual ao `live` — resolveTitle
    // roda em laço por sessão candidata e não pode reabrir o arquivo a cada volta.
    const cachedNames = this.names?.entries() ?? {};
    const out: SessionSummary[] = [];
    for (const record of this.resolver.resolveCandidates()) {
      // Atividade de conversa, não mtime (#87900): metadados anexados depois não
      // reordenam o picker nem trocam a sessão escolhida.
      const updatedAt = this.parser.transcriptActivityAt(record.sessionId, record.cwd);
      if (updatedAt === null) continue;
      out.push({
        sessionId: record.sessionId,
        cwd: record.cwd,
        title: this.resolveTitle(record.sessionId, record.cwd, live.get(record.sessionId), cachedNames[record.sessionId]),
        updatedAt,
        ...(live.has(record.sessionId) ? { alive: true } : {}),
      });
    }
    // Ordem por atividade de conversa (DESC): a preferência por sessão viva vive no choose().
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  build(): SessionSnapshot | null {
    const live = this.liveSessions();
    const sessions = this.summarize(live);
    const chosen = this.choose(sessions);
    if (!chosen) return null;

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
    const agents = detail.agents;
    // Desacopla "tem sessão" de "tem todo": antes de qualquer TodoWrite, ainda
    // resolvemos o agente main para que tokens/contexto/cache apareçam assim que
    // a sessão tem atividade. A lista visível (`agents`) continua vazia — a UI
    // mostra um estado leve de "aguardando tasks" no lugar da lista.
    const usageAgents: AgentTodos[] = agents.length > 0 ? agents : [{
      sessionId: chosen.sessionId,
      agentId: chosen.sessionId,
      name: 'Main agent',
      isMain: true,
      todos: [],
      updatedAt: 0,
    }];
    const usage = this.withBridgeUsage(
      this.usageParser.usageForSession(chosen.sessionId, chosen.cwd, usageAgents),
      bridgeFile,
      modStatus?.installed === true,
    );
    const bridgeState = this.bridgeStatus(modStatus, bridgeFile, liveSession);
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
      ...(bridgeState !== undefined ? { bridge: bridgeState } : {}),
    };
  }

  // cwd da sessão que o painel exibe (pin respeitado) — usada pelo dashboard
  // de projeto para manter painel e agregado apontando para a mesma pasta.
  activeCwd(): string | null {
    return this.choose(this.listSessions())?.cwd ?? null;
  }

  private choose(sessions: SessionSummary[]): SessionSummary | undefined {
    const pinned = this.pinnedSessionId
      ? sessions.find(s => s.sessionId === this.pinnedSessionId)
      : undefined;
    if (pinned) return pinned;
    // `sessions` já vem por atividade DESC, então o primeiro vivo é o vivo mais recente.
    return sessions.find(s => s.alive) ?? sessions[0];
  }

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

  // name do registro (só nameSource 'user') > nome em cache > aiTitle > id curto.
  // 'derived' é ignorado de propósito: é {basename}-{sufixo}, pior que o aiTitle.
  // `cachedName` vem do lote resolvido em listSessions() — nunca lido aqui.
  private resolveTitle(sessionId: string, cwd: string, live?: LiveSession, cachedName?: string): string {
    if (live?.nameSource === 'user' && live.name) {
      this.names?.remember(sessionId, live.name, this.now());
      return live.name;
    }
    if (cachedName) return cachedName;
    return this.parser.readSessionTitle(sessionId, cwd) ?? `Session · ${sessionId.slice(0, 8)}`;
  }
}
