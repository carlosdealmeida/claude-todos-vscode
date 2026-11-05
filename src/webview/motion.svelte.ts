// Preferência de movimento reduzido, lida reativamente como `motion.reduced`. O
// spinner do StatusIcon é SMIL: nem a media query do app.css nem o CSS o param.
const query = window.matchMedia('(prefers-reduced-motion: reduce)');

export const motion = $state({ reduced: query.matches });

query.addEventListener('change', (e) => {
  motion.reduced = e.matches;
});
