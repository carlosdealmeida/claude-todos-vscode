import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// O walkthrough "Comece com o Claude Todos" e declarado em package.json e
// traduzido via package.nls*.json. Nada verificava que cada passo resolve suas
// chaves %walkthrough.*%, que a midia existe no disco e que os comandos citados
// (completionEvents e links `command:`) estao declarados em contributes.commands
// — um typo num id de comando vira um botao morto no Get Started, sem erro.

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const nls: Record<string, string> = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.nls.json'), 'utf8'));

interface Step {
  id: string;
  title: string;
  description: string;
  media?: { svg?: string; markdown?: string; image?: string };
  completionEvents?: string[];
}

const steps: Step[] = pkg.contributes.walkthroughs[0].steps;
const commandIds: string[] = pkg.contributes.commands.map((c: { command: string }) => c.command);

function nlsKey(ref: string): string | null {
  const m = /^%(.+)%$/.exec(ref);
  return m ? m[1] : null;
}

describe('walkthrough "Get started"', () => {
  it('every step resolves its title and description in package.nls.json', () => {
    for (const step of steps) {
      for (const ref of [step.title, step.description]) {
        const key = nlsKey(ref);
        expect(key, `${step.id}: ${ref} should be a %key% reference`).not.toBeNull();
        expect(nls[key!], `${step.id}: missing nls key ${key}`).toBeTruthy();
      }
    }
  });

  it('every step media file exists on disk', () => {
    for (const step of steps) {
      const file = step.media?.svg ?? step.media?.markdown ?? step.media?.image;
      expect(file, `${step.id}: media missing`).toBeTruthy();
      expect(fs.existsSync(path.join(ROOT, file!)), `${step.id}: ${file} not found`).toBe(true);
    }
  });

  it('every onCommand completion event and every command: link points to a declared command', () => {
    for (const step of steps) {
      for (const ev of step.completionEvents ?? []) {
        const m = /^onCommand:(.+)$/.exec(ev);
        if (!m) continue;
        expect(commandIds, `${step.id}: completion command ${m[1]} not declared`).toContain(m[1]);
      }
      const description = nls[nlsKey(step.description)!];
      for (const m of description.matchAll(/\(command:([^)]+)\)/g)) {
        expect(commandIds, `${step.id}: link command ${m[1]} not declared`).toContain(m[1]);
      }
    }
  });

  // R2 passo 2: o passo que religa as task tools vem logo depois do hook e antes
  // de "inicie uma sessao" — hook e flag sao os dois pre-requisitos do painel.
  it('has the enableTaskTools step right after installHook and before startSession', () => {
    const ids = steps.map(s => s.id);
    expect(ids.indexOf('enableTaskTools')).toBe(ids.indexOf('installHook') + 1);
    expect(ids.indexOf('enableTaskTools')).toBeLessThan(ids.indexOf('startSession'));
    const step = steps.find(s => s.id === 'enableTaskTools')!;
    expect(step.completionEvents).toEqual(['onCommand:claudeTodos.enableTaskTools']);
    expect(nls['walkthrough.enableTaskTools.description']).toContain('(command:claudeTodos.enableTaskTools)');
  });
});
