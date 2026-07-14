import type { SessionSnapshot, ExtensionMessage, WebviewMessage, ProjectUsage } from '../types';
import { createT } from '../i18n/t';
import type { Locale } from '../i18n/locale';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewMessage): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
};

const vscode = acquireVsCodeApi();

class TodosStore {
  snapshot = $state<SessionSnapshot | null>(null);
  error = $state<string | null>(null);
  loading = $state(true);
  locale = $state<Locale>('en');
  t = $derived(createT(this.locale));
  projectUsage = $state<ProjectUsage | null | undefined>(undefined);
  projectUsageLoading = $state(false);

  constructor() {
    window.addEventListener('message', (event) => {
      const msg = event.data as ExtensionMessage;
      this.handle(msg);
    });
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
        break;
      case 'projectUsage':
        this.projectUsage = msg.usage;
        this.projectUsageLoading = false;
        break;
    }
  }

  post(msg: WebviewMessage): void {
    vscode.postMessage(msg);
  }

  refresh(): void {
    this.post({ type: 'refresh' });
  }

  requestProjectUsage(): void {
    this.projectUsageLoading = true;
    this.post({ type: 'projectUsage' });
  }

  openPanel(): void {
    this.post({ type: 'openPanel' });
  }

  pickSession(): void {
    this.post({ type: 'pickSession' });
  }
}

export const todosStore = new TodosStore();
