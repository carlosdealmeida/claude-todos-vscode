import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionNames } from '../../src/services/sessionNames';

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
    const names = new SessionNames(file);
    names.remember('s1', 'meu-nome', 1000);
    const before = fs.statSync(file).mtimeMs;
    names.remember('s1', 'meu-nome', 2000);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('remember com nome novo sobrescreve', () => {
    const names = new SessionNames(file);
    names.remember('s1', 'antigo', 1000);
    names.remember('s1', 'novo', 2000);
    expect(names.get('s1')).toBe('novo');
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
    const names = new SessionNames(file);
    names.remember('s1', 'a', 1000);
    const before = fs.statSync(file).mtimeMs;
    names.prune(10_000, 2000);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('arquivo corrompido e tratado como vazio', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{corrompido');
    expect(new SessionNames(file).get('s1')).toBeUndefined();
  });
});
