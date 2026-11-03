import { describe, it, expect } from 'vitest';
import { acceptTheme } from '../src/themePick';
import type { UiThemeId } from '../src/themes';
import pkg from '../package.json';

function harness(over: { selected?: UiThemeId; write?: (id: UiThemeId) => Promise<void>; effective?: UiThemeId } = {}) {
  const pushed: UiThemeId[] = [];
  const written: UiThemeId[] = [];
  const errors: unknown[] = [];
  const run = acceptTheme({
    selected: over.selected,
    saved: 'classic',
    write: over.write ?? (async (id) => { written.push(id); }),
    read: () => over.effective ?? 'papel',
    push: (t) => pushed.push(t),
    onError: (e) => errors.push(e),
  });
  return { run, pushed, written, errors };
}

describe('acceptTheme', () => {
  it('grava a escolha e mostra o tema que passou a valer', async () => {
    const h = harness({ selected: 'papel' });
    await h.run;
    expect(h.written).toEqual(['papel']);
    expect(h.pushed).toEqual(['papel']);
    expect(h.errors).toEqual([]);
  });

  it('mostra o tema efetivo, mesmo que nao seja o escolhido', async () => {
    const h = harness({ selected: 'papel', effective: 'classic' });
    await h.run;
    expect(h.pushed).toEqual(['classic']);
  });

  it('Enter com filtro sem resultado cancela: volta ao salvo e nao grava', async () => {
    const h = harness({ selected: undefined });
    await h.run;
    expect(h.written).toEqual([]);
    expect(h.pushed).toEqual(['classic']);
  });

  it('falha ao gravar: volta ao salvo e avisa', async () => {
    const boom = new Error('settings.json com erro');
    const h = harness({ selected: 'papel', write: async () => { throw boom; } });
    await h.run;
    expect(h.pushed).toEqual(['classic']);
    expect(h.errors).toEqual([boom]);
  });
});

describe('setting claudeTodos.theme', () => {
  // Sem isso, um valor de workspace venceria o que o QuickPick grava em Global,
  // e a escolha pareceria nao funcionar.
  it('tem escopo de aplicacao, como no JetBrains', () => {
    const prop = (pkg as any).contributes.configuration.properties['claudeTodos.theme'];
    expect(prop.scope).toBe('application');
  });
});
