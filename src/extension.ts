import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BridgeFile } from './services/bridgeFile';
import { TodosParser } from './services/todosParser';
import { SessionResolver } from './services/sessionResolver';
import { SnapshotService } from './services/snapshotService';
import { UsageParser } from './services/usageParser';
import { TodosWatcher } from './services/todosWatcher';
import { HookInstaller, type HookEvent } from './services/hookInstaller';
import { TodosViewProvider } from './providers/todosViewProvider';
import { TodosPanelProvider } from './providers/todosPanelProvider';
import type { WebviewMessage } from './types';
import { createT } from './i18n/t';
import { resolveLocale } from './localeResolver';
import { SessionNotifier, type NotificationKind } from './services/sessionNotifier';

const HOOK_EVENTS: HookEvent[] = ['SessionStart', 'UserPromptSubmit'];

// Matches commands pointing at the *versioned* extension directory used in
// 0.1.x / 0.2.0 (e.g. `.../carlosjunior1992.claude-todos-0.1.0/...`). These
// become orphans on every extension update — we sweep them on activation and
// migrate to a stable, install-independent path under ~/.claude.
const LEGACY_HOOK_PATTERN = /carlosjunior1992\.claude-todos-\d+\.\d+\.\d+[\\/]dist[\\/]hooks/;

interface SessionPickItem extends vscode.QuickPickItem {
  sessionId: string | null;
}

function relativeTime(ms: number, t: ReturnType<typeof createT>): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return t('time.now');
  if (min < 60) return t('time.minutesAgo', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('time.hoursAgo', { n: hours });
  return t('time.daysAgo', { n: Math.floor(hours / 24) });
}

export function activate(context: vscode.ExtensionContext): void {
  const claudeDir = resolveClaudeDir();
  const bridgePath = path.join(claudeDir, '.vscode-todos-bridge', 'sessions.json');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const hookScriptPath = ensureStableHookScript(context, claudeDir);
  const hookCommand = `node "${hookScriptPath}"`;

  const hookInstaller = new HookInstaller(settingsPath);
  const removedLegacy = hookInstaller.cleanupLegacyHooks(HOOK_EVENTS, LEGACY_HOOK_PATTERN, hookCommand);
  if (removedLegacy > 0) {
    // The user had previously consented to hooks for an older versioned path
    // (now deleted by VSCode's update). Re-install transparently at the stable
    // path so the prompt does not fire again on every update.
    try { hookInstaller.installAll(HOOK_EVENTS, hookCommand); } catch { /* swallow */ }
  }

  const bridge = new BridgeFile(bridgePath);
  const parser = new TodosParser(claudeDir);
  const usageParser = new UsageParser(claudeDir);
  const resolver = new SessionResolver(bridge, () => {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath ?? null;
  });
  const snapshotService = new SnapshotService(resolver, parser, usageParser);
  snapshotService.setPinnedSession(context.workspaceState.get<string | null>('pinnedSessionId', null));
  const watcher = new TodosWatcher(claudeDir);
  context.subscriptions.push(watcher);

  const notifier = new SessionNotifier();
  let notifyTimer: NodeJS.Timeout | null = null;

  let viewProvider!: TodosViewProvider;
  let panelProvider!: TodosPanelProvider;

  const stopNotifyTimer = (): void => {
    if (notifyTimer) { clearInterval(notifyTimer); notifyTimer = null; }
  };

  const startNotifyTimer = (): void => {
    if (!notifyTimer) notifyTimer = setInterval(() => observeSession(), 10_000);
  };

  // Gate de exibição (setting + foco) na hora do disparo — a detecção roda
  // sempre, para o estado do notifier não depender do foco da janela.
  const maybeToast = (kinds: NotificationKind[], title: string): void => {
    if (kinds.length === 0) return;
    const enabled = vscode.workspace.getConfiguration('claudeTodos').get<boolean>('notifications', true);
    if (!enabled || vscode.window.state.focused) return;
    const t = createT(resolveLocale());
    // Os dois no mesmo observe: exibe só allComplete (menos ruído).
    const message = kinds.includes('allComplete')
      ? t('notify.allComplete', { title })
      : t('notify.idle', { title });
    void vscode.window.showInformationMessage(message, t('notify.openPanel'), t('notify.disable'))
      .then(choice => {
        if (choice === t('notify.openPanel')) {
          void vscode.commands.executeCommand('claudeTodos.openPanel');
        } else if (choice === t('notify.disable')) {
          void vscode.workspace.getConfiguration('claudeTodos')
            .update('notifications', false, vscode.ConfigurationTarget.Global);
        }
      });
  };

  // Alimenta o notifier com a sessão exibida (a mesma que o snapshot escolhe).
  // Chamada em cada onChange do watcher e em cada tick do timer; o timer só
  // fica armado enquanto um disparo de idle ainda é possível (shouldPoll).
  const observeSession = (): void => {
    const snapshot = snapshotService.build();
    if (!snapshot) { stopNotifyTimer(); return; }
    const mtime = parser.transcriptMtime(snapshot.sessionId, snapshot.cwd) ?? 0;
    const main = snapshot.agents.find(a => a.isMain);
    const allComplete = main !== undefined
      && main.todos.length > 0
      && main.todos.every(td => td.status === 'completed');
    const now = Date.now();
    const fired = notifier.observe({
      sessionId: snapshot.sessionId,
      mtime,
      allComplete,
      now,
    });
    maybeToast(fired, snapshot.title);
    if (notifier.shouldPoll(now)) startNotifyTimer(); else stopNotifyTimer();
  };

  const showSessionPicker = async (): Promise<void> => {
    const t = createT(resolveLocale());
    const sessions = snapshotService.listSessions();
    const items: SessionPickItem[] = [
      { label: t('picker.auto'), description: t('picker.autoDesc'), sessionId: null },
      ...sessions.map(s => ({
        label: s.title,
        description: `${s.sessionId.slice(0, 8)} · ${relativeTime(s.updatedAt, t)}`,
        sessionId: s.sessionId,
      })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: t('picker.placeholder'),
    });
    if (!picked) return;
    snapshotService.setPinnedSession(picked.sessionId);
    await context.workspaceState.update('pinnedSessionId', picked.sessionId);
    viewProvider.pushSnapshot();
    panelProvider.pushSnapshot();
    observeSession();
  };

  const handleMessage = (msg: WebviewMessage): void => {
    if (msg.type === 'openPanel') {
      vscode.commands.executeCommand('claudeTodos.openPanel');
    } else if (msg.type === 'refresh') {
      viewProvider.pushSnapshot();
      panelProvider.pushSnapshot();
    } else if (msg.type === 'pickSession') {
      void showSessionPicker();
    }
  };

  viewProvider = new TodosViewProvider(context.extensionUri, snapshotService, handleMessage);
  panelProvider = new TodosPanelProvider(context.extensionUri, snapshotService, handleMessage);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TodosViewProvider.viewType, viewProvider),
  );

  context.subscriptions.push(
    watcher.onChange(() => {
      viewProvider.pushSnapshot();
      panelProvider.pushSnapshot();
      observeSession();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      viewProvider.pushSnapshot();
      panelProvider.pushSnapshot();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeTodos.language')) {
        viewProvider.pushLocale();
        panelProvider.pushLocale();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTodos.openPanel', () => panelProvider.open()),
    vscode.commands.registerCommand('claudeTodos.refresh', () => {
      viewProvider.pushSnapshot();
      panelProvider.pushSnapshot();
    }),
    vscode.commands.registerCommand('claudeTodos.installHook', async () => {
      await promptInstallHook(hookInstaller, hookCommand);
    }),
  );

  void maybePromptInstallHook(context, hookInstaller, hookCommand);
  context.subscriptions.push({ dispose: stopNotifyTimer });
  observeSession();
}

export function deactivate(): void {}

function resolveClaudeDir(): string {
  const override = vscode.workspace.getConfiguration('claudeTodos').get<string>('claudeDir');
  if (override && override.trim()) return override;
  return path.join(os.homedir(), '.claude');
}

// Copies the bundled hook script to a stable location under ~/.claude so that
// VSCode extension updates (which delete the previous versioned directory) do
// not invalidate the hook command registered in settings.json. Returns the
// stable path to register.
function ensureStableHookScript(context: vscode.ExtensionContext, claudeDir: string): string {
  const sourcePath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'hooks', 'sessionStart.js').fsPath;
  const targetDir = path.join(claudeDir, '.vscode-todos-bridge');
  const targetPath = path.join(targetDir, 'hook.js');
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  } catch {
    // If the copy fails (permissions, etc.), fall back to the source path —
    // the hook will still work for the current install, only future updates
    // would leave orphans. The cleanup sweep mitigates that.
    return sourcePath;
  }
  return targetPath;
}

async function maybePromptInstallHook(
  context: vscode.ExtensionContext,
  installer: HookInstaller,
  command: string,
): Promise<void> {
  const autoPrompt = vscode.workspace.getConfiguration('claudeTodos').get<boolean>('autoInstallHook', true);
  if (!autoPrompt) return;
  if (installer.areAllInstalled(HOOK_EVENTS, command)) return;
  if (context.globalState.get<boolean>('hookPromptDismissed')) return;

  const t = createT(resolveLocale());
  const choice = await vscode.window.showInformationMessage(
    t('hook.promptMessage'),
    t('hook.install'),
    t('hook.notNow'),
    t('hook.dontAskAgain'),
  );

  if (choice === t('hook.install')) {
    try {
      installer.installAll(HOOK_EVENTS, command);
      vscode.window.showInformationMessage(t('hook.installedAuto'));
    } catch (err) {
      vscode.window.showErrorMessage(t('hook.installFailed', { error: String(err) }));
    }
  } else if (choice === t('hook.dontAskAgain')) {
    await context.globalState.update('hookPromptDismissed', true);
  }
}

async function promptInstallHook(
  installer: HookInstaller,
  command: string,
): Promise<void> {
  const t = createT(resolveLocale());
  try {
    installer.installAll(HOOK_EVENTS, command);
    vscode.window.showInformationMessage(t('hook.installedManual'));
  } catch (err) {
    vscode.window.showErrorMessage(t('hook.installFailed', { error: String(err) }));
  }
}
