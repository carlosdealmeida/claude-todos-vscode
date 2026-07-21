import * as fs from 'fs';
import * as path from 'path';
import { BridgeFile } from '../services/bridgeFile';
import { TodosParser } from '../services/todosParser';
import { SessionResolver } from '../services/sessionResolver';
import { SnapshotService } from '../services/snapshotService';
import { UsageParser } from '../services/usageParser';
import { ProjectUsageService } from '../services/projectUsageService';
import { TodosWatcher } from '../services/todosWatcher';
import { SessionNotifier, type NotificationKind } from '../services/sessionNotifier';
import { transcriptPath, subAgentsDir, SAFE_SESSION_ID } from '../services/transcriptPaths';
import { HookInstaller, DEFAULT_HOOK_EVENTS } from '../services/hookInstaller';
import type { SessionSnapshot, SessionSummary, ProjectUsage, AwaitingInput } from '../types';

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export interface SessionCoreDeps {
  claudeDir: string;
  workspaceCwds: () => string[];
  now?: () => number;
}

export class SessionCore {
  private readonly claudeDir: string;
  private readonly workspaceCwds: () => string[];
  private readonly now: () => number;
  private readonly bridge: BridgeFile;
  private readonly parser: TodosParser;
  private readonly usageParser: UsageParser;
  private readonly projectUsageService: ProjectUsageService;
  private readonly snapshotService: SnapshotService;
  private readonly notifier = new SessionNotifier();
  private readonly watcher: TodosWatcher;

  constructor(deps: SessionCoreDeps) {
    this.claudeDir = deps.claudeDir;
    this.workspaceCwds = deps.workspaceCwds;
    this.now = deps.now ?? (() => Date.now());
    this.bridge = new BridgeFile(path.join(this.claudeDir, '.vscode-todos-bridge', 'sessions.json'));
    this.parser = new TodosParser(this.claudeDir);
    this.usageParser = new UsageParser(this.claudeDir);
    this.projectUsageService = new ProjectUsageService(this.claudeDir);
    const resolver = new SessionResolver(this.bridge, this.workspaceCwds);
    this.snapshotService = new SnapshotService(resolver, this.parser, this.usageParser);
    this.watcher = new TodosWatcher(this.claudeDir);
  }

  pruneBridge(maxAgeMs: number): void { this.bridge.prune(maxAgeMs); }
  setPinnedSession(id: string | null): void { this.snapshotService.setPinnedSession(id); }
  buildSnapshot(): SessionSnapshot | null { return this.snapshotService.build(); }
  listSessions(): SessionSummary[] { return this.snapshotService.listSessions(); }
  activeCwd(): string | null { return this.snapshotService.activeCwd(); }

  getProjectUsage(): ProjectUsage | null {
    const cwd = this.snapshotService.activeCwd() ?? this.workspaceCwds()[0] ?? null;
    return cwd ? this.projectUsageService.usageForProject(cwd, this.now() - SEVEN_DAYS_MS) : null;
  }

  // Instalação de hook para o sidecar (JetBrains): o path do script vem do host;
  // o comando tem o MESMO formato do VS Code — instalar de um IDE é no-op no outro.
  hookStatus(scriptPath: string): boolean {
    return new HookInstaller(path.join(this.claudeDir, 'settings.json'))
      .areAllInstalled(DEFAULT_HOOK_EVENTS, `node "${scriptPath}"`);
  }

  installHook(scriptPath: string): void {
    new HookInstaller(path.join(this.claudeDir, 'settings.json'))
      .installAll(DEFAULT_HOOK_EVENTS, `node "${scriptPath}"`);
  }

  resolveTodoSource(sessionId: string, agentId: string, line: number): { filePath: string; line: number } | null {
    if (!SAFE_SESSION_ID.test(agentId)) return null;
    const cwd = this.snapshotService.listSessions().find(s => s.sessionId === sessionId)?.cwd ?? null;
    if (!cwd) return null;
    let filePath: string | null = null;
    if (agentId === sessionId) {
      filePath = transcriptPath(this.claudeDir, sessionId, cwd);
    } else {
      const dir = subAgentsDir(this.claudeDir, sessionId, cwd);
      if (dir) {
        const candidate = path.join(dir, `agent-${agentId}.jsonl`);
        if (fs.existsSync(candidate)) filePath = candidate;
      }
    }
    if (!filePath) return null;
    return { filePath, line: Math.max(0, Math.floor(line)) };
  }

  onChange(listener: () => void): { dispose(): void } { return this.watcher.onChange(listener); }

  observeForNotifications(): { kinds: NotificationKind[]; awaitingInput: AwaitingInput | null; title: string | null } {
    const snapshot = this.snapshotService.build();
    if (!snapshot) return { kinds: [], awaitingInput: null, title: null };
    const mtime = this.parser.transcriptMtime(snapshot.sessionId, snapshot.cwd) ?? 0;
    const main = snapshot.agents.find(a => a.isMain);
    const allComplete = main !== undefined && main.todos.length > 0
      && main.todos.every(td => td.status === 'completed');
    const awaitingInput = snapshot.awaitingInput ?? null;
    const kinds = this.notifier.observe({
      sessionId: snapshot.sessionId, mtime, allComplete, awaitingInput, now: this.now(),
    });
    return { kinds, awaitingInput, title: snapshot.title };
  }

  shouldPollNotifications(): boolean { return this.notifier.shouldPoll(this.now()); }
  dispose(): void { this.watcher.dispose(); }
}
