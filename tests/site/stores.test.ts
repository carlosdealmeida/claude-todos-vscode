import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isValidStore, refreshStores } from '../../site/scripts/fetchStores.mjs';

const STORES_JSON = path.join(__dirname, '..', '..', 'site', 'src', 'generated', 'stores.json');
const STORE_KEYS = ['vscode', 'openvsx', 'jetbrains'] as const;

describe('site/src/generated/stores.json (fallback versionado)', () => {
  // O ponto inteiro deste arquivo estar rastreado no git (ver site/.gitignore)
  // e o build nunca depender da rede — se ele nao existir, nao ha fallback e
  // este teste ja falha antes de qualquer outro tentar ler o conteudo.
  it('existe', () => {
    expect(fs.existsSync(STORES_JSON)).toBe(true);
  });

  const raw = fs.existsSync(STORES_JSON) ? fs.readFileSync(STORES_JSON, 'utf8') : null;
  const data = raw ? JSON.parse(raw) : null;

  it('conforma ao formato { fetchedAt, stores: { vscode, openvsx, jetbrains } }', () => {
    expect(typeof data?.fetchedAt).toBe('string');
    expect(Number.isNaN(new Date(data.fetchedAt).getTime())).toBe(false);
    expect(typeof data?.stores).toBe('object');
    for (const key of STORE_KEYS) {
      expect(data.stores).toHaveProperty(key);
    }
  });

  it('toda version casa /^\\d+\\.\\d+\\.\\d+$/', () => {
    for (const key of STORE_KEYS) {
      expect(data.stores[key].version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('rating, quando presente, fica entre 0 e 5, e ratingCount e inteiro >= 0', () => {
    for (const key of STORE_KEYS) {
      const store = data.stores[key];
      if (store.rating !== undefined) {
        expect(store.rating).toBeGreaterThanOrEqual(0);
        expect(store.rating).toBeLessThanOrEqual(5);
      }
      if (store.ratingCount !== undefined) {
        expect(Number.isInteger(store.ratingCount)).toBe(true);
        expect(store.ratingCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('cada loja do fallback passa isValidStore — a mesma validacao que protege uma escrita futura', () => {
    for (const key of STORE_KEYS) {
      expect(isValidStore(data.stores[key])).toBe(true);
    }
  });
});

describe('isValidStore', () => {
  it('aceita uma entrada bem formada', () => {
    expect(isValidStore({ version: '1.2.3', url: 'https://x' })).toBe(true);
    expect(isValidStore({ version: '1.2.3', rating: 4.5, ratingCount: 10, url: 'https://x' })).toBe(true);
  });

  it('rejeita versao fora do formato semver simples', () => {
    expect(isValidStore({ version: '1.2' })).toBe(false);
    expect(isValidStore({ version: 'v1.2.3' })).toBe(false);
    expect(isValidStore({ version: '1.2.3-beta' })).toBe(false);
  });

  it('rejeita ausencia/tipo errado de versao — o caso de uma API que mudou de contrato', () => {
    expect(isValidStore({})).toBe(false);
    expect(isValidStore({ version: 42 })).toBe(false);
    expect(isValidStore(null)).toBe(false);
    expect(isValidStore(undefined)).toBe(false);
  });

  it('rejeita rating fora de [0,5]', () => {
    expect(isValidStore({ version: '1.0.0', rating: 5.1 })).toBe(false);
    expect(isValidStore({ version: '1.0.0', rating: -0.1 })).toBe(false);
  });

  it('rejeita ratingCount fracionario ou negativo', () => {
    expect(isValidStore({ version: '1.0.0', ratingCount: 1.5 })).toBe(false);
    expect(isValidStore({ version: '1.0.0', ratingCount: -1 })).toBe(false);
  });
});

describe('refreshStores — nucleo puro (sem rede), fetchers injetados', () => {
  const previous = {
    fetchedAt: '2026-08-11T00:00:00.000Z',
    stores: {
      vscode: { version: '0.17.0', rating: 5, ratingCount: 1, url: 'https://a' },
      openvsx: { version: '0.17.0', url: 'https://b' },
      jetbrains: { version: '0.17.0', url: 'https://c' },
    },
  };

  it('quando as tres respostas sao validas E diferentes do que ja estava salvo, atualiza as tres, avanca fetchedAt e marca changed:true', async () => {
    const fetchers = {
      vscode: async () => ({ version: '0.18.0', rating: 5, ratingCount: 2, url: 'https://a' }),
      openvsx: async () => ({ version: '0.18.0', url: 'https://b' }),
      jetbrains: async () => ({ version: '0.18.0', url: 'https://c' }),
    };
    const { data, warnings, changed } = await refreshStores({ previous, fetchers, now: () => '2026-08-20T00:00:00.000Z' });
    expect(warnings).toHaveLength(0);
    expect(changed).toBe(true);
    expect(data.fetchedAt).toBe('2026-08-20T00:00:00.000Z');
    for (const key of STORE_KEYS) {
      expect(data.stores[key].version).toBe('0.18.0');
    }
  });

  // O cenario do dia a dia (fix round 1 do code review): as tres APIs estao
  // de pe e respondem normalmente, mas devolvem EXATAMENTE o que ja estava
  // salvo — a extensao nao e relancada todo dia, entao esse e o caso comum,
  // nao o raro. Uma primeira versao deste script usava "algum fetch teve
  // sucesso?" como proxy para "algo mudou?"; isso e falso aqui: as tres tem
  // sucesso, mas fetchedAt NAO deveria avancar, porque nenhum VALOR mudou.
  // Sem esta trava, o workflow de refresh diario (que so commita quando
  // stores.json muda) commitaria e redeployaria o site TODO DIA so por
  // causa do timestamp, mesmo sem nenhum dado novo — exatamente o "commit
  // vazio diario" que o brief da task pede para nunca acontecer.
  it('quando as tres respostas sao validas mas IDENTICAS as ja salvas, nao avanca fetchedAt e marca changed:false', async () => {
    const fetchers = {
      vscode: async () => ({ version: '0.17.0', rating: 5, ratingCount: 1, url: 'https://a' }),
      openvsx: async () => ({ version: '0.17.0', url: 'https://b' }),
      jetbrains: async () => ({ version: '0.17.0', url: 'https://c' }),
    };
    const { data, warnings, changed } = await refreshStores({ previous, fetchers, now: () => '2026-08-20T00:00:00.000Z' });
    expect(warnings).toHaveLength(0);
    expect(changed).toBe(false);
    expect(data.fetchedAt).toBe(previous.fetchedAt);
    expect(data).toEqual(previous);
  });

  // Mesmo cenario acima, mas o fetcher devolve as MESMAS chaves em ordem
  // diferente do que esta salvo (`url` antes de `rating`/`ratingCount`,
  // como uma API real pode fazer sem que isso signifique mudanca nenhuma de
  // conteudo). A comparacao precisa ser por VALOR, nao por
  // JSON.stringify ingenuo sensivel a ordem de insercao — do contrario esta
  // reordenacao sozinha (sem nenhum dado novo) seria lida como "mudou" e
  // reintroduziria o mesmo bug do teste acima por uma porta lateral.
  it('reordenar as mesmas chaves/valores nao conta como mudanca (comparacao insensivel a ordem)', async () => {
    const fetchers = {
      vscode: async () => ({ url: 'https://a', ratingCount: 1, rating: 5, version: '0.17.0' }),
      openvsx: async () => ({ url: 'https://b', version: '0.17.0' }),
      jetbrains: async () => ({ url: 'https://c', version: '0.17.0' }),
    };
    const { data, warnings, changed } = await refreshStores({ previous, fetchers, now: () => '2026-08-20T00:00:00.000Z' });
    expect(warnings).toHaveLength(0);
    expect(changed).toBe(false);
    expect(data.fetchedAt).toBe(previous.fetchedAt);
    expect(data).toEqual(previous);
  });

  it('ao menos uma resposta com valor diferente e o bastante para changed:true e fetchedAt avancar, mesmo se as outras duas forem identicas', async () => {
    const fetchers = {
      vscode: async () => ({ version: '0.17.0', rating: 5, ratingCount: 1, url: 'https://a' }), // identico
      openvsx: async () => ({ version: '0.18.0', url: 'https://b' }), // mudou
      jetbrains: async () => ({ version: '0.17.0', url: 'https://c' }), // identico
    };
    const { data, warnings, changed } = await refreshStores({ previous, fetchers, now: () => '2026-08-20T00:00:00.000Z' });
    expect(warnings).toHaveLength(0);
    expect(changed).toBe(true);
    expect(data.fetchedAt).toBe('2026-08-20T00:00:00.000Z');
    expect(data.stores.vscode).toEqual(previous.stores.vscode);
    expect(data.stores.openvsx.version).toBe('0.18.0');
    expect(data.stores.jetbrains).toEqual(previous.stores.jetbrains);
  });

  // O caminho mais importante desta task: as tres lojas fora do ar (timeout
  // ou host inalcancavel) nao pode derrubar o build. refreshStores precisa
  // devolver o stores.json INTEIRO igual ao anterior, mais um aviso por loja
  // nomeando qual e o motivo.
  it('quando as tres falham (host inalcancavel), mantem o arquivo inteiro e avisa nomeando cada loja', async () => {
    const fetchers = {
      vscode: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:1');
      },
      openvsx: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:1');
      },
      jetbrains: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:1');
      },
    };
    const { data, warnings, changed } = await refreshStores({ previous, fetchers, now: () => '2026-08-20T00:00:00.000Z' });
    expect(changed).toBe(false);
    expect(data.stores).toEqual(previous.stores);
    expect(warnings).toHaveLength(3);
    expect(warnings.some((w) => w.includes('vscode'))).toBe(true);
    expect(warnings.some((w) => w.includes('openvsx'))).toBe(true);
    expect(warnings.some((w) => w.includes('jetbrains'))).toBe(true);
    // "mantem o arquivo inteiro" e literal: fetchedAt tambem fica intacto,
    // nao so `stores` — do contrario o workflow de refresh diario (que so
    // commita quando o arquivo muda) commitaria todo dia so por causa do
    // timestamp, mesmo num dia em que as tres APIs estao fora do ar.
    expect(data.fetchedAt).toBe(previous.fetchedAt);
    expect(data).toEqual(previous);
  });

  it('trata uma resposta em formato inesperado como falha — nao escreve lixo, mantem o valor anterior so daquela loja', async () => {
    const fetchers = {
      // Simula uma API que mudou de contrato: sem campo `version`.
      vscode: async () => ({ notAVersion: true }),
      openvsx: async () => ({ version: '0.18.0', url: 'https://b' }),
      jetbrains: async () => {
        throw new Error('timeout');
      },
    };
    const { data, warnings } = await refreshStores({ previous, fetchers });
    expect(data.stores.vscode).toEqual(previous.stores.vscode);
    expect(data.stores.openvsx.version).toBe('0.18.0');
    expect(data.stores.jetbrains).toEqual(previous.stores.jetbrains);
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes('vscode') && w.includes('formato'))).toBe(true);
  });
});
