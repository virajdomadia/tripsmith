import { describe, expect, it } from 'vitest';
import { formatInr, rupeesToPaise } from '../src/money';

describe('formatInr', () => {
  it('groups en-IN and drops paise', () => {
    expect(formatInr(1499900)).toBe('₹14,999');
    expect(formatInr(12345678900)).toBe('₹12,34,56,789');
  });
  it('rounds stray paise', () => expect(formatInr(1499950)).toBe('₹15,000'));
});

describe('rupeesToPaise', () => {
  it('multiplies by 100', () => expect(rupeesToPaise(14999)).toBe(1499900));
  it('rejects fractions and negatives', () => {
    expect(() => rupeesToPaise(1.5)).toThrow();
    expect(() => rupeesToPaise(-1)).toThrow();
  });
});
