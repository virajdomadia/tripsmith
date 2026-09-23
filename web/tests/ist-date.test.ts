import { describe, expect, it } from 'vitest';
import { istFullDate, istShortDate, istTime } from '@/components/admin/enquiries/ist-date';

describe('IST calendar day', () => {
  it('reads a timestamp on the owner’s clock, not UTC’s', () => {
    // 20:30 UTC on the 19th is already 02:00 IST on the 20th.
    expect(istShortDate('2026-11-19T20:30:00Z')).toBe('20 Nov');
    expect(istFullDate('2026-11-19T20:30:00Z')).toBe('Fri 20 Nov 2026');
  });

  it('keeps an 18:29 UTC enquiry on the same IST day', () => {
    expect(istShortDate('2026-11-19T18:29:00Z')).toBe('19 Nov');
  });

  it('rolls the year over at the IST boundary', () => {
    expect(istFullDate('2026-12-31T19:00:00Z')).toBe('Fri 1 Jan 2027');
  });

  it('names September “Sep”, as the rest of the app does', () => {
    // Some ICU builds render Intl's `short` month as "Sept"; the month must come from `MONTHS`.
    expect(istShortDate('2026-09-22T06:14:00Z')).toBe('22 Sep');
  });
});

describe('IST time of day', () => {
  it('shifts by five and a half hours', () => {
    expect(istTime('2026-09-22T06:14:00Z')).toBe('11:44 am');
  });
});
