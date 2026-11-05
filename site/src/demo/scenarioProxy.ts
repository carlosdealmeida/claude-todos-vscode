import type { ExtensionMessage } from '../../../src/types';
import type { UiThemeId } from '../../../src/themes';
import type { DemoBridge } from './demoBridge';

export type ScenarioProxy = DemoBridge & { setInner(next: DemoBridge): void };

// window.__claudeTodosDemo so pode ser atribuido uma vez: src/webview/stores.svelte.ts
// le essa variavel ao carregar o modulo e nunca mais relê window. Para trocar de
// roteiro sem remontar o App, este proxy e o unico objeto que a pagina injeta em
// window; ele delega para o DemoBridge "de verdade", que muda a cada cenario.
export function createScenarioProxy(): ScenarioProxy {
  let inner: DemoBridge | null = null;
  let handler: ((msg: ExtensionMessage) => void) | null = null;
  let picked: UiThemeId | null = null;
  return {
    onMessage(next) {
      handler = next;
      inner?.onMessage(next);
    },
    post(msg) {
      inner?.post(msg);
      // O seletor funciona antes do chunk do painel chegar, e sem handler a mensagem
      // se perde. Como nos hosts, quem responde ao `ready` entrega o tema.
      if (msg.type === 'ready' && picked) inner?.pushAppearance(picked);
    },
    pushSnapshot(s) { inner?.pushSnapshot(s); },
    pushLocale(l) { inner?.pushLocale(l); },
    pushAppearance(t) {
      picked = t;
      inner?.pushAppearance(t);
    },
    setInner(next) {
      inner = next;
      // O handler foi capturado uma unica vez por stores.svelte.ts; cada
      // bridge novo precisa recebe-lo de volta explicitamente, senao os
      // snapshots do roteiro novo nunca chegam ao painel ja montado.
      if (handler) inner.onMessage(handler);
    },
  };
}
