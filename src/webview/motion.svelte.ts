// Preferência de movimento reduzido, lida reativamente como `motion.reduced`. O
// spinner do StatusIcon é SMIL: nem o app.css nem o CSS dos componentes o param.
// Dois sinais: a media query do sistema, e a classe que o VS Code põe no body da
// webview quando `workbench.reduceMotion` está ligado, sem mexer na media query.
const query = window.matchMedia('(prefers-reduced-motion: reduce)');

const read = (): boolean => query.matches || document.body.classList.contains('vscode-reduce-motion');

export const motion = $state({ reduced: read() });

const update = (): void => {
  motion.reduced = read();
};

query.addEventListener('change', update);
new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
