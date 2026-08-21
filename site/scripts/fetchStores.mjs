import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Le versao + avaliacao das tres lojas onde a extensao e publicada, em
// paralelo, e grava site/src/generated/stores.json. Chamado no `prebuild`
// (ver site/package.json).
//
// Contrato desta task (task-2-brief.md): qualquer falha de rede, timeout ou
// mudanca de formato de UMA loja e nao-fatal — mantem o valor anterior
// daquela loja e imprime um aviso nomeando loja + motivo. Se as TRES
// falharem, o arquivo inteiro fica como estava e o processo sai com codigo
// 0: o build nunca quebra por indisponibilidade de terceiro. `isValidStore`
// e quem impede uma resposta de formato inesperado (API mudou de contrato)
// de ser gravada — tratada como falha, nunca como dado.

const TIMEOUT_MS = 8000;
// Ancorado no proprio arquivo (import.meta.url), NUNCA no CWD de quem
// chama. `npm run prebuild` roda com CWD = site/, onde 'src/generated/...'
// relativo ja acertava por coincidencia — mas .github/workflows/refresh-stores.yml
// chama `node site/scripts/fetchStores.mjs` a partir da RAIZ do repo, e la
// o mesmo caminho relativo resolvia para <raiz>/src/generated/stores.json
// (a arvore da extensao, que nao existe): ENOENT, exit 0, nenhum fetch
// acontecia, e o workflow diario nunca escrevia nada nem falhava — ver
// tests/site/stores.test.ts, describe "isMainModule / CLI", que roda este
// script como subprocesso a partir dos dois CWDs e prova que os dois
// escrevem no mesmo arquivo real.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(SCRIPT_DIR, '..', 'src', 'generated', 'stores.json');

// URLs sao overridaveis por variavel de ambiente de proposito: e o mecanismo
// que permite exercitar o caminho de falha (as tres APIs fora do ar) sem
// depender da rede real ou de desligar a rede da maquina — aponta as tres
// para um host que recusa conexao (ex.: http://127.0.0.1:1/) e roda
// `npm run prebuild`. Ver task-2-report.md para a saida registrada.
const ENDPOINTS = {
  vscode:
    process.env.STORES_VSCODE_URL ??
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
  openvsx:
    process.env.STORES_OPENVSX_URL ?? 'https://open-vsx.org/api/CarlosJunior1992/claude-todos',
  jetbrains:
    process.env.STORES_JETBRAINS_URL ??
    'https://plugins.jetbrains.com/api/plugins/33074/updates?size=1',
};

const VERSION_RE = /^\d+\.\d+\.\d+$/;

// Valida o FORMATO de uma entrada de loja antes que ela tenha qualquer
// chance de ser gravada em disco — usado tanto para a resposta recem-lida de
// uma API quanto (nos testes) para o proprio fallback versionado. `rating` e
// `ratingCount` sao opcionais (Open VSX e JetBrains, nos endpoints
// verificados no brief, nao expoem avaliacao) mas, quando presentes,
// precisam estar num intervalo plausivel — um numero fora de [0,5] ou um
// ratingCount fracionario/negativo e o tipo de coisa que so aconteceria com
// uma API que mudou de contrato.
export function isValidStore(store) {
  if (!store || typeof store !== 'object') return false;
  if (typeof store.version !== 'string' || !VERSION_RE.test(store.version)) return false;
  if (store.rating !== undefined) {
    if (typeof store.rating !== 'number' || Number.isNaN(store.rating)) return false;
    if (store.rating < 0 || store.rating > 5) return false;
  }
  if (store.ratingCount !== undefined) {
    if (!Number.isInteger(store.ratingCount) || store.ratingCount < 0) return false;
  }
  return true;
}

// Comparacao profunda, insensivel a ordem das chaves — usada para decidir se
// uma loja MUDOU DE VALOR (nao so "o fetch teve sucesso"). Precisa ser
// insensivel a ordem porque um fetcher pode devolver as mesmas chaves em
// ordem diferente da que ja esta em disco (ex.: `{version,url}` vs
// `{version,rating,ratingCount,url}` reordenado) sem que o CONTEUDO tenha
// mudado; um `JSON.stringify` ingenuo (que respeita ordem de insercao)
// acusaria uma mudanca que nao existe. So arrays/objetos simples (o formato
// de uma entrada de loja), sem Date/Map/Set — nao e um deep-equal generico.
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepEqualStore(a, b) {
  return stableStringify(a) === stableStringify(b);
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// VS Code Marketplace: POST extensionquery. Ver task-2-brief.md para os
// campos exatos (`versions[0].version`, `statistics[]` -> averagerating /
// ratingcount) — verificados manualmente em 2026-08-11.
async function fetchVscode() {
  const json = await fetchJson(ENDPOINTS.vscode, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=7.2-preview.1',
    },
    body: JSON.stringify({
      filters: [{ criteria: [{ filterType: 7, value: 'CarlosJunior1992.claude-todos' }] }],
      flags: 914,
    }),
  });
  const ext = json?.results?.[0]?.extensions?.[0];
  const version = ext?.versions?.[0]?.version;
  const statistics = Array.isArray(ext?.statistics) ? ext.statistics : [];
  const rating = statistics.find((s) => s?.statisticName === 'averagerating')?.value;
  const ratingCountRaw = statistics.find((s) => s?.statisticName === 'ratingcount')?.value;
  const store = {
    version,
    url: 'https://marketplace.visualstudio.com/items?itemName=CarlosJunior1992.claude-todos',
  };
  if (typeof rating === 'number') store.rating = rating;
  if (typeof ratingCountRaw === 'number') store.ratingCount = Math.round(ratingCountRaw);
  return store;
}

async function fetchOpenVsx() {
  const json = await fetchJson(ENDPOINTS.openvsx);
  return {
    version: json?.version,
    url: 'https://open-vsx.org/extension/CarlosJunior1992/claude-todos',
  };
}

async function fetchJetBrains() {
  const json = await fetchJson(ENDPOINTS.jetbrains);
  return {
    version: json?.[0]?.version,
    url: 'https://plugins.jetbrains.com/plugin/33074-claude-todos',
  };
}

export const DEFAULT_FETCHERS = {
  vscode: fetchVscode,
  openvsx: fetchOpenVsx,
  jetbrains: fetchJetBrains,
};

// Nucleo puro, sem I/O de arquivo: recebe o conteudo anterior de stores.json
// e um mapa { chave: () => Promise<store> } (injetavel — e o que permite
// tests/site/stores.test.ts exercitar o caminho de falha sem rede nenhuma),
// devolve os dados novos + a lista de avisos. Nunca rejeita: cada fetcher e
// isolado em try/catch, entao uma loja falhando nunca derruba as outras nem
// o chamador.
export async function refreshStores({ previous, fetchers, now = () => new Date().toISOString() }) {
  const stores = { ...previous.stores };
  const warnings = [];

  const settled = await Promise.all(
    Object.entries(fetchers).map(async ([key, fetchStore]) => {
      try {
        const store = await fetchStore();
        if (!isValidStore(store)) {
          return { key, ok: false, reason: 'formato de resposta inesperado (API pode ter mudado de contrato)' };
        }
        return { key, ok: true, store };
      } catch (err) {
        const reason = err?.name === 'AbortError' ? `timeout apos ${TIMEOUT_MS}ms` : String(err?.message ?? err);
        return { key, ok: false, reason };
      }
    }),
  );

  // `changedAny` mede se algum VALOR de loja de fato mudou — nao se algum
  // fetch teve sucesso. Essas duas coisas parecem a mesma coisa mas nao sao:
  // no dia a dia as tres APIs respondem normalmente e devolvem exatamente o
  // que ja estava salvo (a extensao nao e relancada todo dia). Uma primeira
  // versao deste script usava `settled.some(e => e.ok)` — isso da `true`
  // nesse cenario comum, avanca `fetchedAt` mesmo sem nenhum dado novo, e
  // faz o workflow de refresh diario (que so commita quando `stores.json`
  // muda) commitar TODO DIA so por causa do timestamp, disparando um
  // redeploy do site para atualizar um campo que a pagina nem renderiza.
  // Corrigido para comparar o CONTEUDO (`deepEqualStore`, insensivel a
  // ordem de chaves) contra o valor ja salvo — so entao uma loja conta como
  // "mudou". Quando o fetch tem sucesso mas o valor e identico ao anterior,
  // `stores[entry.key]` NAO e reatribuido: fica com a mesma referencia que
  // `{ ...previous.stores }` ja copiou, preservando a ordem de chaves
  // original — isso garante que, se nenhuma loja mudou de verdade, `stores`
  // sai byte-identico ao anterior quando serializado (nao so
  // "deep-equal"), o que por sua vez faz `fetchedAt` tambem ficar intacto
  // logo abaixo.
  let changedAny = false;
  for (const entry of settled) {
    if (entry.ok) {
      const prevStore = previous.stores[entry.key];
      if (!deepEqualStore(entry.store, prevStore)) {
        stores[entry.key] = entry.store;
        changedAny = true;
      }
    } else {
      warnings.push(`loja ${entry.key}: ${entry.reason} — mantendo versao anterior`);
    }
  }

  const fetchedAt = changedAny ? now() : previous.fetchedAt;

  return { data: { fetchedAt, stores }, warnings, changed: changedAny };
}

// Executado como script (npm run prebuild). Comparacao via pathToFileURL
// (nao string concatenada com `file://`) pelo mesmo motivo de
// extractLanding.mjs: no Windows, process.argv[1] usa backslashes e drive
// letters que nao formam uma file URL valida por concatenacao simples.
const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  let previous;
  try {
    previous = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch (err) {
    // O fallback versionado deveria sempre existir e ser JSON valido (e o
    // que tests/site/stores.test.ts trava). Se por algum motivo nao existir
    // ou estiver corrompido no working tree, nao ha "valor anterior" para
    // preservar — registra o aviso e sai 0 sem tentar escrever nada, em vez
    // de quebrar o build por um problema que nao e de terceiro.
    console.warn(`[fetchStores] nao foi possivel ler ${OUT_PATH} (${err.message}); nada para atualizar.`);
    process.exit(0);
  }

  const { data, warnings, changed } = await refreshStores({ previous, fetchers: DEFAULT_FETCHERS });

  for (const warning of warnings) {
    console.warn(`[fetchStores] aviso: ${warning}`);
  }

  const okCount = Object.keys(data.stores).length - warnings.length;
  const totalCount = Object.keys(data.stores).length;

  // So regrava o arquivo quando algum valor de loja de fato mudou. Escrever
  // de qualquer forma (mesmo com conteudo identico) seria inofensivo para o
  // git (sem diff de bytes), mas nao escrever e mais direto de raciocinar
  // sobre — nao ha nenhum caminho em que este processo toca o arquivo em
  // disco sem uma razao real, o que e o que o workflow de refresh diario
  // depende para nunca commitar a toa (ver .github/workflows/refresh-stores.yml).
  if (changed) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
    console.log(
      `[fetchStores] ${OUT_PATH} atualizado — ${okCount}/${totalCount} lojas ok` +
        (warnings.length ? `, ${warnings.length} com aviso (valor anterior mantido).` : '.'),
    );
  } else {
    console.log(
      `[fetchStores] ${OUT_PATH} sem mudanca — nao regravado (${okCount}/${totalCount} lojas ok` +
        (warnings.length ? `, ${warnings.length} com aviso, valor anterior mantido).` : ').'),
    );
  }
}
