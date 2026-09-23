import { describe, expect, it } from 'vitest';
import { barWidth, greeting, seats, trend, waited } from '@/lib/admin/dashboard';

/** An instant given as UTC, so each case states the IST hour it is testing. */
const at = (utc: string) => new Date(utc);

describe('greeting', () => {
  it('reads the clock in IST, not in the render region', () => {
    expect(greeting(at('2026-09-22T03:00:00Z'))).toBe('Good morning'); // 8:30 am IST
    expect(greeting(at('2026-09-22T09:00:00Z'))).toBe('Good afternoon'); // 2:30 pm IST
    expect(greeting(at('2026-09-22T13:00:00Z'))).toBe('Good evening'); // 6:30 pm IST
  });

  it('calls the small hours morning rather than yesterday evening', () => {
    expect(greeting(at('2026-09-21T19:00:00Z'))).toBe('Good morning'); // 12:30 am IST
  });
});

describe('trend', () => {
  it('reports a percentage against last week', () => {
    expect(trend(14, 10, 'last week')).toEqual({ direction: 'up', label: '+40% vs last week' });
    expect(trend(6, 10, 'last week')).toEqual({ direction: 'down', label: '-40% vs last week' });
  });

  it('never divides by a zero baseline', () => {
    expect(trend(3, 0, 'last week')).toEqual({ direction: 'up', label: 'last week had none' });
    expect(trend(0, 0, 'last week')).toEqual({
      direction: 'flat',
      label: 'Nothing last week either',
    });
  });

  it('calls a change too small to round to a percent flat', () => {
    expect(trend(100, 100, 'last week').direction).toBe('flat');
    expect(trend(1002, 1000, 'last week').label).toBe('Same as last week'); // +0.2%
    expect(trend(998, 1000, 'last week').direction).toBe('flat'); // -0.2%, not "-0%"
  });
});

describe('waited', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it('counts minutes, then hours, then days', () => {
    expect(waited(ago(42), now)).toBe('42 min');
    expect(waited(ago(72), now)).toBe('1 h 12 min');
    expect(waited(ago(120), now)).toBe('2 h');
    expect(waited(ago(60 * 24 * 3), now)).toBe('3 days');
    expect(waited(ago(60 * 25), now)).toBe('1 day');
  });

  it('treats a clock skew into the future as no wait at all', () => {
    expect(waited(ago(-5), now)).toBe('0 min');
  });
});

describe('barWidth', () => {
  it('is relative to the biggest row', () => {
    expect(barWidth(18, 18)).toBe(100);
    expect(barWidth(9, 18)).toBe(50);
  });

  it('keeps a single enquiry visible and an empty row empty', () => {
    expect(barWidth(1, 200)).toBe(6);
    expect(barWidth(0, 18)).toBe(0);
    expect(barWidth(5, 0)).toBe(0);
  });
});

describe('seats', () => {
  it('marks four or fewer as low, matching the public badge rule', () => {
    expect(seats({ seatsLeft: 4, seatsTotal: 20 })).toEqual({ fill: 20, low: true, left: 4 });
    expect(seats({ seatsLeft: 5, seatsTotal: 20 }).low).toBe(false);
  });

  it('never reports a negative or over-full bar', () => {
    expect(seats({ seatsLeft: 0, seatsTotal: 20 })).toEqual({ fill: 0, low: false, left: 0 });
    expect(seats({ seatsLeft: 30, seatsTotal: 20 }).fill).toBe(100);
    expect(seats({ seatsLeft: 0, seatsTotal: 0 }).fill).toBe(0);
  });
});
