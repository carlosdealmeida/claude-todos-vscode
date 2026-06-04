import { describe, it, expect } from 'vitest';
import { formatCompact, shortModel, contextLevel } from '../../src/webview/format';

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

describe('contextLevel', () => {
  it('is ok below 60%', () => {
    expect(contextLevel(0)).toBe('ok');
    expect(contextLevel(0.59)).toBe('ok');
  });
  it('is warn from 60% up to (but not including) 85%', () => {
    expect(contextLevel(0.60)).toBe('warn');
    expect(contextLevel(0.84)).toBe('warn');
  });
  it('is danger at 85% and above', () => {
    expect(contextLevel(0.85)).toBe('danger');
    expect(contextLevel(1)).toBe('danger');
  });
  it('treats values above 1 as danger', () => {
    expect(contextLevel(1.5)).toBe('danger');
  });
});
