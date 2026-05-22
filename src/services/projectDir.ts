// Mirrors Claude Code's own project-directory encoding: every character that is
// not alphanumeric — dots included — becomes a hyphen.
export function encodeCwdToProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}
