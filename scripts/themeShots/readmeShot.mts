// Prints dos temas para o README: pega <tema>-live-<modo>.png de shots/baseline/,
// corta o fundo vazio (o <main> tem a altura da viewport) e grava em
// screenshots/theme-<tema>-<modo>.png.
// Uso: npx tsx scripts/themeShots/readmeShot.mts papel painel
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const themes = process.argv.slice(2);
if (themes.length === 0) {
  console.error('Uso: npx tsx scripts/themeShots/readmeShot.mts <tema> [<tema> ...]');
  process.exit(1);
}

// Vai como texto: o tsx injeta __name em funcoes nomeadas passadas ao evaluate.
const CROP = `
window.crop = async function (b64) {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const at = (x, y) => (y * img.width + x) * 4;
  const bg = at(0, img.height - 1);
  let last = 0;
  outer: for (let y = img.height - 1; y >= 0; y--) {
    for (let x = 0; x < img.width; x++) {
      const i = at(x, y);
      if (d[i] !== d[bg] || d[i + 1] !== d[bg + 1] || d[i + 2] !== d[bg + 2]) { last = y; break outer; }
    }
  }
  const o = document.createElement('canvas');
  o.width = img.width; o.height = Math.min(img.height, last + 32);
  o.getContext('2d').drawImage(img, 0, 0);
  return o.toDataURL('image/png').split(',')[1];
};
`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: CROP });
for (const theme of themes) {
  for (const mode of ['dark', 'light']) {
    const source = fs.readFileSync(path.join(ROOT, 'shots', 'baseline', `${theme}-live-${mode}.png`));
    const cropped = await page.evaluate(`window.crop(${JSON.stringify(source.toString('base64'))})`) as string;
    const target = path.join(ROOT, 'screenshots', `theme-${theme}-${mode}.png`);
    fs.writeFileSync(target, Buffer.from(cropped, 'base64'));
    console.log(target);
  }
}
await browser.close();
