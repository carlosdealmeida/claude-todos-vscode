import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const READMES = ['README.md', 'README.en.md', 'README.es.md', 'README.zh-cn.md', 'README.zh-tw.md'];

function sectionCount(file: string): number {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('## ')).length;
}

function getSection(file: string, index: number): string {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const headingIndices = lines
    .map((l, i) => (l.startsWith('## ') ? i : -1))
    .filter((i) => i !== -1);

  if (index >= headingIndices.length) return '';

  const startLine = headingIndices[index];
  const endLine = index + 1 < headingIndices.length ? headingIndices[index + 1] : lines.length;

  return lines.slice(startLine, endLine).join('\n');
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

  // Índice 0: "O que você vê" / "What you get" / ... — seção de features
  // Deve conter uma lista de bullets (linhas com "- ") para indicar features
  it('section index 0 (features) has a bulleted list structure in all READMEs', () => {
    for (const file of READMES) {
      const section = getSection(file, 0);
      const bulletCount = section.split('\n').filter((l) => l.trim().startsWith('- ')).length;
      expect(`${file}:bulletCount`).not.toBe(`${file}:0`);
      expect(bulletCount).toBeGreaterThanOrEqual(6);
    }
  });

  // Índice 2: "Instalação" / "Install" / ... — seção de instalação
  // Deve conter uma tabela markdown e a palavra "Marketplace" (presente em todos os idiomas)
  it('section index 2 (install) has table structure and Marketplace reference in all READMEs', () => {
    for (const file of READMES) {
      const section = getSection(file, 2);
      const hasTable = section.includes('|');
      const hasMarketplace = section.includes('Marketplace');
      expect(hasTable).toBe(true, `${file} section 2 should contain table (|)`);
      expect(hasMarketplace).toBe(true, `${file} section 2 should contain Marketplace`);
    }
  });

  // Índice 5: "Privacidade e fluxo de dados" / "Privacy and data flow" / ...
  // Deve conter tabela markdown (estrutura de dados tabulares)
  it('section index 5 (privacy) has table structure in all READMEs', () => {
    for (const file of READMES) {
      const section = getSection(file, 5);
      const hasTable = section.includes('|');
      expect(hasTable).toBe(true, `${file} section 5 should contain table (|)`);
    }
  });
});
