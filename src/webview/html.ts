import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { readUiTheme } from '../themeSetting';

export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'index.css'),
  );
  const nonce = generateNonce();

  // readUiTheme devolve so ids do registro: seguro de interpolar.
  return /* html */ `<!DOCTYPE html>
<html lang="en" data-ct-theme="${readUiTheme()}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;
             font-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Claude Todos</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function generateNonce(): string {
  // Cryptographically secure: a CSP nonce must be unpredictable.
  return randomBytes(16).toString('hex');
}
