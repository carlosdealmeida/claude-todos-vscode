// Harness de screenshots: monta a webview REAL com uma bridge de fixture.
// Parametros pela URL: ?mode=dark|light&theme=<id>&case=<caso>
// A bridge responde ao `ready` com locale, appearance (quando o host ja
// suporta) e o snapshot do caso.
import script from '../../site/src/demo/scripts/smoke-test.json';
// Mesma ordem do site (LandingLayout.astro): app.css antes de theme.css.
import '../../src/webview/app.css';
import '../../site/src/demo/theme.css';
import type { WebviewBridge } from '../../src/webview/bridge';
import type { ExtensionMessage } from '../../src/types';
import { caseSnapshot, type ShotCase, type ShotScript } from './cases';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'light' ? 'light' : 'dark';
const theme = params.get('theme') ?? 'classic';
const shotCase = (params.get('case') ?? 'live') as ShotCase;
const shot = script as unknown as ShotScript;

// Simula os dois sinais de modo: a classe que o VS Code poe no body e o
// data-theme que o theme.css do site usa para trocar as --vscode-*.
document.documentElement.dataset.theme = mode;
document.body.classList.add(mode === 'light' ? 'vscode-light' : 'vscode-dark');

let handler: ((m: ExtensionMessage) => void) | null = null;
const send = (m: ExtensionMessage) => handler?.(m);
const bridge: WebviewBridge = {
  onMessage(h) { handler = h; },
  post(msg) {
    if (msg.type === 'projectUsage') {
      send({ type: 'projectUsage', usage: shot.projectUsage });
      return;
    }
    if (msg.type !== 'ready') return;
    send({ type: 'locale', locale: 'pt-br' });
    // Antes da Task 5 a mensagem 'appearance' nao existe: o store ignora.
    send({ type: 'appearance', theme } as unknown as ExtensionMessage);
    if (shotCase === 'error') send({ type: 'error', message: 'sidecar terminated' });
    else send({ type: 'snapshot', snapshot: caseSnapshot(shotCase, shot) });
  },
};
(window as unknown as { __claudeTodosDemo: WebviewBridge }).__claudeTodosDemo = bridge;

await import('../../src/webview/main');
document.body.dataset.ready = '1';
