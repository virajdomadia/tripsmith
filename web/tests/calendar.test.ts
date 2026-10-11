import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  busyTrip,
  calendarHref,
  fillOf,
  needsOf,
  parseCalendarParams,
  shiftMonth,
  shown,
  stripOf,
  weeksOf,
} from '../src/lib/admin/calendar';
import { dep, pkg } from './calendar-fixtures';

/** P11 (R50): the calendar's pure helpers — month maths, fill state, URL, strip, needs. */

describe('month maths', () => {
  it('lays a month out in Sunday-first weeks with the neighbours padded in', () => {
    const w = weeksOf('2026-11'); // 1 Nov 2026 is a Sunday
    expect(w[0]![0]).toBe('2026-11-01');
    expect(w.at(-1)!.at(-1)).toBe('2026-12-05');
    expect(w).toHaveLength(5);
    expect(weeksOf('2026-10')[0]![0]).toBe('2026-09-27');
  });

  it('steps months across the year end', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });
});

describe('fill state', () => {
  it('is sold out with nothing free, else by (sold + held) ÷ seats', () => {
    expect(fillOf(dep({ sold: 18, held: 2, free: 0 }))).toBe('full');
    expect(fillOf(dep({ sold: 12, held: 2, free: 6 }))).toBe('hot'); // 70 %
    expect(fillOf(dep({ sold: 12, held: 1, free: 7 }))).toBe('open'); // 65 %
    expect(fillOf(dep({ sold: 7, held: 0, free: 13 }))).toBe('open'); // 35 %
    expect(fillOf(dep({ sold: 6, held: 0, free: 14 }))).toBe('low'); // 30 %
  });
});

describe('the URL', () => {
  it('round-trips month, filters and the open departure, dropping junk', () => {
    const p = parseCalendarParams({
      month: '2026-11',
      dest: 'x1',
      package: 'p1',
      leader: 'l1',
      dep: 'd1',
    });
    expect(p).toEqual({ month: '2026-11', dest: 'x1', pkg: 'p1', leader: 'l1', dep: 'd1' });
    expect(calendarHref(p)).toBe('/admin/calendar?month=2026-11&dest=x1&package=p1&leader=l1&dep=d1');
    expect(parseCalendarParams({ month: '2026-13', dep: '<x>' })).toMatchObject({
      month: null,
      dep: null,
    });
    expect(calendarHref({})).toBe('/admin/calendar');
  });
});

describe('filters and the strip', () => {
  const pkgs = [pkg(), pkg({ id: 'p2', destinationId: 'x2', name: 'Goa' })];
  const deps = [
    dep(),
    dep({ id: 'd2', packageId: 'p2', leaderId: 'l1', sold: 20, held: 0, free: 0, firstDueOn: '2099-10-01' }),
    dep({ id: 'd3', missingTravellers: 3, balancePaise: 0, balanceBookings: 0, firstDueOn: null }),
  ];

  it('filters by destination, package and leader', () => {
    expect(shown(deps, pkgs, { dest: 'x2', pkg: '', leader: '' }).map((d) => d.id)).toEqual(['d2']);
    expect(shown(deps, pkgs, { dest: '', pkg: 'p1', leader: '' })).toHaveLength(2);
    expect(shown(deps, pkgs, { dest: '', pkg: '', leader: 'l1' }).map((d) => d.id)).toEqual(['d2']);
  });

  it('sums what is shown — the desk CSV columns per departure', () => {
    const s = stripOf(deps);
    expect(s).toMatchObject({
      departures: 3,
      soldOut: 1,
      seats: 60,
      sold: 40,
      held: 4,
      soldPercent: 67,
      revenuePaise: 3 * 64_990_00,
      collectedPaise: 3 * 50_000_00,
      balancePaise: 2 * 14_990_00,
      balanceBookings: 2,
      firstDueOn: '2099-10-01',
      missing: 3,
      missingDepartures: 1,
    });
    expect(stripOf([]).soldPercent).toBe(0);
  });
});

describe('needs you', () => {
  const today = '2099-10-01';
  it('flags a waitlist that fits, low fill, details and a balance due soon', () => {
    const n = needsOf(
      dep({
        date: '2099-11-20',
        sold: 2,
        held: 0,
        free: 18,
        smallestWaitingParty: 2,
        missingTravellers: 1,
        firstDueOn: '2099-10-10',
      }),
      today,
    ).map((x) => x.text);
    expect(n).toEqual([
      'Waitlist fits the free seats',
      'Low fill · 50 days out',
      'Details missing · 1',
      'Balance due Sat 10 Oct',
    ]);
  });

  it('asks nothing of a past date or a healthy one', () => {
    expect(needsOf(dep({ date: '2099-09-01', missingTravellers: 4 }), today)).toEqual([]);
    expect(needsOf(dep({ firstDueOn: '2099-12-01' }), today)).toEqual([]);
  });
});

describe('busy leaders', () => {
  const trips = [
    { leaderId: 'l1', departureId: 'd1', packageName: 'Leh', date: '2099-11-06', returns: '2099-11-12' },
  ];
  it('counts the return day and the start day as overlapping', () => {
    expect(busyTrip(trips, 'l1', '2099-11-12', 2)).toBeTruthy();
    expect(busyTrip(trips, 'l1', '2099-11-03', 3)).toBeTruthy();
    expect(busyTrip(trips, 'l1', '2099-11-13', 2)).toBeUndefined();
    expect(busyTrip(trips, 'l1', '2099-11-02', 3)).toBeUndefined();
    expect(busyTrip(trips, 'l2', '2099-11-08', 2)).toBeUndefined();
  });
});

describe('motion', () => {
  it('stops the bars, slides and flash under reduced motion', () => {
    const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.cal-bar i,\s*\.cal-slide-next,\s*\.cal-slide-prev,\s*\[data-flash\]\s*\{\s*animation: none;/);
  });
});
