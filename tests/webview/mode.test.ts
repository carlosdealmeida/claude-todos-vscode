import { describe, it, expect } from 'vitest';
import { relativeLuminance, resolveMode, applyAppearance } from '../../src/webview/themes/mode';

const base = { bodyClasses: [] as string[], dataTheme: null as string | null, foreground: '' };

describe('relativeLuminance', () => {
  it.each([
    ['#ffffff', 1], ['#000000', 0], ['#fff', 1], [' #FFFFFF ', 1],
    ['rgb(255, 255, 255)', 1], ['rgb(0,0,0)', 0],
  ])('%s -> %d', (c, l) => { expect(relativeLuminance(c)).toBeCloseTo(l, 3); });

  it.each([[''], ['red'], ['#12'], ['var(--x)']])('%j nao e cor parseavel', (c) => {
    expect(relativeLuminance(c)).toBeNull();
  });
});

describe('resolveMode', () => {
  it('VS Code: high contrast vence tudo, inclusive o hc light', () => {
    expect(resolveMode({ ...base, bodyClasses: ['vscode-high-contrast'] })).toBe('hc');
    expect(resolveMode({ ...base, bodyClasses: ['vscode-high-contrast-light'] })).toBe('hc');
    expect(resolveMode({ ...base, bodyClasses: ['vscode-light', 'vscode-high-contrast-light'] })).toBe('hc');
  });

  it('VS Code: classe light/dark', () => {
    expect(resolveMode({ ...base, bodyClasses: ['vscode-light'] })).toBe('light');
    expect(resolveMode({ ...base, bodyClasses: ['vscode-dark'], dataTheme: 'light' })).toBe('dark');
  });

  it('site: data-theme quando nao ha classe do VS Code', () => {
    expect(resolveMode({ ...base, dataTheme: 'light' })).toBe('light');
    expect(resolveMode({ ...base, dataTheme: 'dark' })).toBe('dark');
  });

  it('JetBrains: texto claro = fundo escuro', () => {
    expect(resolveMode({ ...base, foreground: '#bbbbbb' })).toBe('dark');   // Darcula (luminancia 0,497)
    expect(resolveMode({ ...base, foreground: '#a9b7c6' })).toBe('dark');   // texto do editor no Darcula
    expect(resolveMode({ ...base, foreground: '#dfe1e5' })).toBe('dark');   // New UI dark
    expect(resolveMode({ ...base, foreground: '#1f1f1f' })).toBe('light');  // Light
    expect(resolveMode({ ...base, foreground: '#3b3b3b' })).toBe('light');
  });

  it('sem sinal nenhum cai no dark', () => {
    expect(resolveMode(base)).toBe('dark');
  });
});

describe('applyAppearance', () => {
  it('grava o tema efetivo e o modo no dataset', () => {
    const el = { dataset: {} as Record<string, string | undefined> };
    applyAppearance(el, 'papel', 'light');
    expect(el.dataset).toEqual({ ctTheme: 'papel', ctMode: 'light' });
    applyAppearance(el, 'papel', 'hc');
    expect(el.dataset).toEqual({ ctTheme: 'classic', ctMode: 'hc' });
  });
});
