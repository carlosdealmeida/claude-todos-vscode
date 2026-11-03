// Uso:
//   npm run shots                -> grava em shots/baseline/ so os <tema>-<caso>-<modo>.png que faltam
//   npm run shots -- --compare   -> grava shots/current/ e compara com o baseline
//   npm run shots -- --update --themes papel -> regrava o baseline de um tema (mudanca intencional)
//   Filtros: --themes classic,papel --cases live,full
// Sem --themes: o Classico e um tema por arquivo de src/webview/themes/. Tema
// registrado que ainda nao tem .css fica de fora ate a task que o cria.
// Compara byte a byte (mesma maquina, mesmo Chromium => PNG deterministico).
// Diferenca: lista os arquivos e sai com codigo 1; abrir os dois PNGs lado a lado.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEAK_SENTINEL, SHOT_CASES, shotTime, type ShotScript } from './cases.ts';
import { behaviorChecks } from './checks.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const compare = args.includes('--compare');
const update = args.includes('--update');
const listArg = (flag: string, fallback: readonly string[]): readonly string[] =>
  args.includes(flag) ? args[args.indexOf(flag) + 1].split(',') : fallback;
const themesDir = path.join(ROOT, 'src/webview/themes');
const themeFiles = fs.existsSync(themesDir)
  ? fs.readdirSync(themesDir).filter((f) => f.endsWith('.css') && !['tokens.css', 'index.css'].includes(f)).map((f) => f.replace(/\.css$/, ''))
  : [];
const themes = listArg('--themes', ['classic', ...themeFiles]);
const cases = listArg('--cases', SHOT_CASES);
const modes = ['dark', 'light'] as const;

// O Classico nao muda nunca. Se um dia mudar de proposito, apague o PNG a mao:
// o proximo `npm run shots` grava o novo.
if (update && themes.includes('classic')) {
  console.error('--update nao aceita o Classico: passe --themes so com os outros temas');
  process.exit(1);
}

execSync('npx vite build --config scripts/themeShots/vite.config.mts --logLevel warn', { cwd: ROOT, stdio: 'inherit' });

// --update grava direto no baseline, como a gravacao das imagens que faltam.
const outDir = path.join(ROOT, 'shots', compare ? 'current' : 'baseline');
fs.mkdirSync(outDir, { recursive: true });
const indexUrl = pathToFileURL(path.join(ROOT, 'dist-shots', 'index.html')).href;
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/demo/scripts/smoke-test.json'), 'utf8')) as ShotScript;

// file:// bloqueia modulos ES por CORS sem esta flag. Ela evita subir um
// servidor, que no Windows costuma deixar processo orfao segurando a porta.
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const context = await browser.newContext({ viewport: { width: 360, height: 1800 }, reducedMotion: 'reduce', deviceScaleFactor: 2 });
// Antes do goto: clock.svelte.ts le Date.now() no load do modulo.
await context.clock.setFixedTime(shotTime(script));
const failures: string[] = [];
async function open(ctx: typeof context, theme: string, shotCase: string, mode: string) {
  const page = await ctx.newPage();
  await page.goto(`${indexUrl}?mode=${mode}&theme=${theme}&case=${shotCase}`);
  await page.waitForSelector('body[data-ready="1"] main');
  await page.waitForFunction(() => !document.querySelector('main .loading'));
  return page;
}
for (const theme of themes) {
  for (const shotCase of cases) {
    for (const mode of modes) {
      const file = `${theme}-${shotCase}-${mode}.png`;
      const base = path.join(ROOT, 'shots', 'baseline', file);
      if (!compare && !update && fs.existsSync(base)) continue;
      const page = await open(context, theme, shotCase, mode);
      if (shotCase === 'project') await page.locator('main .project .header').click();
      await page.evaluate(() => document.fonts.ready);
      // transition:slide usa a Web Animations API, que o reducedMotion nao zera.
      await page.waitForTimeout(400);
      // O spinner do StatusIcon e SMIL (animateTransform): nem o reducedMotion
      // nem o relogio congelado o param, e o angulo mudaria a cada imagem.
      await page.evaluate(() => {
        document.querySelectorAll('svg').forEach((s) => { s.pauseAnimations(); s.setCurrentTime(0); });
      });
      await page.locator('main').screenshot({ path: path.join(outDir, file) });
      if (theme !== 'classic') {
        // Regra .ct-root: o texto herdado precisa usar a cor e a fonte do tema.
        const inherited = await page.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.cssText = 'color: var(--ct-fg); font-family: var(--ct-font)';
          document.documentElement.append(probe);
          const m = getComputedStyle(document.querySelector('main')!);
          const p = getComputedStyle(probe);
          const same = m.color === p.color && m.fontFamily === p.fontFamily;
          probe.remove();
          return same;
        });
        if (!inherited) failures.push(`${file}: texto herdado nao usa --ct-fg/--ct-font`);
        const leaks = await page.evaluate((sentinel) => {
          const main = document.querySelector('main')!;
          const found: string[] = [];
          if (getComputedStyle(main).scrollbarColor.includes(sentinel)) found.push('scrollbar');
          main.querySelectorAll('code').forEach((c) => { if (getComputedStyle(c).color === sentinel) found.push('code'); });
          return found;
        }, LEAK_SENTINEL);
        if (leaks.length) failures.push(`${file}: cor do editor vazou em ${leaks.join(', ')}`);
      }
      await page.close();
      if (compare) {
        if (!fs.existsSync(base)) {
          failures.push(`${file}: sem baseline (rode npm run shots)`);
        } else if (!fs.readFileSync(base).equals(fs.readFileSync(path.join(outDir, file)))) {
          const hint = theme === 'classic' ? 'o Classico nao pode mudar' : `se foi de proposito: --update --themes ${theme}`;
          failures.push(`${file}: mudou, compare shots/baseline/ com shots/current/ (${hint})`);
        }
      }
    }
  }
}
if (compare) failures.push(...await behaviorChecks(context, themes, open));
await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`ok: ${outDir}`);
