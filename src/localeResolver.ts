import * as vscode from 'vscode';
import { resolveLocaleFrom, type Locale } from './i18n/locale';

// Resolve o locale efetivo da extensão: setting claudeTodos.language (override)
// quando != 'auto', senão o idioma de exibição do VS Code. Lê a config a cada
// chamada (barato) — não precisa de cache.
export function resolveLocale(): Locale {
  const forced = vscode.workspace.getConfiguration('claudeTodos').get<string>('language');
  return resolveLocaleFrom(forced, vscode.env.language);
}
