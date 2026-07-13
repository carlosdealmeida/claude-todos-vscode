import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readSubAgentMeta } from '../../src/services/subAgentMeta';

describe('readSubAgentMeta', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, content: string): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  }

  it('reads a complete meta.json next to the transcript', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', JSON.stringify({
      agentType: 'general-purpose',
      description: 'Implementar Task 1',
      toolUseId: 'toolu_01XYZ',
      spawnDepth: 1,
    }));
    expect(readSubAgentMeta(jsonl)).toEqual({
      agentType: 'general-purpose',
      description: 'Implementar Task 1',
      toolUseId: 'toolu_01XYZ',
      spawnDepth: 1,
    });
  });

  it('returns null when the meta file does not exist', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    expect(readSubAgentMeta(jsonl)).toBeNull();
  });

  it('returns null when the meta file is not valid JSON', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', '{not json');
    expect(readSubAgentMeta(jsonl)).toBeNull();
  });

  it('returns null when toolUseId is missing or not a string', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', JSON.stringify({ agentType: 'Explore', spawnDepth: 2 }));
    expect(readSubAgentMeta(jsonl)).toBeNull();
  });

  it('omits optional fields with wrong types instead of failing', () => {
    const jsonl = write('agent-abc123.jsonl', '');
    write('agent-abc123.meta.json', JSON.stringify({
      toolUseId: 'toolu_01A',
      agentType: 42,
      spawnDepth: 'two',
    }));
    expect(readSubAgentMeta(jsonl)).toEqual({ toolUseId: 'toolu_01A' });
  });
});
