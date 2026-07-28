import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const READMES = ['README.md', 'README.en.md', 'README.es.md', 'README.zh-cn.md', 'README.zh-tw.md'];

function sectionCount(file: string): number {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('## ')).length;
}

describe('README parity', () => {
  // A extracao da landing casa as secoes por INDICE (os titulos mudam de
  // idioma). Se um README ganhar ou perder uma secao, a landing daquele idioma
  // passa a mostrar o bloco errado — sem erro visivel. Este teste quebra antes.
  it('all READMEs have the same number of sections', () => {
    const counts = READMES.map((f) => [f, sectionCount(f)] as const);
    const expected = counts[0][1];
    for (const [file, count] of counts) {
      expect(`${file}:${count}`).toBe(`${file}:${expected}`);
    }
  });

  it('has the 11 sections the landing extraction assumes', () => {
    expect(sectionCount('README.md')).toBe(11);
  });
});
