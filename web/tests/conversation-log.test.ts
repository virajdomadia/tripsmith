import { describe, expect, it } from 'vitest';
import { logHref, parseLogFilters, pct, tokens } from '@/lib/admin/conversations';

describe('concierge log filters (C5)', () => {
  it('keeps known values and drops anything else', () => {
    expect(parseLogFilters({ outcome: 'booking_started', page: '3', sel: 'abc_12' })).toEqual({
      outcome: 'booking_started',
      page: 3,
      sel: 'abc_12',
    });
    expect(parseLogFilters({ outcome: 'dropped', page: '0', sel: '<x>' })).toEqual({
      outcome: undefined,
      page: undefined,
      sel: undefined,
    });
  });

  it('builds links that keep the filter and drop page 1', () => {
    expect(logHref({})).toBe('/admin/conversations');
    expect(logHref({ outcome: 'open', page: 2 }, { sel: 'c1' })).toBe(
      '/admin/conversations?outcome=open&page=2&sel=c1',
    );
    expect(logHref({ outcome: 'open', page: 1 })).toBe('/admin/conversations?outcome=open');
  });

  it('formats tokens and shares', () => {
    expect(tokens(950)).toBe('950');
    expect(tokens(1250)).toBe('1.3k');
    expect(tokens(48_000)).toBe('48k');
    expect(pct(1, 3)).toBe('33%');
    expect(pct(0, 0)).toBe('–');
  });
});
