import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function readNls(file: string): Record<string, string> {
  return JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
}

describe('package.nls parity', () => {
  const baseKeys = Object.keys(readNls('package.nls.json')).sort();
  // package.nls.json e a base; package.nls.<locale>.json sao as traducoes.
  const translated = readdirSync(ROOT).filter(
    (f) => f.startsWith('package.nls.') && f !== 'package.nls.json' && f.endsWith('.json'),
  );

  it('finds the translated nls files', () => {
    expect(translated.length).toBeGreaterThan(0);
  });

  for (const file of translated) {
    it(`${file} has exactly the same keys as the base`, () => {
      expect(Object.keys(readNls(file)).sort()).toEqual(baseKeys);
    });
    it(`${file} has no empty values`, () => {
      for (const [k, v] of Object.entries(readNls(file))) {
        expect(v, `empty value for ${k}`).not.toBe('');
      }
    });
  }
});
