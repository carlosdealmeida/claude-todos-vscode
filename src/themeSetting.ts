import * as vscode from 'vscode';
import { parseUiTheme, type UiThemeId } from './themes';

// Le a cada chamada, como resolveLocale(): barato e sem cache para invalidar.
export function readUiTheme(): UiThemeId {
  return parseUiTheme(vscode.workspace.getConfiguration('claudeTodos').get('theme'));
}
