import { describe, expect, it } from 'vitest';
import { duration, formatDate, inr, mealsLabel, shortDate } from '../src/lib/format';

describe('format helpers', () => {
  it('renders paise as whole rupees with Indian grouping', () => {
    expect(inr(14_499_00)).toBe('₹14,499');
    expect(inr(1_25_000_00)).toBe('₹1,25,000');
    expect(inr(0)).toBe('₹0');
  });
  it('renders ISO dates as "Fri 20 Nov 2026" regardless of the host timezone', () => {
    expect(formatDate('2026-11-20')).toBe('Fri 20 Nov 2026');
    expect(formatDate('2027-01-01')).toBe('Fri 1 Jan 2027');
    expect(shortDate('2026-12-18')).toBe('18 Dec');
  });
  it('labels duration and meals', () => {
    expect(duration(3, 4)).toBe('3N / 4D');
    expect(mealsLabel({ breakfast: true, lunch: false, dinner: true })).toBe('Breakfast · Dinner');
    expect(mealsLabel({ breakfast: false, lunch: false, dinner: false })).toBe('No meals');
  });
});
