// Orquestra os convites da ativação: primeiro o do hook, depois (encadeado) o das
// task tools, para nunca haver duas notificações-convite ao mesmo tempo. Puro, sem
// `vscode`, para ser testável; a extensão só liga as dependências.

export type HookPromptOutcome = 'not-needed' | 'installed' | 'install-failed' | 'not-now' | 'dismissed';

export interface ActivationPromptDeps {
  /** Só resolve quando há resposta; notificação ignorada = nunca resolve. */
  promptHook(): Promise<HookPromptOutcome>;
  /** O toast "hooks instalados" de sempre. */
  confirmHookInstalled(): void;
  /** Avaliado DEPOIS do convite do hook. */
  shouldOfferTaskTools(): boolean;
  promptTaskTools(afterHook: boolean): Promise<void>;
}

export async function runActivationPrompts(d: ActivationPromptDeps): Promise<void> {
  const outcome = await d.promptHook();
  const offer = d.shouldOfferTaskTools();
  if (outcome === 'installed') {
    if (offer) await d.promptTaskTools(true);
    else d.confirmHookInstalled();
    return;
  }
  if (offer) await d.promptTaskTools(false);
}
