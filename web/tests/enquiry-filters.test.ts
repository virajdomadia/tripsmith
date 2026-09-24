import { describe, expect, it } from 'vitest';
import {
  clampPageHref,
  csvHref,
  filterHref,
  parseFilters,
  STATUS_MOVES,
  statusChoices,
  toQuery,
  TYPES,
  typeHeadline,
  typeLabel,
} from '@/lib/admin/enquiry-filters';

describe('parseFilters', () => {
  it('defaults to the unfiltered first page', () => {
    expect(parseFilters({})).toEqual({
      status: undefined,
      type: undefined,
      packageId: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
      page: 1,
    });
  });

  it('reads every supported param', () => {
    expect(
      parseFilters({
        status: 'contacted',
        type: 'custom',
        packageId: 'pkg_1',
        from: '2026-09-01',
        to: '2026-09-30',
        q: '  Priya  ',
        page: '3',
      }),
    ).toEqual({
      status: 'contacted',
      type: 'custom',
      packageId: 'pkg_1',
      from: '2026-09-01',
      to: '2026-09-30',
      q: 'Priya',
      page: 3,
    });
  });

  it('drops values the api would reject instead of forwarding them', () => {
    const f = parseFilters({ status: 'archived', type: 'booking', from: 'yesterday', page: '0' });
    expect(f.status).toBeUndefined();
    expect(f.type).toBeUndefined();
    expect(f.from).toBeUndefined();
    expect(f.page).toBe(1);
  });

  it('accepts every inbox type, including the v2/v3 ones (R24)', () => {
    expect(parseFilters({ type: 'callback' }).type).toBe('callback');
    expect(parseFilters({ type: 'chat-handoff' }).type).toBe('chat-handoff');
  });

  it('takes the first value when a param repeats', () => {
    expect(parseFilters({ status: ['new', 'closed'] }).status).toBe('new');
  });

  it('drops a calendar-impossible date instead of letting it roll into the next month', () => {
    expect(parseFilters({ from: '2026-02-30' }).from).toBeUndefined();
    expect(parseFilters({ to: '2026-13-45' }).to).toBeUndefined();
  });

  it('drops a packageId longer than the api accepts instead of truncating it', () => {
    const tooLong = 'p'.repeat(41);
    expect(parseFilters({ packageId: tooLong }).packageId).toBeUndefined();
    const atLimit = 'p'.repeat(40);
    expect(parseFilters({ packageId: atLimit }).packageId).toBe(atLimit);
  });

  it('drops a reversed date range, keeping from and clearing to', () => {
    const f = parseFilters({ from: '2026-09-30', to: '2026-09-01' });
    expect(f.from).toBe('2026-09-30');
    expect(f.to).toBeUndefined();
  });
});

describe('filterHref', () => {
  const base = parseFilters({ status: 'new', q: 'Priya', page: '4' });

  it('keeps the other filters and returns to page 1', () => {
    expect(filterHref(base, { status: 'contacted' })).toBe(
      '/admin/enquiries?status=contacted&q=Priya',
    );
  });

  it('keeps the page when paging is what changed', () => {
    expect(filterHref(base, { page: 2 })).toBe('/admin/enquiries?status=new&q=Priya&page=2');
  });

  it('clears a filter that is set to undefined', () => {
    expect(filterHref(base, { status: undefined })).toBe('/admin/enquiries?q=Priya');
  });

  it('is the bare path when nothing is filtered', () => {
    expect(filterHref(parseFilters({}), {})).toBe('/admin/enquiries');
  });
});

describe('csvHref', () => {
  it('points at the api through the rewrite and never carries a page', () => {
    const f = parseFilters({ status: 'converted', page: '6' });
    expect(csvHref(f)).toBe('/api/admin/enquiries.csv?status=converted');
  });
});

describe('toQuery', () => {
  it('omits page 1 so the first page has a clean URL', () => {
    expect(toQuery(parseFilters({ q: 'x' }))).toEqual({
      status: undefined,
      type: undefined,
      packageId: undefined,
      from: undefined,
      to: undefined,
      q: 'x',
      page: undefined,
    });
  });
});

describe('clampPageHref', () => {
  it('sends a page past the end to the last page, filters kept', () => {
    const f = parseFilters({ status: 'new', page: '20' });
    expect(clampPageHref(f, 3)).toBe('/admin/enquiries?status=new&page=3');
  });

  it('sends a page past the end of a one-page list to the bare first page', () => {
    expect(clampPageHref(parseFilters({ page: '4' }), 1)).toBe('/admin/enquiries');
    expect(clampPageHref(parseFilters({ page: '4' }), 0)).toBe('/admin/enquiries');
  });

  it('leaves a page in range alone', () => {
    expect(clampPageHref(parseFilters({ page: '3' }), 3)).toBeNull();
    expect(clampPageHref(parseFilters({}), 1)).toBeNull();
  });
});

describe('type labels', () => {
  it('labels all six types and falls back to the raw value for an unknown one', () => {
    expect(TYPES.map(typeLabel)).toEqual([
      'Standard',
      'Customise',
      'Contact',
      'Callback request',
      'Group enquiry',
      'From concierge',
    ]);
    expect(typeLabel('booking')).toBe('booking');
    expect(typeLabel('toString')).toBe('toString'); // own keys only, never the prototype
  });

  it('adds "enquiry" to the v1 labels only', () => {
    expect(typeHeadline('custom')).toBe('Customise enquiry');
    expect(typeHeadline('group')).toBe('Group enquiry');
    expect(typeHeadline('callback')).toBe('Callback request');
  });
});

describe('status moves (R24)', () => {
  it('never returns to new and reopens closed as contacted', () => {
    expect(Object.values(STATUS_MOVES).some((to) => to.includes('new'))).toBe(false);
    expect(STATUS_MOVES.closed).toEqual(['contacted']);
  });

  it('offers the current status plus its legal moves, in tab order', () => {
    expect(statusChoices('new')).toEqual(['new', 'contacted', 'converted', 'closed']);
    expect(statusChoices('contacted')).toEqual(['contacted', 'converted', 'closed']);
    expect(statusChoices('converted')).toEqual(['converted', 'closed']);
    expect(statusChoices('closed')).toEqual(['contacted', 'closed']);
  });
});
