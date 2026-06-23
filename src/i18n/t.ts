import { messages, type MessageKey } from './messages';
import type { Locale } from './locale';

// Cria a função de tradução para um locale. Lookup no locale; fallback para en
// se a chave faltar; se faltar até em en, devolve a própria chave. Interpola
// ocorrências de {param} a partir de `params`.
export function createT(locale: Locale) {
  const table = messages[locale] ?? messages.en;
  const fallback = messages.en;
  return (key: MessageKey, params?: Record<string, string | number>): string => {
    let s: string = (table as Record<string, string>)[key]
      ?? (fallback as Record<string, string>)[key]
      ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.split('{' + k + '}').join(String(v));
      }
    }
    return s;
  };
}
