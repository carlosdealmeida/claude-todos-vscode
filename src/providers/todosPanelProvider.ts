import * as vscode from 'vscode';
import { buildWebviewHtml } from '../webview/html';
import type { SnapshotService } from '../services/snapshotService';
import type { ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
import { resolveLocale } from '../localeResolver';

export class TodosPanelProvider {
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly snapshotService: SnapshotService,
    private readonly onWebviewMessage: (msg: WebviewMessage) => void,
  ) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'claudeTodos.panel',
      'Claude Todos',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
      },
    );
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, this.extensionUri);
    this.panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      if (msg.type === 'ready') {
        this.pushLocale();
        this.pushSnapshot();
      }
      this.onWebviewMessage(msg);
    });
    this.panel.onDidDispose(() => { this.panel = null; });
  }

  pushSnapshot(): void {
    if (!this.panel) return;
    const msg: ExtensionMessage = { type: 'snapshot', snapshot: this.snapshotService.build() };
    this.panel.webview.postMessage(msg);
  }

  pushLocale(): void {
    if (!this.panel) return;
    const msg: ExtensionMessage = { type: 'locale', locale: resolveLocale() };
    this.panel.webview.postMessage(msg);
  }

  pushProjectUsage(usage: ProjectUsage | null): void {
    if (!this.panel) return;
    const msg: ExtensionMessage = { type: 'projectUsage', usage };
    this.panel.webview.postMessage(msg);
  }
}
