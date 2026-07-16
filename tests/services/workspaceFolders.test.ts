import { describe, it, expect } from 'vitest';
import { pickWorkspaceCwds } from '../../src/services/workspaceFolders';

const folders = [
  { name: 'api', fsPath: '/work/api' },
  { name: 'web', fsPath: '/work/web' },
];

describe('pickWorkspaceCwds', () => {
  it('returns all folder paths when activeFolder is empty', () => {
    expect(pickWorkspaceCwds(folders, '')).toEqual(['/work/api', '/work/web']);
  });

  it('returns all folder paths when activeFolder is whitespace', () => {
    expect(pickWorkspaceCwds(folders, '   ')).toEqual(['/work/api', '/work/web']);
  });

  it('narrows to a single folder matched by name', () => {
    expect(pickWorkspaceCwds(folders, 'web')).toEqual(['/work/web']);
  });

  it('narrows to a single folder matched by absolute path', () => {
    expect(pickWorkspaceCwds(folders, '/work/api')).toEqual(['/work/api']);
  });

  it('falls back to all folders when activeFolder matches nothing', () => {
    expect(pickWorkspaceCwds(folders, 'ghost')).toEqual(['/work/api', '/work/web']);
  });

  it('returns empty for an empty workspace', () => {
    expect(pickWorkspaceCwds([], 'web')).toEqual([]);
  });
});
