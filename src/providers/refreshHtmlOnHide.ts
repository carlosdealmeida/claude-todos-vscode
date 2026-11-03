// A view da sidebar não tem retainContextWhenHidden: cada reabertura recria o
// iframe a partir do html gravado. Regravar ao esconder faz o data-ct-theme
// acompanhar a escolha, sem recarregar nada na frente do usuário.
export function refreshHtmlOnHide(
  view: {
    readonly visible: boolean;
    readonly webview: { html: string };
    onDidChangeVisibility(listener: () => void): unknown;
  },
  build: () => string,
): void {
  view.onDidChangeVisibility(() => {
    if (!view.visible) view.webview.html = build();
  });
}
