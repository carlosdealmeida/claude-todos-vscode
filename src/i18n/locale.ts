export type Locale = 'en' | 'pt-br' | 'es';

// Mapeia qualquer tag de idioma do VS Code para um dos locales suportados.
// Português (qualquer variante) -> pt-br; espanhol -> es; resto -> en.
export function normalizeLocale(raw: string | undefined): Locale {
  const tag = (raw ?? '').toLowerCase();
  if (tag.startsWith('pt')) return 'pt-br';
  if (tag.startsWith('es')) return 'es';
  return 'en';
}

// Escolha pura do locale: usa o valor forçado pela config quando não for 'auto',
// senão cai para o idioma de exibição do VS Code. Sempre normaliza no fim.
export function resolveLocaleFrom(forced: string | undefined, envLanguage: string): Locale {
  if (forced && forced !== 'auto') return normalizeLocale(forced);
  return normalizeLocale(envLanguage);
}
