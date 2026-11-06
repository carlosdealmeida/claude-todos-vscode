import { describe, it, expect, vi } from 'vitest';
import { runActivationPrompts, type ActivationPromptDeps, type HookPromptOutcome } from '../src/activationPrompts';

function deps(over: Partial<ActivationPromptDeps> & { outcome?: HookPromptOutcome; offer?: boolean } = {}) {
  const { outcome = 'not-needed', offer = true, ...rest } = over;
  return {
    promptHook: vi.fn(async () => outcome),
    confirmHookInstalled: vi.fn(),
    shouldOfferTaskTools: vi.fn(() => offer),
    promptTaskTools: vi.fn(async () => {}),
    ...rest,
  };
}

describe('runActivationPrompts', () => {
  it('hook not needed → offers the task tools', async () => {
    const d = deps({ outcome: 'not-needed' });
    await runActivationPrompts(d);
    expect(d.promptTaskTools).toHaveBeenCalledWith(false);
    expect(d.confirmHookInstalled).not.toHaveBeenCalled();
  });

  it('hook installed → task tools prompt replaces the confirmation', async () => {
    const d = deps({ outcome: 'installed' });
    await runActivationPrompts(d);
    expect(d.promptTaskTools).toHaveBeenCalledWith(true);
    expect(d.confirmHookInstalled).not.toHaveBeenCalled();
  });

  it('hook installed and nothing to offer → shows the confirmation', async () => {
    const d = deps({ outcome: 'installed', offer: false });
    await runActivationPrompts(d);
    expect(d.confirmHookInstalled).toHaveBeenCalledTimes(1);
    expect(d.promptTaskTools).not.toHaveBeenCalled();
  });

  it.each(['not-now', 'dismissed', 'install-failed'] as const)('hook %s → offers afterwards', async (outcome) => {
    const d = deps({ outcome });
    await runActivationPrompts(d);
    expect(d.promptTaskTools).toHaveBeenCalledWith(false);
    expect(d.confirmHookInstalled).not.toHaveBeenCalled();
  });

  it('hook prompt ignored → task tools prompt never shows', async () => {
    const d = deps({ promptHook: () => new Promise(() => {}) });
    void runActivationPrompts(d);
    await new Promise(r => setTimeout(r, 0));
    expect(d.promptTaskTools).not.toHaveBeenCalled();
  });

  it('nothing to offer → no task tools prompt', async () => {
    const d = deps({ outcome: 'not-needed', offer: false });
    await runActivationPrompts(d);
    expect(d.promptTaskTools).not.toHaveBeenCalled();
    expect(d.confirmHookInstalled).not.toHaveBeenCalled();
  });
});
