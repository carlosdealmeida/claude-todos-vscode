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

// O centro do anel mostra o tipo do agente. Caso full: um de cada tipo.
async function ringHasTypeIcon(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'painel', 'full', 'dark');
  const rings = await page.locator('.ring-btn').evaluateAll((els) => els.map((el) => {
    const icon = el.querySelector('[data-agent-icon]');
    const svg = el.querySelector('svg.ico')?.getBoundingClientRect();
    const ring = el.querySelector('svg[viewBox="0 0 44 44"]')!.getBoundingClientRect();
    return {
      name: el.querySelector('.name')!.textContent,
      icon: icon?.getAttribute('data-agent-icon') ?? null,
      offX: svg ? Math.abs(svg.x + svg.width / 2 - (ring.x + ring.width / 2)) : 99,
      offY: svg ? Math.abs(svg.y + svg.height / 2 - (ring.y + ring.height / 2)) : 99,
    };
  }));
  await page.close();
  const want: Record<string, string> = { 'Main agent': 'star', 'explorador-b': 'search', 'explorador-c': 'list', 'explorador-a': 'person' };
  const failures = Object.entries(want)
    .filter(([name, icon]) => rings.find((r) => r.name === name)?.icon !== icon)
    .map(([name, icon]) => `painel: anel de ${name} sem o icone ${icon}`);
  for (const r of rings) {
    if (r.offX > 1 || r.offY > 1) failures.push(`painel: icone de ${r.name} fora do centro do anel`);
  }
  return failures;
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

// Mission Control: medidores no topo, um LED por agente, e o clique abre o card.
async function missionShowsInstruments(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'mission', 'live', 'dark');
  await page.setViewportSize({ width: 360, height: 560 });
  const failures: string[] = [];
  const tiles = await page.locator('.gauges .g').count();
  if (tiles < 3) failures.push(`mission: ${tiles} medidores, esperava ao menos 3`);
  const leds = await page.locator('.led-row').count();
  if (leds !== 4) failures.push(`mission: ${leds} linhas de LED, esperava 4`);
  if (await page.locator('.usage, table').count() === 0) failures.push('mission: tabela de uso sumiu');
  if (leds > 0) {
    await page.locator('.led-row', { hasText: 'explorador-a' }).click();
    await page.waitForTimeout(800);
    const opened = await page.evaluate(() => {
      const title = [...document.querySelectorAll('section.agent .title')].find((t) => t.textContent === 'explorador-a')!;
      const section = title.closest('section')!;
      const card = section.getBoundingClientRect();
      const main = document.querySelector('main')!.getBoundingClientRect();
      return section.querySelectorAll('li').length > 0 && card.top >= main.top && card.bottom <= main.bottom;
    });
    if (!opened) failures.push('mission: clique no LED nao mostrou o card aberto');
  }
  await page.close();
  return failures;
}

// Nenhum tema esconde informacao: em painel estreito, o que nao cabe no cabecalho do
// card desce de linha, em vez de ser cortado pelo overflow do card.
async function cardHeaderFits(context: BrowserContext, theme: string, open: Open): Promise<string[]> {
  const failures: string[] = [];
  for (const width of [360, 300, 270, 240, 200]) {
    const page = await open(context, theme, 'full', 'dark');
    await page.evaluate((w) => { document.body.style.width = `${w}px`; }, width);
    const clipped = await page.locator('section.agent > button.header').evaluateAll((els) => els.flatMap((h) => {
      const right = h.closest('section')!.getBoundingClientRect().right;
      const over = [...h.children].filter((c) => c.getBoundingClientRect().right > right + 0.5);
      return over.map((c) => `${h.querySelector('.title')!.textContent}/${c.className.split(' ')[0]}`);
    }));
    await page.close();
    if (clipped.length) failures.push(`${theme}/${width}px: cortado no cabecalho do card: ${clipped.join(', ')}`);
  }
  return failures;
}

export async function behaviorChecks(context: BrowserContext, themes: readonly string[], open: Open): Promise<string[]> {
  const failures: string[] = [];
  for (const theme of themes) failures.push(...await cardHeaderFits(context, theme, open));
  if (themes.includes('painel')) {
    failures.push(...await ringShowsWholeCard(context, open), ...await ringHasTypeIcon(context, open), ...await panelUsageIsBlue(context, open));
  }
  if (themes.includes('terminal')) failures.push(...await asciiBarKeepsProportion(context, open));
  if (themes.includes('mission')) failures.push(...await missionShowsInstruments(context, open));
  return failures;
}
