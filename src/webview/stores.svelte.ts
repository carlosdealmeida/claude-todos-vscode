import type { SessionSnapshot, ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
import { createT } from '../i18n/t';
import type { Locale } from '../i18n/locale';
import { createBridge } from './bridge';

const bridge = createBridge();

class TodosStore {
  snapshot = $state<SessionSnapshot | null>(null);
  error = $state<string | null>(null);
  loading = $state(true);
  locale = $state<Locale>('en');
  t = $derived(createT(this.locale));
  projectUsage = $state<ProjectUsage | null | undefined>(undefined);
  projectUsageLoading = $state(false);

  constructor() {
    bridge.onMessage((msg) => this.handle(msg));
    this.post({ type: 'ready' });
  }

  private handle(msg: ExtensionMessage): void {
    switch (msg.type) {
      case 'snapshot':
        this.snapshot = msg.snapshot;
        this.error = null;
        this.loading = false;
        break;
      case 'error':
        this.error = msg.message;
        this.loading = false;
        break;
      case 'locale':
        this.locale = msg.locale;
        // lang correto e essencial para a unificacao Han: com lang="en" fixo o
        // navegador pode escolher glifos CJK com forma errada (ex.: zh-TW
        // renderizado com fonte japonesa/simplificada). Cobre os dois hosts
        // (VS Code e JetBrains) pois ambos carregam este mesmo bundle webview.
        document.documentElement.lang = msg.locale;
        break;
      case 'projectUsage':
        this.projectUsage = msg.usage;
        this.projectUsageLoading = false;
        break;
    }
  }

  post(msg: WebviewMessage): void {
    bridge.post(msg);
  }

  refresh(): void {
    this.post({ type: 'refresh' });
  }

  requestProjectUsage(): void {
    this.projectUsageLoading = true;
    this.post({ type: 'projectUsage' });
  }

  openTodoSource(sessionId: string, agentId: string, line: number): void {
    this.post({ type: 'openTodoSource', sessionId, agentId, line });
  }

  openPanel(): void {
    this.post({ type: 'openPanel' });
  }

  pickSession(): void {
    this.post({ type: 'pickSession' });
  }
}

export const todosStore = new TodosStore();
