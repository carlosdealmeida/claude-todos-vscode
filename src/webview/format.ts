// Compact token formatting for the panel: 7361 -> "7,4k", 24580 -> "24,6k".
// Uses a comma decimal separator to match pt-BR.
export function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  const units = [
    { v: 1_000_000, s: 'M' },
    { v: 1_000, s: 'k' },
  ];
  for (const u of units) {
    if (n >= u.v) {
      const rounded = Math.round((n / u.v) * 10) / 10;
      const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace('.', ',');
      return str + u.s;
    }
  }
  return String(Math.round(n));
}

// "claude-opus-4-8" -> "opus-4-8"
export function shortModel(model: string): string {
  return model.startsWith('claude-') ? model.slice('claude-'.length) : model;
}

export type ContextLevel = 'ok' | 'warn' | 'danger';

// Maps a context-fill ratio (0..1+) to a traffic-light level:
// ok < 0.60 <= warn < 0.85 <= danger.
export function contextLevel(pct: number): ContextLevel {
  if (pct >= 0.85) return 'danger';
  if (pct >= 0.60) return 'warn';
  return 'ok';
}
