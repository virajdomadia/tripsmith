import { describe, expect, it } from 'vitest';
import {
  clampDeskPage,
  deskCsvHref,
  deskHref,
  deskQuery,
  manifestHref,
  parseDeskFilters,
  stateLabel,
} from '@/lib/admin/booking-filters';

describe('parseDeskFilters', () => {
  it('defaults to the unfiltered first page', () => {
    expect(parseDeskFilters({})).toEqual({
      status: undefined,
      flag: undefined,
      packageId: undefined,
      departureId: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
      page: 1,
    });
  });

  it('reads every supported param and drops what the api would reject', () => {
    expect(
      parseDeskFilters({
        status: 'confirmed',
        flag: 'refund',
        packageId: 'pkg_1',
        departureId: 'dep_1',
        from: '2026-10-01',
        to: '2026-10-31',
        q: '  TB-7F3K2Q ',
        page: '2',
      }),
    ).toEqual({
      status: 'confirmed',
      flag: 'refund',
      packageId: 'pkg_1',
      departureId: 'dep_1',
      from: '2026-10-01',
      to: '2026-10-31',
      q: 'TB-7F3K2Q',
      page: 2,
    });
    const bad = parseDeskFilters({
      status: 'lost',
      flag: 'urgent',
      departureId: 'x'.repeat(41),
      from: '2026-10-31',
      to: '2026-10-01',
      page: '-4',
    });
    expect(bad).toMatchObject({
      status: undefined,
      flag: undefined,
      departureId: undefined,
      from: '2026-10-31',
      to: undefined,
      page: 1,
    });
  });
});

describe('desk links', () => {
  const f = parseDeskFilters({ status: 'pending', departureId: 'dep_1', page: '3' });

  it('changing a filter goes back to page 1; paging keeps the rest', () => {
    expect(deskHref(f, { flag: 'cancellation' })).toBe(
      '/admin/bookings?status=pending&flag=cancellation&departureId=dep_1',
    );
    expect(deskHref(f, { page: 4 })).toBe(
      '/admin/bookings?status=pending&departureId=dep_1&page=4',
    );
    expect(deskHref(parseDeskFilters({}), {})).toBe('/admin/bookings');
  });

  it('the CSV is the whole filtered view, never a page', () => {
    expect(deskCsvHref(f)).toBe('/api/admin/bookings.csv?status=pending&departureId=dep_1');
  });

  it('clamps a page past the end', () => {
    expect(clampDeskPage(f, 2)).toBe('/admin/bookings?status=pending&departureId=dep_1&page=2');
    expect(clampDeskPage(f, 3)).toBeNull();
  });

  it('forwards only set values to the api', () => {
    expect(deskQuery(parseDeskFilters({ q: 'asha' }))).toMatchObject({
      q: 'asha',
      page: undefined,
    });
  });

  it('builds the manifest address', () => {
    expect(manifestHref('dep 1')).toBe('/admin/departures/dep%201/manifest');
  });
});

describe('stateLabel', () => {
  it('says whether a pending hold still runs, and why a booking was cancelled', () => {
    expect(stateLabel({ status: 'pending', holdLive: true, cancelReason: null })).toBe(
      'Pending · hold live',
    );
    expect(stateLabel({ status: 'pending', holdLive: false, cancelReason: null })).toBe(
      'Pending · hold lapsed',
    );
    expect(
      stateLabel({ status: 'cancelled', holdLive: false, cancelReason: 'owner_released' }),
    ).toBe('Cancelled · Released by owner');
    expect(stateLabel({ status: 'confirmed', holdLive: false, cancelReason: null })).toBe(
      'Confirmed',
    );
  });
});
