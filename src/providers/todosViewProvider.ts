import * as vscode from 'vscode';
import { buildWebviewHtml } from '../webview/html';
import type { SnapshotService } from '../services/snapshotService';
import type { ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
import { resolveLocale } from '../localeResolver';

export class TodosViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'claudeTodos.view';
  private view: vscode.WebviewView | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly snapshotService: SnapshotService,
    private readonly onWebviewMessage: (msg: WebviewMessage) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    view.webview.html = buildWebviewHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      if (msg.type === 'ready') {
        this.pushLocale();
        this.pushSnapshot();
      }
      this.onWebviewMessage(msg);
    });
    view.onDidDispose(() => { this.view = null; });
  }

  pushSnapshot(): void {
    if (!this.view) return;
    const snapshot = this.snapshotService.build();
    const msg: ExtensionMessage = { type: 'snapshot', snapshot };
    this.view.webview.postMessage(msg);
  }

  pushLocale(): void {
    if (!this.view) return;
    const msg: ExtensionMessage = { type: 'locale', locale: resolveLocale() };
    this.view.webview.postMessage(msg);
  }

  pushProjectUsage(usage: ProjectUsage | null): void {
    if (!this.view) return;
    const msg: ExtensionMessage = { type: 'projectUsage', usage };
    this.view.webview.postMessage(msg);
  }
}
