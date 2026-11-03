// Comportamento que uma imagem fixa nao prova: viewport baixa, painel estreito e
// clique. Roda no --compare, depois das imagens, para os temas selecionados.
import type { BrowserContext, Page } from 'playwright';

type Open = (context: BrowserContext, theme: string, shotCase: string, mode: string) => Promise<Page>;

// O clique no anel precisa mostrar o card aberto, nao so o cabecalho: o card cresce
// depois do clique, e rolar antes disso deixa as tarefas fora da tela.
async function ringShowsWholeCard(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'painel', 'live', 'dark');
  await page.setViewportSize({ width: 360, height: 560 });
  await page.locator('.ring-btn', { hasText: 'explorador-a' }).click();
  await page.waitForTimeout(800);
  const fits = await page.evaluate(() => {
    const title = [...document.querySelectorAll('section.agent .title')].find((t) => t.textContent === 'explorador-a')!;
    const section = title.closest('section')!;
    const items = section.querySelectorAll('li').length;
    const card = section.getBoundingClientRect();
    const main = document.querySelector('main')!.getBoundingClientRect();
    return { items, inView: card.top >= main.top && card.bottom <= main.bottom };
  });
  await page.close();
  if (fits.items === 0) return ['painel: clique no anel nao expandiu o card'];
  return fits.inView ? [] : ['painel: clique no anel deixou o card aberto fora da tela'];
}

// Azul forte = consumo; verde fica para sucesso.
async function panelUsageIsBlue(context: BrowserContext, open: Open): Promise<string[]> {
  const failures: string[] = [];
  for (const mode of ['dark', 'light']) {
    const page = await open(context, 'painel', 'live', mode);
    const colors = await page.evaluate(() => {
      // Sem funcao nomeada aqui dentro: o tsx injeta __name, que nao existe na pagina.
      const probe = document.createElement('span');
      document.documentElement.append(probe);
      const [fillWant, badgeWant] = ['var(--vscode-button-background)', 'var(--ct-run)'].map((value) => {
        probe.style.color = value;
        return getComputedStyle(probe).color;
      });
      probe.remove();
      return {
        fill: getComputedStyle(document.querySelector('.ctx-fill.ok')!).backgroundColor,
        fillWant,
        badge: getComputedStyle(document.querySelector('.ctx-badge.ok')!).color,
        badgeWant,
      };
    });
    await page.close();
    if (colors.fill !== colors.fillWant) failures.push(`painel/${mode}: barra de consumo em ${colors.fill}, esperava ${colors.fillWant}`);
    if (colors.badge !== colors.badgeWant) failures.push(`painel/${mode}: selo de contexto em ${colors.badge}, esperava ${colors.badgeWant}`);
  }
  return failures;
}

// A barra ASCII nao pode perder proporcao quando o painel estreita: 42% e 93%
// cortados pela mesma largura pareceriam iguais.
async function asciiBarKeepsProportion(context: BrowserContext, open: Open): Promise<string[]> {
  const failures: string[] = [];
  for (const width of [360, 300, 260, 240]) {
    const page = await open(context, 'terminal', 'full', 'dark');
    await page.evaluate((w) => { document.body.style.width = `${w}px`; }, width);
    const rows = await page.locator('.ascii').evaluateAll((els) => els.flatMap((el) => {
      const pct = el.nextElementSibling;
      if (!pct?.classList.contains('limit-pct')) return [];
      const on = el.querySelector('.on');
      const box = el.getBoundingClientRect().width;
      return [{ want: parseInt(pct.textContent!, 10), got: on ? (on.getBoundingClientRect().width / box) * 100 : -1 }];
    }));
    await page.close();
    if (rows.length === 0) failures.push(`terminal/${width}px: nenhuma barra de limite`);
    for (const r of rows) {
      if (Math.abs(r.got - r.want) > 2) failures.push(`terminal/${width}px: barra de ${r.want}% mostra ${Math.round(r.got)}%`);
    }
  }
  return failures;
}

export async function behaviorChecks(context: BrowserContext, themes: readonly string[], open: Open): Promise<string[]> {
  const failures: string[] = [];
  if (themes.includes('painel')) {
    failures.push(...await ringShowsWholeCard(context, open), ...await panelUsageIsBlue(context, open));
  }
  if (themes.includes('terminal')) failures.push(...await asciiBarKeepsProportion(context, open));
  return failures;
}
