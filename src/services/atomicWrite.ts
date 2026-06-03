import * as fs from 'fs';

// The subset of `fs` the atomic write needs. Injectable so the failure path
// (a rename that throws) can be exercised with real disk I/O in tests.
export interface FsLike {
  writeFileSync(path: string, data: string): void;
  renameSync(from: string, to: string): void;
  unlinkSync(path: string): void;
}

export function atomicWriteWith(fsLike: FsLike, filePath: string, data: string): void {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fsLike.writeFileSync(tmpPath, data);
  try {
    fsLike.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fsLike.unlinkSync(tmpPath); } catch { /* best effort */ }
    throw err;
  }
}

// Writes `data` to `filePath` atomically: write to a sibling temp file first,
// then rename over the target. A rename on the same filesystem is atomic, so a
// crash or concurrent write can never leave the target half-written.
export function atomicWriteFileSync(filePath: string, data: string): void {
  atomicWriteWith(fs, filePath, data);
}
