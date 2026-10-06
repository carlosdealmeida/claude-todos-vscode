// Gera src/generated/bridgeModFiles.ts com o conteúdo de cada arquivo do mod
// claude-todos-bridge (spec 2026-10-06, decisão 4). O módulo gerado entra no
// bundle do core: o mod viaja dentro da extensão e do sidecar do JetBrains.
// Com --out <pasta>, também monta o mod nessa pasta (desenvolvimento:
// `claude plugin validate` e `CLAUDE_CODE_PLUGIN_DIRS`).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = join(ROOT, 'mod', 'claude-todos-bridge');
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const manifest = JSON.parse(readFileSync(join(MOD, '.claude-plugin', 'plugin.json'), 'utf8'));
manifest.version = version;

const files = {
  '.claude-plugin/plugin.json': JSON.stringify(manifest, null, 2) + '\n',
  'hooks/hooks.json': readFileSync(join(MOD, 'hooks', 'hooks.json'), 'utf8'),
  'hooks/register.ts': readFileSync(join(MOD, 'hooks', 'register.ts'), 'utf8'),
  'hooks/state.ts': readFileSync(join(ROOT, 'src', 'bridgeMod', 'state.ts'), 'utf8'),
};

const outModule = join(ROOT, 'src', 'generated', 'bridgeModFiles.ts');
mkdirSync(dirname(outModule), { recursive: true });
writeFileSync(outModule, [
  '// GERADO por scripts/buildBridgeMod.mjs. Não editar: a fonte é mod/claude-todos-bridge/ e src/bridgeMod/state.ts.',
  `export const BRIDGE_MOD_VERSION = ${JSON.stringify(version)};`,
  `export const BRIDGE_MOD_FILES: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)};`,
  '',
].join('\n'));

const outIdx = process.argv.indexOf('--out');
if (outIdx > 0 && process.argv[outIdx + 1]) {
  const dest = resolve(ROOT, process.argv[outIdx + 1]);
  for (const [rel, content] of Object.entries(files)) {
    const target = join(dest, ...rel.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  console.log(`mod montado em ${dest}`);
}
