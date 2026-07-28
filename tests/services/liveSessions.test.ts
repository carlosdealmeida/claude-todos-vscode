import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readLiveSessions, isPidAlive } from '../../src/services/liveSessions';

describe('readLiveSessions', () => {
  let claudeDir: string;

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-test-'));
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
  });
  afterEach(() => fs.rmSync(claudeDir, { recursive: true, force: true }));

  const write = (pid: number, body: object) =>
    fs.writeFileSync(path.join(claudeDir, 'sessions', `${pid}.json`), JSON.stringify(body));

  it('devolve mapa vazio quando o diretorio nao existe', () => {
    fs.rmSync(path.join(claudeDir, 'sessions'), { recursive: true });
    expect(readLiveSessions(claudeDir).size).toBe(0);
  });

  it('inclui sessao com pid vivo, chaveada por sessionId', () => {
    write(101, { pid: 101, sessionId: 's1', cwd: '/p', name: 'meu-nome', nameSource: 'user' });
    const out = readLiveSessions(claudeDir, () => true);
    expect(out.get('s1')).toEqual({ pid: 101, sessionId: 's1', cwd: '/p', name: 'meu-nome', nameSource: 'user' });
  });

  it('exclui sessao cujo pid esta morto', () => {
    write(102, { pid: 102, sessionId: 's2', cwd: '/p' });
    expect(readLiveSessions(claudeDir, () => false).size).toBe(0);
  });

  it('ignora arquivo malformado sem lancar', () => {
    fs.writeFileSync(path.join(claudeDir, 'sessions', '103.json'), '{nao-json');
    write(104, { pid: 104, sessionId: 's4', cwd: '/p' });
    const out = readLiveSessions(claudeDir, () => true);
    expect([...out.keys()]).toEqual(['s4']);
  });

  it('ignora registro sem sessionId ou sem pid numerico', () => {
    write(105, { pid: 105, cwd: '/p' });
    write(106, { pid: 'x', sessionId: 's6', cwd: '/p' });
    expect(readLiveSessions(claudeDir, () => true).size).toBe(0);
  });

  it('ignora registro com pid 0 ou negativo (nao identifica um processo individual)', () => {
    // pid: 0 mira o grupo do processo atual (process.kill(0, 0) responde true)
    // e negativos miram um grupo no POSIX — sem essa guarda um registro assim
    // ficaria "vivo" pra sempre, mesmo com isAlive sempre true no teste.
    write(0, { pid: 0, sessionId: 's-zero', cwd: '/p' });
    write(-1, { pid: -1, sessionId: 's-neg', cwd: '/p' });
    expect(readLiveSessions(claudeDir, () => true).size).toBe(0);
  });

  it('nao apaga arquivos de sessoes mortas', () => {
    write(107, { pid: 107, sessionId: 's7', cwd: '/p' });
    readLiveSessions(claudeDir, () => false);
    expect(fs.existsSync(path.join(claudeDir, 'sessions', '107.json'))).toBe(true);
  });
});

describe('isPidAlive (default)', () => {
  it('considera o proprio processo vivo', () => {
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-self-'));
    fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: 'self', cwd: '/p' }),
    );
    expect(readLiveSessions(claudeDir).has('self')).toBe(true);
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  it('trata EPERM como vivo (processo existe, so nao e sinalizavel por este usuario)', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('EPERM simulado') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });
    try {
      expect(isPidAlive(99999)).toBe(true);
    } finally {
      killSpy.mockRestore();
    }
  });

  it('trata ESRCH como morto (processo nao existe)', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('ESRCH simulado') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });
    try {
      expect(isPidAlive(99999)).toBe(false);
    } finally {
      killSpy.mockRestore();
    }
  });
});
