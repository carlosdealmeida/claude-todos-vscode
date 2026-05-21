import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { BridgeFile } from './services/bridgeFile';
import { TodosParser } from './services/todosParser';
import { SessionResolver } from './services/sessionResolver';
import { SnapshotService } from './services/snapshotService';
import { TodosWatcher } from './services/todosWatcher';
import { HookInstaller } from './services/hookInstaller';
import { TodosViewProvider } from './providers/todosViewProvider';
import { TodosPanelProvider } from './providers/todosPanelProvider';
import type { WebviewMessage } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const claudeDir = resolveClaudeDir();
  const bridgePath = path.join(claudeDir, '.vscode-todos-bridge', 'sessions.json');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const todosDir = path.join(claudeDir, 'todos');
  const hookScriptPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'hooks', 'sessionStart.js').fsPath;
  const hookCommand = `node "${hookScriptPath}"`;

  const bridge = new BridgeFile(bridgePath);
  const parser = new TodosParser(todosDir);
  const resolver = new SessionResolver(bridge, () => {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath ?? null;
  });
  const snapshotService = new SnapshotService(resolver, parser);
  const watcher = new TodosWatcher(claudeDir);
  const hookInstaller = new HookInstaller(settingsPath);
  context.subscriptions.push(watcher);

  let viewProvider!: TodosViewProvider;
  let panelProvider!: TodosPanelProvider;

  const handleMessage = (msg: WebviewMessage): void => {
    if (msg.type === 'openPanel') {
      vscode.commands.executeCommand('claudeTodos.openPanel');
    } else if (msg.type === 'refresh') {
      viewProvider.pushSnapshot();
      panelProvider.pushSnapshot();
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
      await promptInstallHook(hookInstaller, hookCommand, true);
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
  if (installer.isInstalled(command)) return;
  if (context.globalState.get<boolean>('hookPromptDismissed')) return;

  const choice = await vscode.window.showInformationMessage(
    'Claude Todos needs to install a SessionStart hook in ~/.claude/settings.json to detect which Claude Code session belongs to this workspace.',
    'Install',
    'Not now',
    "Don't ask again",
  );

  if (choice === 'Install') {
    try {
      installer.install(command);
      vscode.window.showInformationMessage('Claude Todos hook installed. Start a new Claude Code session to begin tracking.');
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to install hook: ${String(err)}`);
    }
  } else if (choice === "Don't ask again") {
    await context.globalState.update('hookPromptDismissed', true);
  }
}

async function promptInstallHook(
  installer: HookInstaller,
  command: string,
  force: boolean,
): Promise<void> {
  if (installer.isInstalled(command) && !force) {
    vscode.window.showInformationMessage('Claude Todos hook already installed.');
    return;
  }

  try {
    installer.install(command);
    vscode.window.showInformationMessage('Claude Todos hook installed. Start a new Claude Code session to begin tracking.');
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to install hook: ${String(err)}`);
  }
}
