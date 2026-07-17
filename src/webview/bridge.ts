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

export function createJcefBridge(): WebviewBridge {
  throw new Error('jcef bridge não implementada — chega no SP1');
}

export function createBridge(): WebviewBridge {
  return typeof acquireVsCodeApi !== 'undefined' ? createVscodeBridge() : createJcefBridge();
}
