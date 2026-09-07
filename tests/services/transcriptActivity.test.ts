import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TranscriptActivity, readLastActivityAt } from '../../src/services/transcriptActivity';

// #87900: os clientes oficiais anexam records SEM timestamp (bridge-session, mode,
// last-prompt, ai-title, atis-latch...) a transcripts antigos e empurram o mtime.
// A atividade da sessao e o timestamp da ultima mensagem de conversa, nao o mtime.

const T1 = Date.parse('2026-08-22T21:16:00.000Z');
const T2 = Date.parse('2026-08-23T00:16:32.806Z');

function line(o: object): string { return JSON.stringify(o); }
const user = (ts: number) => line({ type: 'user', timestamp: new Date(ts).toISOString(), message: { role: 'user', content: 'oi' } });
const assistant = (ts: number, text = 'ok') =>
  line({ type: 'assistant', timestamp: new Date(ts).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }] } });
const meta = [
  line({ type: 'bridge-session', sessionId: 's', bridgeSessionId: 'cse_1', lastSequenceNum: 0 }),
  line({ type: 'mode', mode: 'normal', sessionId: 's' }),
  line({ type: 'last-prompt', lastPrompt: 'x', leafUuid: 'u', sessionId: 's' }),
  line({ type: 'atis-latch', atis: '', sessionId: 's' }),
];

describe('readLastActivityAt', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function write(name: string, lines: string[]): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, lines.join('\n') + '\n');
    return p;
  }

  it('returns the timestamp of the last user/assistant record, ignoring trailing metadata', () => {
    const p = write('a.jsonl', [user(T1), assistant(T2), ...meta]);
    expect(readLastActivityAt(p)).toBe(T2);
  });

  it('finds the record even when a huge line sits between it and the end of the file', () => {
    const huge = line({ type: 'progress', payload: 'x'.repeat(200 * 1024) }); // sem timestamp, > 64 KiB
    const p = write('b.jsonl', [assistant(T1), huge, ...meta]);
    expect(readLastActivityAt(p)).toBe(T1);
  });

  it('returns null when no record carries a timestamp, or the file is empty/missing', () => {
    expect(readLastActivityAt(write('c.jsonl', meta))).toBeNull();
    expect(readLastActivityAt(write('d.jsonl', []))).toBeNull();
    expect(readLastActivityAt(path.join(dir, 'missing.jsonl'))).toBeNull();
  });
});

describe('TranscriptActivity', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('keeps the conversation timestamp when metadata is appended later and the mtime moves', () => {
    const p = path.join(dir, 'a.jsonl');
    fs.writeFileSync(p, [user(T1), assistant(T2)].join('\n') + '\n');
    const activity = new TranscriptActivity();
    expect(activity.activityAt(p)).toBe(T2);
    fs.appendFileSync(p, meta.join('\n') + '\n');
    const later = new Date(T2 + 14 * 86400_000);
    fs.utimesSync(p, later, later);
    expect(activity.activityAt(p)).toBe(T2); // relido (mtime/size mudaram), mesma resposta
    expect(fs.statSync(p).mtimeMs).toBeGreaterThan(T2 + 13 * 86400_000);
  });

  it('falls back to the mtime when the transcript has no dated message', () => {
    const p = path.join(dir, 'b.jsonl');
    fs.writeFileSync(p, meta.join('\n') + '\n');
    const fixed = new Date('2026-09-01T12:00:00Z');
    fs.utimesSync(p, fixed, fixed);
    expect(new TranscriptActivity().activityAt(p)).toBe(fixed.getTime());
  });

  it('returns null for a missing file', () => {
    expect(new TranscriptActivity().activityAt(path.join(dir, 'nope.jsonl'))).toBeNull();
  });
});
