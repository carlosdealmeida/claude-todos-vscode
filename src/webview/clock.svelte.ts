// Relógio compartilhado do webview: um único setInterval atualiza `now` a cada
// segundo, para que as durações ao vivo (task in_progress) avancem mesmo quando
// nenhum novo snapshot chega. Lido reativamente como `clock.now`.
export const clock = $state({ now: Date.now() });

setInterval(() => {
  clock.now = Date.now();
}, 1000);
