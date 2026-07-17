import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TodosWatcher } from '../../src/services/todosWatcher';

describe('TodosWatcher', () => {
  let w: TodosWatcher | null = null;
  afterEach(() => { w?.dispose(); w = null; });

  it('fires onChange when a file changes under projects/, and dispose() unsubscribes', async () => {
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-'));
    const projects = path.join(claudeDir, 'projects');
    fs.mkdirSync(projects, { recursive: true });
    w = new TodosWatcher(claudeDir);

    let hits = 0;
    const sub = w.onChange(() => { hits++; });

    await new Promise(r => setTimeout(r, 50));
    fs.writeFileSync(path.join(projects, 'a.jsonl'), 'x');
    await new Promise(r => setTimeout(r, 400)); // > debounce (150ms)
    expect(hits).toBeGreaterThanOrEqual(1);

    const afterDispose = hits;
    sub.dispose();
    fs.writeFileSync(path.join(projects, 'b.jsonl'), 'y');
    await new Promise(r => setTimeout(r, 400));
    expect(hits).toBe(afterDispose);
  });
});
