import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { BridgeFile } from './services/bridgeFile';
import { TodosParser } from './services/todosParser';
import { SessionResolver } from './services/sessionResolver';
import { SnapshotService } from './services/snapshotService';
import { TodosWatcher } from './services/todosWatcher';
import { HookInstaller, type HookEvent } from './services/hookInstaller';
import { TodosViewProvider } from './providers/todosViewProvider';
import { TodosPanelProvider } from './providers/todosPanelProvider';
import type { WebviewMessage } from './types';

const HOOK_EVENTS: HookEvent[] = ['SessionStart', 'UserPromptSubmit'];

interface SessionPickItem extends vscode.QuickPickItem {
  sessionId: string | null;
}

function relativeTime(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function activate(context: vscode.ExtensionContext): void {
  const claudeDir = resolveClaudeDir();
  const bridgePath = path.join(claudeDir, '.vscode-todos-bridge', 'sessions.json');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const hookScriptPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'hooks', 'sessionStart.js').fsPath;
  const hookCommand = `node "${hookScriptPath}"`;

  const bridge = new BridgeFile(bridgePath);
  const parser = new TodosParser(claudeDir);
  const resolver = new SessionResolver(bridge, () => {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath ?? null;
  });
  const snapshotService = new SnapshotService(resolver, parser);
  snapshotService.setPinnedSession(context.workspaceState.get<string | null>('pinnedSessionId', null));
  const watcher = new TodosWatcher(claudeDir);
  const hookInstaller = new HookInstaller(settingsPath);
  context.subscriptions.push(watcher);

  let viewProvider!: TodosViewProvider;
  let panelProvider!: TodosPanelProvider;

  const showSessionPicker = async (): Promise<void> => {
    const sessions = snapshotService.listSessions();
    const items: SessionPickItem[] = [
      { label: 'Auto', description: 'seguir a sessão mais ativa', sessionId: null },
      ...sessions.map(s => ({
        label: s.title,
        description: `${s.sessionId.slice(0, 8)} · ${relativeTime(s.updatedAt)}`,
        sessionId: s.sessionId,
      })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Selecione a sessão a exibir',
    });
    if (!picked) return;
    snapshotService.setPinnedSession(picked.sessionId);
    await context.workspaceState.update('pinnedSessionId', picked.sessionId);
    viewProvider.pushSnapshot();
    panelProvider.pushSnapshot();
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
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      viewProvider.pushSnapshot();
      panelProvider.pushSnapshot();
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
}

export function deactivate(): void {}

function resolveClaudeDir(): string {
  const override = vscode.workspace.getConfiguration('claudeTodos').get<string>('claudeDir');
  if (override && override.trim()) return override;
  return path.join(os.homedir(), '.claude');
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

  const choice = await vscode.window.showInformationMessage(
    'Claude Todos needs to install hooks (SessionStart + UserPromptSubmit) in ~/.claude/settings.json to detect Claude Code sessions for this workspace. UserPromptSubmit allows in-progress sessions to be tracked on the next message.',
    'Install',
    'Not now',
    "Don't ask again",
  );

  if (choice === 'Install') {
    try {
      installer.installAll(HOOK_EVENTS, command);
      vscode.window.showInformationMessage('Claude Todos hooks installed. In-progress Claude Code sessions will be tracked on their next message; new sessions are tracked immediately.');
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to install hooks: ${String(err)}`);
    }
  } else if (choice === "Don't ask again") {
    await context.globalState.update('hookPromptDismissed', true);
  }
}

async function promptInstallHook(
  installer: HookInstaller,
  command: string,
): Promise<void> {
  try {
    installer.installAll(HOOK_EVENTS, command);
    vscode.window.showInformationMessage('Claude Todos hooks installed (SessionStart + UserPromptSubmit).');
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to install hooks: ${String(err)}`);
  }
}
