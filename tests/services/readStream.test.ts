import { describe, it, expect } from 'vitest';
import { PassThrough } from 'stream';
import { readStream } from '../../src/services/readStream';

describe('readStream', () => {
  it('resolves with all data once the stream ends', async () => {
    const stream = new PassThrough();
    const promise = readStream(stream, 1000);
    stream.write('{"session_id"');
    stream.write(':"abc"}');
    stream.end();
    expect(await promise).toBe('{"session_id":"abc"}');
  });

  it('resolves within the timeout when the stream never ends (anti-hang)', async () => {
    const stream = new PassThrough();
    const promise = readStream(stream, 30);
    stream.write('partial');
    // Deliberately never call stream.end() — simulates a stdin that stays open.
    const start = Date.now();
    const result = await promise;
    const elapsed = Date.now() - start;
    expect(result).toBe('partial');
    expect(elapsed).toBeLessThan(500);
  });
});
