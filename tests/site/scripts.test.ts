import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DemoScript } from '../../site/src/demo/types';
import type { Todo } from '../../src/types';

const DIR = path.join('site', 'src', 'demo', 'scripts');
const SITE_SRC = path.join('site', 'src');
const FEATURES = new Set(['agent-tree', 'live-tasks', 'task-timing', 'tokens-cache', 'dashboard', 'notifications', 'i18n']);
const STATUSES = new Set(['pending', 'in_progress', 'completed']);

function load(): { name: string; script: DemoScript }[] {
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')) as DemoScript }));
}

// Varredura rasa recursiva do codigo do site (svelte/ts/astro) — usada para
// verificar que cada fixture embarcada e de fato referenciada por algum
// componente, e nao so validada pelo schema abaixo enquanto fica inalcancavel
// na UI publicada.
function readSiteSource(): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.astro') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(svelte|ts|astro)$/.test(entry.name)) files.push(full);
    }
  };
  walk(SITE_SRC);
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

describe('demo scripts', () => {
  it('ships the three expected scripts', () => {
    expect(load().map((s) => s.name).sort())
      .toEqual(['contexto-critico.json', 'lista-defasada.json', 'smoke-test.json']);
  });

  it.each(load())('$name has frames ordered by atMs and within duration', ({ script }) => {
    expect(script.frames.length).toBeGreaterThan(0);
    expect(script.frames.length).toBeLessThanOrEqual(120);
    for (let i = 1; i < script.frames.length; i++) {
      expect(script.frames[i].atMs).toBeGreaterThan(script.frames[i - 1].atMs);
    }
    expect(script.frames.at(-1)!.atMs).toBeLessThanOrEqual(script.durationMs);
  });

  it.each(load())('$name conforms to the SessionSnapshot shape', ({ script }) => {
    for (const frame of script.frames) {
      const s = frame.snapshot;
      expect(typeof s.sessionId).toBe('string');
      expect(typeof s.cwd).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(typeof s.pinned).toBe('boolean');
      expect(Array.isArray(s.agents)).toBe(true);
      for (const agent of s.agents) {
        expect(typeof agent.agentId).toBe('string');
        expect(typeof agent.isMain).toBe('boolean');
        expect(typeof agent.updatedAt).toBe('number');
        agent.todos.forEach((todo: Todo) => {
          expect(STATUSES.has(todo.status)).toBe(true);
          expect(typeof todo.content).toBe('string');
          expect(typeof todo.activeForm).toBe('string');
        });
      }
    }
  });

  it.each(load())('$name uses only known feature ids in markers', ({ script }) => {
    for (const marker of script.markers) {
      expect(FEATURES.has(marker.feature)).toBe(true);
      expect(marker.atMs).toBeLessThanOrEqual(script.durationMs);
    }
  });

  it('covers every feature across the three scripts', () => {
    const covered = new Set(load().flatMap(({ script }) => script.markers.map((m) => m.feature)));
    for (const feature of FEATURES) expect(covered.has(feature)).toBe(true);
  });

  it('every embedded script is reachable from the site UI (no orphan fixture)', () => {
    const source = readSiteSource();
    for (const { name } of load()) {
      const stem = name.replace(/\.json$/, '');
      expect(source.includes(stem), `${name} is validated by the schema tests above but no file under site/src references "${stem}" — it can never be shown on the published demo`).toBe(true);
    }
  });
});
