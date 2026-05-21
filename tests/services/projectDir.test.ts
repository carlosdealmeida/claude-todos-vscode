import { describe, it, expect } from 'vitest';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

describe('encodeCwdToProjectDir', () => {
  it('encodes Windows cwd', () => {
    expect(encodeCwdToProjectDir('c:\\@work\\MyProjects\\claude-todos-vscode'))
      .toBe('c---work-MyProjects-claude-todos-vscode');
  });

  it('encodes POSIX cwd', () => {
    expect(encodeCwdToProjectDir('/home/user/proj'))
      .toBe('-home-user-proj');
  });

  it('preserves alphanumerics, dots and hyphens', () => {
    expect(encodeCwdToProjectDir('/a.b-c/d'))
      .toBe('-a.b-c-d');
  });

  it('replaces drive letter colon', () => {
    expect(encodeCwdToProjectDir('D:\\path'))
      .toBe('D--path');
  });
});
