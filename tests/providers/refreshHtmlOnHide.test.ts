import { describe, it, expect } from 'vitest';
import { refreshHtmlOnHide } from '../../src/providers/refreshHtmlOnHide';

function fakeView() {
  let listener: (() => void) | null = null;
  return {
    visible: true,
    webview: { html: 'inicial' },
    onDidChangeVisibility(cb: () => void) { listener = cb; },
    fire(visible: boolean) { this.visible = visible; listener?.(); },
  };
}

describe('refreshHtmlOnHide', () => {
  it('ao esconder, regrava o HTML com o estado atual', () => {
    const view = fakeView();
    let theme = 'classic';
    refreshHtmlOnHide(view, () => `tema=${theme}`);
    theme = 'papel';
    view.fire(false);
    expect(view.webview.html).toBe('tema=papel');
  });

  // Atribuir html numa webview visivel recarrega o painel na frente do usuario.
  it('ao mostrar, nao mexe no HTML', () => {
    const view = fakeView();
    refreshHtmlOnHide(view, () => 'novo');
    view.fire(true);
    expect(view.webview.html).toBe('inicial');
  });
});
