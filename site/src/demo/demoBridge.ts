import type { WebviewBridge } from '../../../src/webview/bridge';
import type { ExtensionMessage, SessionSnapshot, WebviewMessage } from '../../../src/types';
import type { Locale } from '../../../src/i18n/locale';
import type { DemoScript } from './types';
import type { Player } from './player';

export interface DemoBridgeDeps {
  script: DemoScript;
  player: Player;
  locale: Locale;
  onOpenSource(sessionId: string, agentId: string, line: number): void;
  onPickSession(): void;
}

export interface DemoBridge extends WebviewBridge {
  pushSnapshot(snapshot: SessionSnapshot): void;
  pushLocale(locale: Locale): void;
}

export function createDemoBridge(deps: DemoBridgeDeps): DemoBridge {
  let handler: ((msg: ExtensionMessage) => void) | null = null;
  const send = (msg: ExtensionMessage): void => { handler?.(msg); };

  return {
    onMessage(next) { handler = next; },

    post(msg: WebviewMessage) {
      switch (msg.type) {
        case 'ready':
          send({ type: 'locale', locale: deps.locale });
          deps.player.play();
          break;
        case 'refresh':
          // O player re-emite a cada tick; nada a fazer alem de nao quebrar.
          break;
        case 'projectUsage':
          send({ type: 'projectUsage', usage: deps.script.projectUsage });
          break;
        case 'openTodoSource':
          deps.onOpenSource(msg.sessionId, msg.agentId, msg.line);
          break;
        case 'pickSession':
          deps.onPickSession();
          break;
        case 'openPanel':
          // O painel ja esta visivel no site.
          break;
      }
    },

    pushSnapshot(snapshot) { send({ type: 'snapshot', snapshot }); },
    pushLocale(locale) { send({ type: 'locale', locale }); },
  };
}
