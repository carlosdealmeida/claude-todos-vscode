import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRIDGE_MOD_FILES, BRIDGE_MOD_VERSION } from '../../src/generated/bridgeModFiles';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('bridge mod embedded in the core bundle', () => {
  it('carries exactly the four files of the mod', () => {
    expect(Object.keys(BRIDGE_MOD_FILES).sort()).toEqual([
      '.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.ts', 'hooks/state.ts',
    ]);
  });

  it('ships the shared state module and the hooks verbatim', () => {
    expect(BRIDGE_MOD_FILES['hooks/state.ts']).toBe(read('src/bridgeMod/state.ts'));
    expect(BRIDGE_MOD_FILES['hooks/register.ts']).toBe(read('mod/claude-todos-bridge/hooks/register.ts'));
    expect(JSON.parse(BRIDGE_MOD_FILES['hooks/hooks.json'])).toEqual({ modules: ['./register.ts'] });
  });

  it('stamps the extension version into the manifest', () => {
    const version = JSON.parse(read('package.json')).version;
    expect(BRIDGE_MOD_VERSION).toBe(version);
    expect(JSON.parse(BRIDGE_MOD_FILES['.claude-plugin/plugin.json'])).toMatchObject({ name: 'claude-todos-bridge', version });
  });

  it('keeps the shared state module free of imports (it also runs inside the mod)', () => {
    expect(read('src/bridgeMod/state.ts')).not.toMatch(/^\s*import\s/m);
  });
});
