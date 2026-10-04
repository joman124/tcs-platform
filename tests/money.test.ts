import { describe, expect, it } from 'vitest';
import { divideCents, formatUSD, toCents, weeklyToMonthlyCents } from '../src/engine';

describe('money', () => {
  it('converts dollars to integer cents without float drift', () => {
    expect(toCents(103.31)).toBe(10331);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1239.72)).toBe(123972);
  });
  it('formats USD with thousands separators', () => {
    expect(formatUSD(123972)).toBe('$1,239.72');
    expect(formatUSD(5)).toBe('$0.05');
    expect(formatUSD(100000000)).toBe('$1,000,000.00');
  });
  it('divides and converts weekly to monthly', () => {
    expect(divideCents(10000, 3)).toBe(3333);
    expect(weeklyToMonthlyCents(10000)).toBe(43333); // $100/week * 52/12
  });
});
