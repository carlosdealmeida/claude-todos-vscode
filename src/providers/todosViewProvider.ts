import * as vscode from 'vscode';
import { buildWebviewHtml } from '../webview/html';
import type { SessionSnapshot, ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
import { resolveLocale } from '../localeResolver';
import { readUiTheme } from '../themeSetting';
import type { UiThemeId } from '../themes';

export class TodosViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'claudeTodos.view';
  private view: vscode.WebviewView | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly buildSnapshot: () => SessionSnapshot | null,
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
        this.pushAppearance();
        this.pushSnapshot();
      }
      this.onWebviewMessage(msg);
    });
    view.onDidDispose(() => { this.view = null; });
  }

  pushSnapshot(): void {
    if (!this.view) return;
    const snapshot = this.buildSnapshot();
    const msg: ExtensionMessage = { type: 'snapshot', snapshot };
    this.view.webview.postMessage(msg);
  }

  pushLocale(): void {
    if (!this.view) return;
    const msg: ExtensionMessage = { type: 'locale', locale: resolveLocale() };
    this.view.webview.postMessage(msg);
  }

  // theme opcional: o QuickPick manda o tema em previa, sem gravar a setting.
  pushAppearance(theme: UiThemeId = readUiTheme()): void {
    if (!this.view) return;
    const msg: ExtensionMessage = { type: 'appearance', theme };
    this.view.webview.postMessage(msg);
  }

  pushProjectUsage(usage: ProjectUsage | null): void {
    if (!this.view) return;
    const msg: ExtensionMessage = { type: 'projectUsage', usage };
    this.view.webview.postMessage(msg);
  }
}
