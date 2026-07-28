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
//   1. escapeHtml    - escapa &, <, >, " e ' no texto de origem. Tem que vir
//                       primeiro: escapar depois destruiria as tags
//                       <strong>/<code>/<a> que os passos seguintes geram. As
//                       aspas importam tanto quanto & / < / >: rewriteLinks
//                       (passo 3) encaixa a URL dentro de um atributo
//                       href="..." - uma aspa dupla crua ali escaparia do
//                       atributo e deixaria injetar um atributo HTML novo.
//   2. inlineMarkdown - converte **negrito** -> <strong> e `codigo` -> <code>.
//                       Cobre so esses dois construtos, que sao os unicos que
//                       ocorrem nas bullets/install/privacy dos cinco READMEs
//                       (conferido manualmente) - nao e um parser markdown
//                       generico (sem italico, listas aninhadas, etc.). Os
//                       spans de codigo sao protegidos ANTES do negrito (ver
//                       comentario na funcao) para um `**` dentro de crases
//                       nao vazar um <strong> para dentro do <code>.
//   3. rewriteLinks   - converte [texto](url) em <a href="url">texto</a>, com a
//                       mesma logica de reescrita de URL de sempre (relativo ->
//                       GitHub, `screenshots/` -> public/, absoluto/ancora
//                       inalterado).
//
// O risco de injecao real hoje e baixo (o markdown vem dos READMEs versionados
// neste repo, nao de input de usuario em runtime), mas qualquer contribuidor
// pode editar um README, e o resultado vai direto para o set:html de uma
// pagina publica - escapar primeiro (inclusive aspas) e defesa em
// profundidade barata para esse caminho.
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Caractere NUL (codigo 0) cercando o indice do span no marcador temporario
// usado para tirar um span de codigo do texto (ver inlineMarkdown abaixo).
// Nunca ocorre em markdown real escrito por humanos - os READMEs sao texto
// comum -, entao nao ha risco de um marcador colidir com o proprio conteudo,
// ao contrario de um marcador feito so de digitos/espacos visiveis (um bullet
// do tipo "nota de 0 a 10" poderia coincidir por acaso e ser trocado pelo
// pedaco errado).
const NUL = String.fromCharCode(0);
const CODE_PLACEHOLDER_RE = new RegExp(`${NUL}(\\d+)${NUL}`, 'g');

// Os spans de codigo tem que ser extraidos ANTES do negrito. Se rodassemos o
// regex de negrito primeiro, um trecho como `a ** b ** c` (duas ocorrencias de
// "**" dentro do mesmo par de crases) casaria o "**...**" atraves do code span
// e injetaria um <strong> aninhado dentro do <code> final - o `dist/**/*.ts`
// que os READMEs realmente usam funciona hoje "por acidente" (so tem UM par de
// "**", entao o regex de negrito nunca acha um segundo delimitador), nao por
// design. Para evitar isso: tiramos os spans de codigo do texto para
// marcadores temporarios, so entao aplicamos o negrito no resto, e por fim
// reinserimos os spans (ja como <code>...</code>) no lugar dos marcadores.
function inlineMarkdown(text) {
  const codeSpans = [];
  const withoutCode = text.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `${NUL}${codeSpans.length}${NUL}`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });
  const withBold = withoutCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return withBold.replace(CODE_PLACEHOLDER_RE, (_match, index) => codeSpans[Number(index)]);
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
  // vem primeiro na lista (caso do pt-br, onde Portugues e o primeiro item) -
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
  // (negrito, codigo, links) - a estrutura da tabela (`| celula | celula |`,
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
// file URL valida por concatenacao simples - a comparacao ingenua nunca bate
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
