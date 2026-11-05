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

// "Vivo = rodando agora": anel parado nao usa o azul vivo.
async function idleRingIsMuted(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'painel', 'full', 'dark');
  const r = await page.evaluate(() => {
    const probe = document.createElement('span');
    document.documentElement.append(probe);
    const [muted, run] = ['var(--ct-muted)', 'var(--ct-run)'].map((value) => {
      probe.style.color = value;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    const [idle, live] = ['.ring-btn:not(.running) .arc', '.ring-btn.running .arc'].map((sel) =>
      [...document.querySelectorAll(sel)].map((a) => getComputedStyle(a).stroke));
    return { muted, run, idle, live };
  });
  await page.close();
  const failures: string[] = [];
  if (r.idle.length === 0 || r.idle.some((s) => s !== r.muted)) failures.push(`painel: anel parado em ${r.idle.join(', ')}, esperava ${r.muted}`);
  if (r.live.length === 0 || r.live.some((s) => s !== r.run)) failures.push(`painel: anel rodando em ${r.live.join(', ')}, esperava ${r.run}`);
  return failures;
}

// Tema de editor que zera focusBorder (Vitesse, Material) nao pode apagar o hover
// nem a faixa do agente ativo.
async function panelSurvivesNoFocusBorder(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'painel', 'live', 'dark');
  const r = await page.evaluate(() => {
    document.documentElement.style.setProperty('--vscode-focusBorder', '#00000000');
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--ct-hover)';
    document.documentElement.append(probe);
    const hover = getComputedStyle(probe).backgroundColor;
    probe.style.backgroundColor = 'var(--ct-accent)';
    document.documentElement.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { hover, accent, stripe: getComputedStyle(document.querySelector('section.agent.active')!).boxShadow };
  });
  await page.close();
  const invisible = (c: string) => /rgba\(0, 0, 0, 0\)|\/ 0\)|, 0\)/.test(c);
  const failures: string[] = [];
  if (invisible(r.hover)) failures.push(`painel sem focusBorder: hover invisivel (${r.hover})`);
  // --ct-accent pinta o contorno de foco: sem ele, o teclado fica sem indicacao.
  if (invisible(r.accent)) failures.push(`painel sem focusBorder: --ct-accent invisivel (${r.accent})`);
  if (invisible(r.stripe)) failures.push(`painel sem focusBorder: faixa do agente ativo invisivel (${r.stripe})`);
  return failures;
}

// Quem navega por teclado continua de onde parou: o foco vai para o card aberto.
async function clickMovesFocus(context: BrowserContext, theme: string, selector: string, open: Open): Promise<string[]> {
  const page = await open(context, theme, 'live', 'dark');
  await page.locator(selector, { hasText: 'explorador-a' }).click();
  await page.waitForTimeout(800);
  const title = await page.evaluate(() => document.activeElement?.closest('section.agent')?.querySelector('.title')?.textContent ?? null);
  await page.close();
  return title === 'explorador-a' ? [] : [`${theme}: depois do clique o foco esta em ${title}, esperava o card de explorador-a`];
}

// aria-label em <span> sem role e ignorado por leitor de tela.
async function textStatusIsLabelled(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'terminal', 'live', 'dark');
  const r = await page.locator('.glyph').evaluateAll((els) => ({ total: els.length, ok: els.filter((e) => e.getAttribute('role') === 'img' && e.getAttribute('aria-label')).length }));
  await page.close();
  return r.total > 0 && r.total === r.ok ? [] : [`terminal: ${r.ok} de ${r.total} status em texto com role=img`];
}

// O contexto do harness e reducedMotion: 'reduce'. O spinner e SMIL, que nem a media
// query nem o CSS param: ele so pode girar quando a pessoa aceita movimento.
async function spinnerRespectsMotion(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'classic', 'live', 'dark');
  const failures: string[] = [];
  const reduced = await page.locator('animateTransform').count();
  if (reduced !== 0) failures.push(`spinner: ${reduced} animacoes com movimento reduzido`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(200);
  if (await page.locator('animateTransform').count() === 0) failures.push('spinner: sem animacao quando o movimento e permitido');
  await page.close();
  return failures;
}

// Mission em sidebar estreita: o valor do medidor nao pode passar do bloco, e o que
// e cortado (nome do agente, modelo) precisa poder ser lido por inteiro.
async function missionFitsNarrow(context: BrowserContext, open: Open): Promise<string[]> {
  const failures: string[] = [];
  for (const width of [360, 300, 240, 200]) {
    const page = await open(context, 'mission', 'narrow', 'dark');
    await page.evaluate((w) => { document.body.style.width = `${w}px`; }, width);
    const r = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.gauges .g').length,
      over: [...document.querySelectorAll('.gauges .g')].filter((g) => {
        const v = g.querySelector('.gv')!;
        return v.scrollWidth > v.clientWidth + 0.5 || v.getBoundingClientRect().right > g.getBoundingClientRect().right + 0.5;
      }).map((g) => g.querySelector('.gv')!.textContent),
      modelTitles: [...document.querySelectorAll('.gauges .g[title]')].map((g) => g.getAttribute('title')),
      ledTitles: [...document.querySelectorAll('.led-row')].map((l) => l.getAttribute('title')),
    }));
    await page.close();
    if (r.tiles !== 4) failures.push(`mission/${width}px: ${r.tiles} medidores, esperava 4`);
    if (r.over.length) failures.push(`mission/${width}px: valor passa do medidor: ${r.over.join(', ')}`);
    if (r.modelTitles.join() !== 'claude-opus-5-5,claude-opus-4-7') failures.push(`mission/${width}px: titulos dos modelos: ${r.modelTitles.join()}`);
    if (!r.ledTitles.includes('revisor-de-longo-alcance-1')) failures.push(`mission/${width}px: linha de LED sem o nome inteiro: ${r.ledTitles.join()}`);
  }
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

// O card tem overflow: hidden: um contorno do lado de fora do cabecalho fica cortado,
// e quem usa teclado nao ve onde esta. So o teclado liga o :focus-visible.
async function headerFocusIsVisible(context: BrowserContext, theme: string, open: Open): Promise<string[]> {
  const page = await open(context, theme, 'live', 'dark');
  const seen = new Map<string, { style: string; offset: number; color: string }>();
  for (let i = 0; i < 40 && seen.size < 2; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement!;
      const kind = el.matches('section.agent > button.header') ? 'agente' : el.matches('.project .header') ? 'projeto' : null;
      const s = getComputedStyle(el);
      return kind ? { kind, style: s.outlineStyle, offset: parseFloat(s.outlineOffset), color: s.outlineColor } : null;
    });
    if (r) seen.set(r.kind, r);
  }
  await page.close();
  const failures: string[] = [];
  for (const kind of ['agente', 'projeto']) {
    const r = seen.get(kind);
    if (!r) failures.push(`${theme}: Tab nao chegou ao cabecalho de ${kind}`);
    else if (r.style !== 'solid' || r.offset >= 0) failures.push(`${theme}: foco do cabecalho de ${kind} cortado pelo card (${r.style}, offset ${r.offset})`);
  }
  return failures;
}

// Abrir um card nao pode animar para quem pediu menos movimento. Animacao de
// transition:slide e Web Animations, que a media query do app.css nao alcanca.
async function slideAnimations(page: Page, selector: string): Promise<number> {
  await page.locator(selector).first().click();
  const n = await page.evaluate(() => document.getAnimations().filter((a) => a.constructor === Animation).length);
  await page.waitForTimeout(300);
  return n;
}

async function scrollBehaviorOnRingClick(page: Page): Promise<unknown[]> {
  await page.evaluate(() => {
    const w = window as unknown as { __scrolls: unknown[] };
    w.__scrolls = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, o?: boolean | ScrollIntoViewOptions) {
      w.__scrolls.push(typeof o === 'object' ? o.behavior : o);
      orig.call(this, o);
    };
  });
  await page.locator('.ring-btn', { hasText: 'explorador-a' }).click();
  await page.waitForTimeout(500);
  return page.evaluate(() => (window as unknown as { __scrolls: unknown[] }).__scrolls);
}

async function motionIsOff(page: Page, label: string): Promise<string[]> {
  const failures: string[] = [];
  if (await page.locator('animateTransform').count() !== 0) failures.push(`${label}: spinner girando`);
  const pulse = await page.locator('.dot.active').first().evaluate((d) => parseFloat(getComputedStyle(d).animationDuration));
  if (pulse > 0.01) failures.push(`${label}: ponto do agente pulsando (${pulse}s)`);
  const slides = await slideAnimations(page, 'section.agent > button.header');
  if (slides !== 0) failures.push(`${label}: ${slides} animacoes ao recolher o card`);
  const scrolls = await scrollBehaviorOnRingClick(page);
  if (scrolls.length === 0) failures.push(`${label}: clique no anel nao rolou ate o card`);
  if (scrolls.includes('smooth')) failures.push(`${label}: rolagem suave`);
  return failures;
}

// Os dois jeitos de pedir menos movimento: o do sistema, e o workbench.reduceMotion
// do VS Code, que nao mexe na media query: so poe uma classe no body da webview.
async function reducedMotionStopsEverything(context: BrowserContext, open: Open): Promise<string[]> {
  const failures: string[] = [];
  const bySystem = await open(context, 'painel', 'live', 'dark');
  failures.push(...await motionIsOff(bySystem, 'movimento reduzido no sistema'));
  await bySystem.close();

  const byEditor = await open(context, 'painel', 'live', 'dark');
  await byEditor.emulateMedia({ reducedMotion: 'no-preference' });
  await byEditor.evaluate(() => document.body.classList.add('vscode-reduce-motion'));
  await byEditor.waitForTimeout(200);
  failures.push(...await motionIsOff(byEditor, 'workbench.reduceMotion'));
  await byEditor.close();

  const allowed = await open(context, 'painel', 'live', 'dark');
  await allowed.emulateMedia({ reducedMotion: 'no-preference' });
  await allowed.waitForTimeout(200);
  if (await slideAnimations(allowed, 'section.agent > button.header') === 0) failures.push('movimento permitido: card recolheu sem animar');
  if (!(await scrollBehaviorOnRingClick(allowed)).includes('smooth')) failures.push('movimento permitido: sem rolagem suave');
  await allowed.close();

  // Pagina nova: a de cima recolheu o card onde o spinner esta.
  const toggled = await open(context, 'painel', 'live', 'dark');
  await toggled.emulateMedia({ reducedMotion: 'no-preference' });
  await toggled.waitForTimeout(200);
  if (await toggled.locator('animateTransform').count() === 0) failures.push('movimento permitido: spinner parado');
  await toggled.evaluate(() => document.body.classList.add('vscode-reduce-motion'));
  await toggled.waitForTimeout(100);
  if (await toggled.locator('animateTransform').count() !== 0) failures.push('ligar workbench.reduceMotion com o painel aberto nao parou o spinner');
  await toggled.evaluate(() => document.body.classList.remove('vscode-reduce-motion'));
  await toggled.waitForTimeout(100);
  if (await toggled.locator('animateTransform').count() === 0) failures.push('desligar workbench.reduceMotion nao voltou o spinner');
  await toggled.close();
  return failures;
}

// Com muitas tasks a barra segmentada continua dizendo quanto falta: nenhum
// segmento some, e a parte concluida tem a largura da fracao ao lado.
async function missionBarKeepsProportion(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'mission', 'many', 'dark');
  const rows = await page.locator('.led-row').evaluateAll((els) => els.map((row) => {
    const bar = row.querySelector('.segs')!.getBoundingClientRect();
    const segs = [...row.querySelectorAll('.segs i')];
    const [done, total] = row.querySelector('.frac')!.textContent!.split('/').map(Number);
    // Onde a parte concluida termina, para o espaco entre segmentos nao contar contra.
    const lastDone = segs.filter((s) => s.classList.contains('done')).pop();
    return {
      name: row.querySelector('.name')!.textContent,
      done,
      total,
      zero: segs.filter((s) => s.getBoundingClientRect().width <= 0).length,
      got: lastDone ? ((lastDone.getBoundingClientRect().right - bar.left) / bar.width) * 100 : 0,
    };
  }));
  await page.close();
  const failures: string[] = [];
  if (!rows.some((r) => r.total >= 30)) failures.push('mission: caso many sem linha com 30+ tasks');
  for (const r of rows) {
    const want = (r.done / r.total) * 100;
    if (r.zero > 0) failures.push(`mission: ${r.name} com ${r.total} tasks tem ${r.zero} segmentos sem largura`);
    if (Math.abs(r.got - want) > 3) failures.push(`mission: ${r.name} com ${r.done}/${r.total} pinta ${Math.round(r.got)}%, esperava ${Math.round(want)}%`);
  }
  return failures;
}

// Sem agente vivo nao ha o que mostrar na faixa: nem uma borda vazia.
async function emptyStripIsGone(context: BrowserContext, open: Open): Promise<string[]> {
  const page = await open(context, 'mission', 'nolive', 'dark');
  const r = await page.evaluate(() => ({ strips: document.querySelectorAll('nav.strip').length, cards: document.querySelectorAll('section.agent').length }));
  await page.close();
  const failures: string[] = [];
  if (r.cards === 0) failures.push('mission: caso nolive sem nenhum agente no historico');
  if (r.strips !== 0) failures.push('mission: faixa de LED vazia sem nenhum agente vivo');
  return failures;
}

export async function behaviorChecks(context: BrowserContext, themes: readonly string[], open: Open): Promise<string[]> {
  const failures: string[] = [];
  for (const theme of themes) failures.push(...await cardHeaderFits(context, theme, open), ...await headerFocusIsVisible(context, theme, open));
  if (themes.includes('classic')) failures.push(...await spinnerRespectsMotion(context, open));
  if (themes.includes('painel')) failures.push(...await reducedMotionStopsEverything(context, open));
  if (themes.includes('mission')) failures.push(...await missionBarKeepsProportion(context, open), ...await emptyStripIsGone(context, open));
  if (themes.includes('painel')) {
    failures.push(...await ringShowsWholeCard(context, open), ...await ringHasTypeIcon(context, open), ...await panelUsageIsBlue(context, open));
    failures.push(...await idleRingIsMuted(context, open), ...await panelSurvivesNoFocusBorder(context, open));
    failures.push(...await clickMovesFocus(context, 'painel', '.ring-btn', open));
  }
  if (themes.includes('terminal')) failures.push(...await asciiBarKeepsProportion(context, open), ...await textStatusIsLabelled(context, open));
  if (themes.includes('mission')) failures.push(...await missionShowsInstruments(context, open), ...await clickMovesFocus(context, 'mission', '.led-row', open), ...await missionFitsNarrow(context, open));
  return failures;
}
