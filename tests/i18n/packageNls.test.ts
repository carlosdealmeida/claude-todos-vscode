import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { messages } from '../../src/i18n/messages';

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

describe('package.nls files match the catalog locales', () => {
  it('has one package.nls.<locale>.json per non-en locale in messages.ts', () => {
    const nlsLocales = readdirSync(ROOT)
      .filter((f) => /^package\.nls\.[^.]+\.json$/.test(f))
      .map((f) => f.replace(/^package\.nls\./, '').replace(/\.json$/, ''))
      .sort();
    const catalogLocales = Object.keys(messages)
      .filter((locale) => locale !== 'en')
      .sort();
    expect(nlsLocales).toEqual(catalogLocales);
  });
});

describe('language setting matches the catalog', () => {
  it('enum (minus auto) equals the message catalog locales', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    const setting = pkg.contributes.configuration.properties['claudeTodos.language'];
    const offered = (setting.enum as string[]).filter((v) => v !== 'auto').sort();
    expect(offered).toEqual(Object.keys(messages).sort());
  });

  it('enumDescriptions has one entry per enum value', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    const setting = pkg.contributes.configuration.properties['claudeTodos.language'];
    expect(setting.enumDescriptions).toHaveLength(setting.enum.length);
  });
});
