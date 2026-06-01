import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { transcriptPath, subAgentsDir } from '../../src/services/transcriptPaths';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';

describe('transcriptPaths', () => {
  let claudeDir: string;
  const CWD = '/home/user/proj';

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paths-test-'));
  });
  afterEach(() => {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  function makeTranscript(sessionId: string, cwd: string): string {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(cwd));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(file, '{}');
    return file;
  }

  it('returns null for an unsafe session id', () => {
    expect(transcriptPath(claudeDir, '../evil', CWD)).toBeNull();
    expect(subAgentsDir(claudeDir, '../evil', CWD)).toBeNull();
  });

  it('returns null when the transcript file is absent', () => {
    expect(transcriptPath(claudeDir, 'nope', CWD)).toBeNull();
  });

  it('finds an existing transcript file', () => {
    const file = makeTranscript('s1', CWD);
    expect(transcriptPath(claudeDir, 's1', CWD)).toBe(file);
  });

  it('resolves the subagents directory when it exists', () => {
    const dir = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD), 's1', 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    expect(subAgentsDir(claudeDir, 's1', CWD)).toBe(dir);
  });

  it('falls back to lowercase cwd dir on win32', () => {
    if (process.platform !== 'win32') return;
    makeTranscript('s1', 'c:\\@work\\proj');
    expect(transcriptPath(claudeDir, 's1', 'C:\\@work\\proj')).not.toBeNull();
  });
});
