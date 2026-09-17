import { describe, expect, expectTypeOf, it } from 'vitest';
import type { components } from '../src/lib/api-types';
import {
  activeChips,
  type ContractQuery,
  DEFAULT_SORT,
  EMPTY_QUERY,
  isFiltered,
  monthLabel,
  nightsLabel,
  parseSearchQuery,
  resultCount,
  searchHref,
  type SearchQuery,
  THEMES,
  toApiSearchParams,
  toSearchParams,
} from '../src/lib/search';

type Facets = components['schemas']['SearchFacets'];

const facets: Facets = {
  destinations: [
    { value: 'goa', label: 'Goa', count: 2 },
    { value: 'kerala', label: 'Kerala', count: 1 },
  ],
  themes: [
    { value: 'beach', label: 'Beach', count: 2 },
    { value: 'honeymoon', label: 'Honeymoon', count: 2 },
  ],
  months: [{ value: '2026-12', label: 'December 2026', count: 3 }],
  nights: { min: 3, max: 5 },
  budget: { min: 14000, max: 25000 },
};

describe('parseSearchQuery', () => {
  it('reads every filter from repeated and single params', () => {
    expect(
      parseSearchQuery({
        destination: ['goa', 'kerala'],
        maxBudget: '20000',
        nightsMin: '3',
        nightsMax: '5',
        themes: 'beach',
        month: '2026-12',
        sort: 'duration',
      }),
    ).toEqual({
      destination: ['goa', 'kerala'],
      maxBudget: 20000,
      nightsMin: 3,
      nightsMax: 5,
      themes: ['beach'],
      month: '2026-12',
      sort: 'duration',
    });
  });

  it('defaults to the empty query', () => {
    expect(parseSearchQuery({})).toEqual({ destination: [], themes: [], sort: DEFAULT_SORT });
  });

  it('drops what the api would reject instead of failing the page', () => {
    const q = parseSearchQuery({
      destination: ['Goa!', 'goa', 'goa'],
      maxBudget: '-5',
      nightsMin: '0',
      nightsMax: '31',
      themes: ['luxury', 'beach', 'beach'],
      month: '2026-13',
      sort: 'newest',
    });
    expect(q).toEqual({ destination: ['goa'], themes: ['beach'], sort: 'price-asc' });
  });

  it('caps destinations at the api limit', () => {
    expect(
      parseSearchQuery({ destination: Array.from({ length: 25 }, (_, i) => `d${i}`) }).destination,
    ).toHaveLength(20);
  });

  it('swaps a reversed nights range', () => {
    expect(parseSearchQuery({ nightsMin: '5', nightsMax: '3' })).toMatchObject({
      nightsMin: 3,
      nightsMax: 5,
    });
  });

  it('ignores blank values like the api does', () => {
    expect(parseSearchQuery({ destination: '', month: '', sort: '', maxBudget: ' ' })).toEqual({
      destination: [],
      themes: [],
      sort: 'price-asc',
    });
  });
});

describe('URL round trip', () => {
  it('serialises canonically and omits the default sort', () => {
    const q: SearchQuery = {
      destination: ['goa'],
      maxBudget: 20000,
      themes: ['beach', 'family'],
      month: '2026-12',
      sort: 'price-asc',
    };
    expect(toSearchParams(q).toString()).toBe(
      'destination=goa&maxBudget=20000&themes=beach&themes=family&month=2026-12',
    );
    expect(searchHref({ destination: [], themes: [], sort: 'price-asc' })).toBe('/packages');
    expect(searchHref({ destination: [], themes: [], sort: 'duration' })).toBe(
      '/packages?sort=duration',
    );
  });

  it('parse(serialise(q)) is q', () => {
    const q: SearchQuery = {
      destination: ['kerala', 'goa'],
      maxBudget: 25000,
      nightsMin: 4,
      nightsMax: 6,
      themes: ['honeymoon'],
      month: '2027-01',
      sort: 'price-desc',
    };
    const sp = toSearchParams(q);
    const raw = Object.fromEntries(
      [...new Set(sp.keys())].map((k) => {
        const all = sp.getAll(k);
        return [k, all.length > 1 ? all : all[0]];
      }),
    );
    expect(parseSearchQuery(raw)).toEqual(q);
  });

  it('maps to api() search params with arrays intact', () => {
    expect(
      toApiSearchParams({ destination: ['goa'], themes: [], sort: 'price-asc', maxBudget: 20000 }),
    ).toEqual({
      destination: ['goa'],
      maxBudget: '20000',
      nightsMin: undefined,
      nightsMax: undefined,
      themes: [],
      month: undefined,
      sort: 'price-asc',
    });
  });

  it('is the shape the contract accepts, with every api theme', () => {
    expectTypeOf<SearchQuery>().toMatchTypeOf<ContractQuery>();
    expectTypeOf<(typeof THEMES)[number]>().toEqualTypeOf<components['schemas']['Theme']>();
  });
});

describe('chips + labels', () => {
  it('describes every active filter with a link that removes just that one', () => {
    const q: SearchQuery = {
      destination: ['goa', 'kerala'],
      maxBudget: 20000,
      nightsMin: 4,
      themes: ['beach'],
      month: '2026-12',
      sort: 'duration',
    };
    const chips = activeChips(q, facets);
    expect(chips.map((c) => c.label)).toEqual([
      'Goa',
      'Kerala',
      'Up to ₹20,000',
      '4+ nights',
      'Beach',
      'December 2026',
    ]);
    expect(chips[0].href).toBe(
      '/packages?destination=kerala&maxBudget=20000&nightsMin=4&themes=beach&month=2026-12&sort=duration',
    );
    expect(chips[5].href).toBe(
      '/packages?destination=goa&destination=kerala&maxBudget=20000&nightsMin=4&themes=beach&sort=duration',
    );
  });

  it('falls back to the raw value when the facets no longer list it', () => {
    const q: SearchQuery = {
      destination: ['ladakh'],
      themes: [],
      month: '2027-06',
      sort: 'price-asc',
    };
    expect(activeChips(q, facets).map((c) => c.label)).toEqual(['ladakh', 'June 2027']);
  });

  it('labels nights, months, counts and "filtered"', () => {
    expect(nightsLabel(3, 5)).toBe('3–5 nights');
    expect(nightsLabel(4, 4)).toBe('4 nights');
    expect(nightsLabel(6, undefined)).toBe('6+ nights');
    expect(nightsLabel(undefined, 3)).toBe('Up to 3 nights');
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(resultCount(1)).toBe('1 package');
    expect(resultCount(0)).toBe('0 packages');
    expect(isFiltered({ destination: [], themes: [], sort: 'duration' })).toBe(false);
    expect(isFiltered({ destination: [], themes: [], month: '2026-12', sort: 'price-asc' })).toBe(
      true,
    );
  });
});

describe('home search form', () => {
  it('a submitted form with every field blank is the empty query', () => {
    expect(parseSearchQuery({ destination: '', month: '', maxBudget: '' })).toEqual(EMPTY_QUERY);
  });

  it('destination + month + budget serialise in canonical order', () => {
    const q = parseSearchQuery({ destination: 'kerala', month: '2026-12', maxBudget: '25000' });
    expect(searchHref(q)).toBe('/packages?destination=kerala&maxBudget=25000&month=2026-12');
  });
});
