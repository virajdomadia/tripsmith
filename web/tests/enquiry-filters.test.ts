import { describe, expect, it } from 'vitest';
import { csvHref, filterHref, parseFilters, toQuery } from '@/lib/admin/enquiry-filters';

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
    const f = parseFilters({ status: 'archived', type: 'callback', from: 'yesterday', page: '0' });
    expect(f.status).toBeUndefined();
    expect(f.type).toBeUndefined();
    expect(f.from).toBeUndefined();
    expect(f.page).toBe(1);
  });

  it('takes the first value when a param repeats', () => {
    expect(parseFilters({ status: ['new', 'closed'] }).status).toBe('new');
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
