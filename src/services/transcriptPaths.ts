import * as fs from 'fs';
import * as path from 'path';
import { encodeCwdToProjectDir } from './projectDir';

// Session ids are used to build filesystem paths. Restrict them to a safe
// character set so a crafted id (e.g. containing `..` or path separators)
// cannot traverse outside the Claude projects directory.
export const SAFE_SESSION_ID = /^[A-Za-z0-9_-]+$/;

export function cwdCandidates(cwd: string): string[] {
  const candidates = process.platform === 'win32'
    ? [cwd, cwd.toLowerCase(), cwd.charAt(0).toUpperCase() + cwd.slice(1).toLowerCase()]
    : [cwd];
  return [...new Set(candidates)];
}

export function transcriptPath(claudeDir: string, sessionId: string, cwd: string): string | null {
  if (!SAFE_SESSION_ID.test(sessionId)) return null;
  for (const candidate of cwdCandidates(cwd)) {
    const p = path.join(claudeDir, 'projects', encodeCwdToProjectDir(candidate), `${sessionId}.jsonl`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function subAgentsDir(claudeDir: string, sessionId: string, cwd: string): string | null {
  if (!SAFE_SESSION_ID.test(sessionId)) return null;
  for (const candidate of cwdCandidates(cwd)) {
    const d = path.join(claudeDir, 'projects', encodeCwdToProjectDir(candidate), sessionId, 'subagents');
    if (fs.existsSync(d)) return d;
  }
  return null;
}
