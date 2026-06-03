import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteFileSync, atomicWriteWith, type FsLike } from '../../src/services/atomicWrite';

describe('atomicWriteFileSync', () => {
  let tmpDir: string;
  let target: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'));
    target = path.join(tmpDir, 'data.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the content to the target file', () => {
    atomicWriteFileSync(target, '{"a":1}');
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}');
  });

  it('leaves no temporary files behind on success', () => {
    atomicWriteFileSync(target, 'hello');
    expect(fs.readdirSync(tmpDir)).toEqual(['data.json']);
  });

  it('preserves the existing file and cleans up the temp when the rename fails', () => {
    fs.writeFileSync(target, 'ORIGINAL');
    // Real disk I/O for write/unlink, but the rename step fails — the realistic
    // failure mode the atomic write must survive.
    const failingRename: FsLike = {
      writeFileSync: fs.writeFileSync,
      renameSync: () => { throw new Error('simulated disk failure'); },
      unlinkSync: fs.unlinkSync,
    };

    expect(() => atomicWriteWith(failingRename, target, 'NEW')).toThrow();

    // Original untouched (we never wrote to it directly), no temp left behind.
    expect(fs.readFileSync(target, 'utf-8')).toBe('ORIGINAL');
    expect(fs.readdirSync(tmpDir)).toEqual(['data.json']);
  });
});
