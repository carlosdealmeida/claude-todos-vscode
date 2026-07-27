export type Locale = 'en' | 'pt-br' | 'es' | 'zh-cn' | 'zh-tw';

// Escrita tradicional: Taiwan, Hong Kong e Macau. O resto do mundo sinofono
// (China continental, Singapura) e o `zh` sem regiao usam simplificado.
const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo']);

// Recebe a tag ja em minusculas (normalizeLocale aplica toLowerCase antes).
function normalizeChinese(tag: string): Locale {
  const parts = tag.split(/[-_]/);
  // O subtag de script, quando presente, manda mais que a regiao:
  // `zh-Hant-CN` e tradicional apesar do CN.
  if (parts.includes('hant')) return 'zh-tw';
  if (parts.includes('hans')) return 'zh-cn';
  // Procura a regiao em qualquer subtag apos o idioma (nao so a ultima), para
  // bater com o Kotlin (que le loc.country diretamente) mesmo com sufixos
  // extras depois da regiao, ex.: `zh-TW-x-algo`.
  return parts.slice(1).some((p) => TRADITIONAL_REGIONS.has(p)) ? 'zh-tw' : 'zh-cn';
}

// Mapeia qualquer tag de idioma do VS Code para um dos locales suportados.
// Português (qualquer variante) -> pt-br; espanhol -> es; chinês -> zh-cn ou
// zh-tw conforme script/região; resto -> en.
export function normalizeLocale(raw: string | undefined): Locale {
  const tag = (raw ?? '').toLowerCase();
  if (tag.startsWith('pt')) return 'pt-br';
  if (tag.startsWith('es')) return 'es';
  if (tag.startsWith('zh')) return normalizeChinese(tag);
  return 'en';
}

// Escolha pura do locale: usa o valor forçado pela config quando não for 'auto',
// senão cai para o idioma de exibição do VS Code. Sempre normaliza no fim.
export function resolveLocaleFrom(forced: string | undefined, envLanguage: string): Locale {
  if (forced && forced !== 'auto') return normalizeLocale(forced);
  return normalizeLocale(envLanguage);
}
