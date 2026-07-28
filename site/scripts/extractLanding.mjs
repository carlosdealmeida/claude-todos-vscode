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

// Links relativos so fazem sentido dentro do repo; no site apontam para o GitHub.
// `screenshots/` e a excecao: os arquivos sao copiados para public/.
function rewriteLinks(text) {
  return text.replace(/\]\((?!https?:|#)([^)]+)\)/g, (_match, target) =>
    target.startsWith('screenshots/') ? `](/claude-todos-vscode/${target})` : `](${REPO}/${target})`);
}

export function extractLanding(markdown) {
  const sections = splitSections(markdown);

  // A tagline e o primeiro paragrafo inteiramente em negrito, antes da 1a secao.
  // O seletor de idioma tambem comeca com "**" quando o idioma da propria pagina
  // vem primeiro na lista (caso do pt-br, onde Portugues e o primeiro item) —
  // por isso descartamos linhas que contem links markdown "](", que so aparecem
  // no seletor, nunca na tagline.
  const head = markdown.split('\n## ')[0];
  const taglineLine = head.split('\n').find((l) => l.startsWith('**') && !l.includes('](')) ?? '';
  const tagline = taglineLine.replace(/\*\*/g, '').trim();

  const featureBody = sections[SECTION.FEATURES]?.body ?? '';
  const features = featureBody
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => rewriteLinks(l.slice(2).trim()));

  return {
    tagline,
    features,
    install: rewriteLinks(sections[SECTION.INSTALL]?.body ?? ''),
    privacy: rewriteLinks(sections[SECTION.PRIVACY]?.body ?? ''),
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
