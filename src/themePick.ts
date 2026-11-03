// Aceite do QuickPick de tema, sem vscode para poder ser testado. A prévia já
// trocou o painel; aqui ele sempre termina no tema que vale de verdade.
import type { UiThemeId } from './themes';

export interface AcceptThemeInput {
  selected: UiThemeId | undefined; // undefined: Enter com filtro sem resultado
  saved: UiThemeId;
  write(id: UiThemeId): PromiseLike<void>;
  read(): UiThemeId;
  push(theme: UiThemeId): void;
  onError(err: unknown): void;
}

export async function acceptTheme(i: AcceptThemeInput): Promise<void> {
  if (i.selected === undefined) {
    i.push(i.saved);
    return;
  }
  try {
    await i.write(i.selected);
    i.push(i.read());
  } catch (err) {
    i.push(i.saved);
    i.onError(err);
  }
}
