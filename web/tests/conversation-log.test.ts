import { describe, expect, it } from 'vitest';
import { clampLogHref, logHref, parseLogFilters, pct, tokens } from '@/lib/admin/conversations';

describe('concierge log filters (C5)', () => {
  it('keeps known values and drops anything else', () => {
    expect(parseLogFilters({ outcome: 'booking_started', page: '3', sel: 'abc_12' })).toEqual({
      outcome: 'booking_started',
      page: 3,
      sel: 'abc_12',
    });
    expect(parseLogFilters({ outcome: 'dropped', page: '0', sel: 'x'.repeat(41) })).toEqual({
      outcome: undefined,
      page: undefined,
      sel: undefined,
    });
  });

  it('trims like the inbox and sends a page past the end back to the last one', () => {
    expect(parseLogFilters({ outcome: ' open ', sel: ' c1 ' })).toEqual({
      outcome: 'open',
      page: undefined,
      sel: 'c1',
    });
    expect(clampLogHref({ outcome: 'open', page: 4 }, 2)).toBe(
      '/admin/conversations?outcome=open&page=2',
    );
    expect(clampLogHref({ page: 2 }, 2)).toBeNull();
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
    expect(pct(0, 0)).toBe('—');
  });
});
