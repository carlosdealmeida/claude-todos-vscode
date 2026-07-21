import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HookInstaller, DEFAULT_HOOK_EVENTS } from './services/hookInstaller';
import { TodosViewProvider } from './providers/todosViewProvider';
import { TodosPanelProvider } from './providers/todosPanelProvider';
import type { WebviewMessage } from './types';
import { createT } from './i18n/t';
import { resolveLocale } from './localeResolver';
import { pickWorkspaceCwds } from './services/workspaceFolders';
import { SessionCore } from './core/sessionCore';
import type { NotificationKind } from './services/sessionNotifier';

const HOOK_EVENTS = DEFAULT_HOOK_EVENTS;
// Retenção dos registros do bridge. Sessões saem do picker quando o transcript
// some; isto só remove o lixo acumulado no sessions.json (cap de 200 do hook).
const BRIDGE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

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

  const workspaceCwds = (): string[] => pickWorkspaceCwds(
    (vscode.workspace.workspaceFolders ?? []).map(f => ({ name: f.name, fsPath: f.uri.fsPath })),
    vscode.workspace.getConfiguration('claudeTodos').get<string>('activeFolder', ''),
  );
  const core = new SessionCore({ claudeDir, workspaceCwds });
  core.pruneBridge(BRIDGE_MAX_AGE_MS);
  core.setPinnedSession(context.workspaceState.get<string | null>('pinnedSessionId', null));
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
  const maybeToast = (kinds: NotificationKind[], title: string, awaiting: 'question' | 'plan' | null = null): void => {
    if (kinds.length === 0) return;
    const enabled = vscode.workspace.getConfiguration('claudeTodos').get<boolean>('notifications', true);
    if (!enabled || vscode.window.state.focused) return;
    const t = createT(resolveLocale());
    // Vários no mesmo observe: exibe um só, do mais conclusivo ao mais genérico.
    const message = kinds.includes('allComplete')
      ? t('notify.allComplete', { title })
      : kinds.includes('awaitingInput')
        ? t(awaiting === 'plan' ? 'notify.awaitingPlan' : 'notify.awaitingQuestion', { title })
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
    const { kinds, awaitingInput, title } = core.observeForNotifications();
    if (title === null) { stopNotifyTimer(); return; }
    maybeToast(kinds, title, awaitingInput);
    if (core.shouldPollNotifications()) startNotifyTimer(); else stopNotifyTimer();
  };

  const showSessionPicker = async (): Promise<void> => {
    const t = createT(resolveLocale());
    const sessions = core.listSessions();
    // Em multi-root, o basename da pasta desambigua sessões de pastas distintas.
    const multiRoot = workspaceCwds().length > 1;
    const items: SessionPickItem[] = [
      { label: t('picker.auto'), description: t('picker.autoDesc'), sessionId: null },
      ...sessions.map(s => ({
        label: s.title,
        description: multiRoot
          ? `${s.sessionId.slice(0, 8)} · ${path.basename(s.cwd)} · ${relativeTime(s.updatedAt, t)}`
          : `${s.sessionId.slice(0, 8)} · ${relativeTime(s.updatedAt, t)}`,
        sessionId: s.sessionId,
      })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: t('picker.placeholder'),
    });
    if (!picked) return;
    core.setPinnedSession(picked.sessionId);
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
    } else if (msg.type === 'projectUsage') {
      // Segue a pasta da sessão exibida — painel e dashboard sempre na mesma pasta.
      const usage = core.getProjectUsage();
      viewProvider.pushProjectUsage(usage);
      panelProvider.pushProjectUsage(usage);
    } else if (msg.type === 'openTodoSource') {
      const target = core.resolveTodoSource(msg.sessionId, msg.agentId, msg.line);
      void openTodoSource(target);
    } else if (msg.type === 'pickSession') {
      void showSessionPicker();
    }
  };

  viewProvider = new TodosViewProvider(context.extensionUri, () => core.buildSnapshot(), handleMessage);
  panelProvider = new TodosPanelProvider(context.extensionUri, () => core.buildSnapshot(), handleMessage);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TodosViewProvider.viewType, viewProvider),
  );

  context.subscriptions.push({ dispose: () => core.dispose() });
  context.subscriptions.push(core.onChange(() => {
    viewProvider.pushSnapshot();
    panelProvider.pushSnapshot();
    observeSession();
  }));

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
      if (e.affectsConfiguration('claudeTodos.activeFolder')) {
        viewProvider.pushSnapshot();
        panelProvider.pushSnapshot();
        observeSession();
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
    vscode.commands.registerCommand('claudeTodos.pickSession', () => {
      void showSessionPicker();
    }),
  );

  void maybePromptInstallHook(context, hookInstaller, hookCommand);
  context.subscriptions.push({ dispose: stopNotifyTimer });
  observeSession();
}

// Abre o transcript do agente no editor, com a linha da mensagem selecionada.
// A resolução do alvo (agent principal vs sub-agent, validação do id, cwd da
// sessão via bridge) já aconteceu no core; aqui só resta abrir o editor.
async function openTodoSource(target: { filePath: string; line: number } | null): Promise<void> {
  if (!target) {
    const t = createT(resolveLocale());
    void vscode.window.showWarningMessage(t('todo.sourceMissing'));
    return;
  }
  const pos = new vscode.Position(target.line, 0);
  await vscode.window.showTextDocument(vscode.Uri.file(target.filePath), {
    selection: new vscode.Range(pos, pos),
    preview: true,
  });
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
