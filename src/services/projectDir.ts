export function encodeCwdToProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9.-]/g, '-');
}
