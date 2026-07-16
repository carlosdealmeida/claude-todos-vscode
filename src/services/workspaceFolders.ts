export interface WorkspaceFolderLike {
  name: string;
  fsPath: string;
}

// Aplica o setting `claudeTodos.activeFolder` à lista de pastas do workspace:
// vazio = todas (detecção automática); valor casando com nome ou caminho de uma
// pasta = só ela; valor sem correspondência = todas (o painel nunca quebra por
// setting inválido). Path case-insensitive no win32, como BridgeFile.allForCwd.
export function pickWorkspaceCwds(
  folders: readonly WorkspaceFolderLike[],
  activeFolder: string,
): string[] {
  const all = folders.map(f => f.fsPath);
  const wanted = activeFolder.trim();
  if (!wanted) return all;
  const eqPath = (a: string, b: string) => process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
  const match = folders.find(f => f.name === wanted || eqPath(f.fsPath, wanted));
  return match ? [match.fsPath] : all;
}
