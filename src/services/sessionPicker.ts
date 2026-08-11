import * as path from 'path';
import type { MessageKey } from '../i18n/messages';

// Monta o `description` de um item do QuickPick de sessao (extension.ts,
// showSessionPicker): bolinha "ao vivo" (so quando a sessao esta viva) + id
// curto + pasta (so em multi-root, pra desambiguar sessoes de pastas
// distintas) + tempo relativo. Extraida pra virar testavel sem depender de
// `vscode` — era a unica string nova visivel ao usuario sem cobertura
// nenhuma (nem automatizada, nem humana no Extension Development Host).
export function sessionPickDescription(
  session: { sessionId: string; cwd: string; alive?: boolean },
  multiRoot: boolean,
  relativeTime: string,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  const parts = [
    ...(session.alive ? [`● ${t('picker.alive')}`] : []),
    session.sessionId.slice(0, 8),
    ...(multiRoot ? [path.basename(session.cwd)] : []),
    relativeTime,
  ];
  return parts.join(' · ');
}
