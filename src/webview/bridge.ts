import type { ExtensionMessage, WebviewMessage } from '../types';

export interface WebviewBridge {
  post(msg: WebviewMessage): void;
  onMessage(handler: (msg: ExtensionMessage) => void): void;
}

interface VsCodeApi { postMessage(msg: WebviewMessage): void; }
declare function acquireVsCodeApi(): VsCodeApi;

export function createVscodeBridge(
  win: Pick<Window, 'addEventListener'> = window,
  acquire: () => VsCodeApi = acquireVsCodeApi,
): WebviewBridge {
  const api = acquire();
  return {
    post: (msg) => api.postMessage(msg),
    onMessage: (handler) => {
      win.addEventListener('message', (event) => {
        handler((event as MessageEvent).data as ExtensionMessage);
      });
    },
  };
}

// Host JCEF (plugin JetBrains): o Kotlin injeta `window.__jcefPost` (JBCefJSQuery)
// antes do load e entrega mensagens via `window.postMessage` — o listener fica
// idêntico ao do VS Code.
interface JcefWindow extends Pick<Window, 'addEventListener'> {
  __jcefPost(json: string): void;
}

export function createJcefBridge(win: JcefWindow = window as unknown as JcefWindow): WebviewBridge {
  return {
    post: (msg) => win.__jcefPost(JSON.stringify(msg)),
    onMessage: (handler) => {
      win.addEventListener('message', (event) => {
        handler((event as MessageEvent).data as ExtensionMessage);
      });
    },
  };
}

export function createBridge(): WebviewBridge {
  return typeof acquireVsCodeApi !== 'undefined' ? createVscodeBridge() : createJcefBridge();
}
