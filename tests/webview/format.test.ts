import { describe, it, expect } from 'vitest';
import { formatCompact, shortModel } from '../../src/webview/format';

describe('formatCompact', () => {
  it('formats values below 1000 as-is', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(433)).toBe('433');
    expect(formatCompact(999)).toBe('999');
  });
  it('formats thousands with a comma decimal and k suffix', () => {
    expect(formatCompact(1000)).toBe('1k');
    expect(formatCompact(7361)).toBe('7,4k');
    expect(formatCompact(24580)).toBe('24,6k');
  });
  it('formats millions with M suffix', () => {
    expect(formatCompact(1_500_000)).toBe('1,5M');
    expect(formatCompact(2_000_000)).toBe('2M');
  });
  it('clamps negative/non-finite to 0', () => {
    expect(formatCompact(-5)).toBe('0');
    expect(formatCompact(NaN)).toBe('0');
  });
});

describe('shortModel', () => {
  it('strips the claude- prefix', () => {
    expect(shortModel('claude-opus-4-8')).toBe('opus-4-8');
    expect(shortModel('claude-sonnet-4-6')).toBe('sonnet-4-6');
  });
  it('leaves unknown formats untouched', () => {
    expect(shortModel('gpt-x')).toBe('gpt-x');
  });
});
