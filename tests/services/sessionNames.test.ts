import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionNames } from '../../src/services/sessionNames';
import * as atomicWrite from '../../src/services/atomicWrite';

// Mock parcial: por padrao encaminha pra implementacao real (disco de verdade,
// como o resto do arquivo espera), so sobrescrito pontualmente nos testes de
// falha de escrita abaixo — spyOn direto no modulo 'fs' nao funciona aqui
// (ESM builtin, namespace nao configuravel).
vi.mock('../../src/services/atomicWrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/atomicWrite')>();
  return { ...actual, atomicWriteFileSync: vi.fn(actual.atomicWriteFileSync) };
});

describe('SessionNames', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'names-test-'));
    file = path.join(dir, 'bridge', 'session-names.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('get devolve undefined quando o arquivo nao existe', () => {
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  it('remember grava e get le de volta', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'meu-nome', 1000);
    expect(new SessionNames(file).get('s1')).toBe('meu-nome');
  });

  it('remember com o mesmo nome nao reescreve o arquivo', () => {
    // Conteúdo compacto (não pretty-printed): uma reescrita re-serializaria
    // com indentação e mudaria os bytes — o teste detecta qualquer write.
    const names = new SessionNames(file);
    names.remember('s1', 'meu-nome', 1000);
    const compact = fs.readFileSync(file, 'utf-8');
    names.remember('s1', 'meu-nome', 2000);
    expect(fs.readFileSync(file, 'utf-8')).toBe(compact);
  });

  it('remember com nome novo sobrescreve', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'antigo', 1000);
    names.remember('s1', 'novo', 2000);
    expect(names.get('s1')).toBe('novo');
  });

  it('entries devolve mapa sessionId -> nome numa unica leitura', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'nome-1', 1000);
    names.remember('s2', 'nome-2', 2000);
    expect(new SessionNames(file).entries()).toEqual({ s1: 'nome-1', s2: 'nome-2' });
  });

  it('entries devolve objeto vazio quando o arquivo nao existe', () => {
    expect(new SessionNames(file).entries()).toEqual({});
  });

  it('prune remove entradas mais velhas que a janela', () => {
    const names = new SessionNames(file);
    names.remember('velha', 'a', 1000);
    names.remember('nova', 'b', 50_000);
    names.prune(10_000, 55_000);
    expect(names.get('velha')).toBeUndefined();
    expect(names.get('nova')).toBe('b');
  });

  it('prune e no-op quando nao ha o que remover', () => {
    // Conteúdo compacto (não pretty-printed): uma reescrita re-serializaria
    // com indentação e mudaria os bytes — o teste detecta qualquer write.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const compact = JSON.stringify({
      's1': { name: 'a', updatedAt: 50_000 }  // recente o bastante
    });
    fs.writeFileSync(file, compact);
    const names = new SessionNames(file);
    names.prune(10_000, 55_000);  // janela que não remove (50_000 is fresh)
    expect(fs.readFileSync(file, 'utf-8')).toBe(compact);
  });

  it('arquivo corrompido e tratado como vazio', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{corrompido');
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  it('JSON valido array e tratado como vazio', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '[]');
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  it('JSON valido string e tratado como vazio', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '"texto"');
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  it('JSON valido null e tratado como vazio', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'null');
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  it('JSON valido number e tratado como vazio', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '42');
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  // Item Important 1 do review final: write() e best-effort — uma falha de
  // rename (ex.: EPERM por duas janelas escrevendo o mesmo arquivo) nao pode
  // derrubar o sidecar do JetBrains, que chama remember()/prune() fora de
  // qualquer try/catch (callback do watcher).
  it('remember engole falha de escrita (best-effort) e nao lanca', () => {
    const names = new SessionNames(file);
    vi.mocked(atomicWrite.atomicWriteFileSync).mockImplementationOnce(() => {
      const err = new Error('EPERM simulado') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });
    expect(() => names.remember('s1', 'nome', 1000)).not.toThrow();
    // a escrita falhou de verdade — nada foi persistido
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });

  it('prune engole falha de escrita (best-effort) e nao lanca', () => {
    const names = new SessionNames(file);
    names.remember('velha', 'a', 1000); // grava normalmente, mock ainda no default (real)
    vi.mocked(atomicWrite.atomicWriteFileSync).mockImplementationOnce(() => {
      const err = new Error('EACCES simulado') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });
    expect(() => names.prune(10_000, 55_000)).not.toThrow();
  });
});
