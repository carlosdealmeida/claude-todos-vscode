// Registro de temas do painel. Sem DOM e sem vscode: importado pela extensao,
// pelo core, pela webview e pelos testes. A lista Kotlin (ThemeChoice.kt) e
// uma copia manual, travada pelo ThemeChoiceTest contra o package.json.
import type { MessageKey } from './i18n/messages';

export const UI_THEME_IDS = ['classic', 'papel'] as const;
export type UiThemeId = (typeof UI_THEME_IDS)[number];
export const DEFAULT_UI_THEME: UiThemeId = 'classic';

export type ColorMode = 'dark' | 'light' | 'hc';

export function parseUiTheme(value: unknown): UiThemeId {
  return typeof value === 'string' && (UI_THEME_IDS as readonly string[]).includes(value)
    ? (value as UiThemeId)
    : DEFAULT_UI_THEME;
}

// High contrast: so o Classico garante o contraste que o editor promete.
export function effectiveTheme(choice: UiThemeId, mode: ColorMode): UiThemeId {
  return mode === 'hc' ? 'classic' : choice;
}

export const THEME_I18N: Record<UiThemeId, { name: MessageKey; desc: MessageKey }> = {
  classic: { name: 'theme.classic', desc: 'theme.classic.desc' },
  papel: { name: 'theme.papel', desc: 'theme.papel.desc' },
};
