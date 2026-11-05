import { describe, it, expect } from 'vitest';
import { UI_THEME_IDS, DEFAULT_UI_THEME, parseUiTheme, effectiveTheme, THEME_I18N, THEME_TRAITS } from '../src/themes';
import { messages } from '../src/i18n/messages';
import pkg from '../package.json';

describe('registro de temas', () => {
  it('classic e o padrao e o primeiro da lista', () => {
    expect(DEFAULT_UI_THEME).toBe('classic');
    expect(UI_THEME_IDS[0]).toBe('classic');
  });

  it.each([[undefined], [null], [''], ['inexistente'], [42], ['CLASSIC']])('parseUiTheme(%j) cai no classic', (v) => {
    expect(parseUiTheme(v)).toBe('classic');
  });

  it('parseUiTheme aceita todo id registrado', () => {
    for (const id of UI_THEME_IDS) expect(parseUiTheme(id)).toBe(id);
  });

  it('high contrast sempre usa o classic, sem depender da escolha', () => {
    for (const id of UI_THEME_IDS) expect(effectiveTheme(id, 'hc')).toBe('classic');
  });

  it('fora do high contrast a escolha vale', () => {
    for (const id of UI_THEME_IDS) {
      expect(effectiveTheme(id, 'dark')).toBe(id);
      expect(effectiveTheme(id, 'light')).toBe(id);
    }
  });

  it('cada tema tem nome e descricao no catalogo en', () => {
    for (const id of UI_THEME_IDS) {
      expect(messages.en[THEME_I18N[id].name]).toBeTruthy();
      expect(messages.en[THEME_I18N[id].desc]).toBeTruthy();
    }
  });

  it('o enum da setting no package.json e a mesma lista, na mesma ordem', () => {
    const prop = (pkg as any).contributes.configuration.properties['claudeTodos.theme'];
    expect(prop.enum).toEqual([...UI_THEME_IDS]);
    expect(prop.default).toBe(DEFAULT_UI_THEME);
  });
});

describe('traços', () => {
  it('classic e papel nao ligam nenhum traco: sao so tokens', () => {
    for (const id of ['classic', 'papel'] as const) {
      expect(THEME_TRAITS[id]).toEqual({ glyphs: 'svg', meter: 'bar', agentStrip: 'none', usageSummary: 'none' });
    }
  });
  it('terminal usa texto e barra ASCII; painel usa aneis', () => {
    expect(THEME_TRAITS.terminal).toEqual({ glyphs: 'text', meter: 'ascii', agentStrip: 'none', usageSummary: 'none' });
    expect(THEME_TRAITS.painel).toEqual({ glyphs: 'svg', meter: 'bar', agentStrip: 'rings', usageSummary: 'none' });
  });
  it('mission: LEDs e medidores', () => {
    expect(THEME_TRAITS.mission).toEqual({ glyphs: 'svg', meter: 'bar', agentStrip: 'leds', usageSummary: 'gauges' });
    expect(THEME_TRAITS.classic.usageSummary).toBe('none');
  });
});
