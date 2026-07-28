import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'https://github.com/carlosdealmeida/claude-todos-vscode/blob/master';

// Os cinco READMEs sao estruturalmente identicos (11 secoes, mesma ordem), so os
// titulos mudam de idioma. Por isso casamos por INDICE, nunca por titulo.
const SECTION = { FEATURES: 0, INSTALL: 2, PRIVACY: 5 };

const LOCALE_FILES = {
  en: 'README.en.md',
  'pt-br': 'README.md',
  es: 'README.es.md',
  'zh-cn': 'README.zh-cn.md',
  'zh-tw': 'README.zh-tw.md',
};

function splitSections(markdown) {
  const sections = [];
  let current = null;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
}

// O texto extraido e injetado no site com set:html (features, install, privacy),
// entao precisa virar HTML de verdade, nao markdown cru. `toHtml` faz isso em
// 3 passos, NESSA ORDEM:
//
//   1. escapeHtml    — escapa &, < e > no texto de origem. Tem que vir primeiro:
//                       escapar depois destruiria as tags <strong>/<code>/<a>
//                       que os passos seguintes geram.
//   2. inlineMarkdown — converte **negrito** -> <strong> e `codigo` -> <code>.
//                       Cobre so esses dois construtos, que sao os unicos que
//                       ocorrem nas bullets/install/privacy dos cinco READMEs
//                       (conferido manualmente) — nao e um parser markdown
//                       generico (sem italico, listas aninhadas, etc.).
//   3. rewriteLinks   — converte [texto](url) em <a href="url">texto</a>, com a
//                       mesma logica de reescrita de URL de sempre (relativo ->
//                       GitHub, `screenshots/` -> public/, absoluto/ancora
//                       inalterado).
//
// O risco de injecao real hoje e nulo (o markdown vem dos READMEs versionados
// neste repo, nao de input do usuario), mas escapar primeiro e defesa em
// profundidade barata dado que o destino e set:html.
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Links relativos so fazem sentido dentro do repo; no site apontam para o GitHub.
// `screenshots/` e a excecao: os arquivos sao copiados para public/.
function rewriteLinks(text) {
  return text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, label, target) => {
    const href = /^https?:|^#/.test(target)
      ? target
      : target.startsWith('screenshots/')
        ? `/claude-todos-vscode/${target}`
        : `${REPO}/${target}`;
    return `<a href="${href}">${label}</a>`;
  });
}

function toHtml(text) {
  return rewriteLinks(inlineMarkdown(escapeHtml(text)));
}

export function extractLanding(markdown) {
  const sections = splitSections(markdown);

  // A tagline e o primeiro paragrafo inteiramente em negrito, antes da 1a secao.
  // O seletor de idioma tambem comeca com "**" quando o idioma da propria pagina
  // vem primeiro na lista (caso do pt-br, onde Portugues e o primeiro item) —
  // por isso descartamos linhas que contem links markdown "](", que so aparecem
  // no seletor, nunca na tagline. A tagline nao passa por toHtml: e injetada via
  // interpolacao normal do Astro ({content.tagline}), que ja escapa sozinha, e
  // nunca teve negrito/codigo/link alem do "**" que ja removemos aqui.
  const head = markdown.split('\n## ')[0];
  const taglineLine = head.split('\n').find((l) => l.startsWith('**') && !l.includes('](')) ?? '';
  const tagline = taglineLine.replace(/\*\*/g, '').trim();

  const featureBody = sections[SECTION.FEATURES]?.body ?? '';
  const features = featureBody
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => toHtml(l.slice(2).trim()));

  // install/privacy sao tabelas markdown inteiras. toHtml converte so o inline
  // (negrito, codigo, links) — a estrutura da tabela (`| celula | celula |`,
  // separador `|---|---|`) fica como texto cru, nao vira <table>. Nenhuma pagina
  // consome essas duas strings hoje; quem for exibi-las precisa converter a
  // tabela para HTML antes (ou trocar para um parser markdown de verdade).
  return {
    tagline,
    features,
    install: toHtml(sections[SECTION.INSTALL]?.body ?? ''),
    privacy: toHtml(sections[SECTION.PRIVACY]?.body ?? ''),
  };
}

// Executado como script (npm run prebuild), gera o JSON consumido pelas paginas.
// Comparamos via pathToFileURL (nao string concatenada com `file://`) porque no
// Windows process.argv[1] usa backslashes e drive letters que nao formam uma
// file URL valida por concatenacao simples — a comparacao ingenua nunca bate
// e o script falha silenciosamente (nenhum arquivo, nenhum erro).
const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const root = path.resolve('..');
  const out = {};
  for (const [locale, file] of Object.entries(LOCALE_FILES)) {
    out[locale] = extractLanding(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  const outPath = path.join('src', 'generated', 'landing.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`landing extraida para ${outPath}`);
}
