import { describe, expect, it } from 'vitest';
import { packageSchema, searchParamsSchema } from '../src/schemas/catalog';

describe('searchParamsSchema', () => {
  it('parses CSV arrays and coerces numbers', () => {
    const r = searchParamsSchema.parse({
      destination: 'goa,kerala',
      themes: 'beach',
      maxBudget: '25000',
      month: '2026-11',
    });
    expect(r).toEqual({
      destination: ['goa', 'kerala'],
      themes: ['beach'],
      maxBudget: 25000,
      month: '2026-11',
      sort: 'price-asc',
    });
  });
  it('treats blank-but-present params (an empty GET form) as absent', () => {
    const r = searchParamsSchema.parse({
      destination: '',
      maxBudget: '',
      nightsMin: '',
      nightsMax: '',
      themes: '',
      month: '',
      sort: '',
    });
    expect(r).toEqual({ sort: 'price-asc' });
  });
  it('rejects nightsMin greater than nightsMax', () => {
    const r = searchParamsSchema.safeParse({ nightsMin: '5', nightsMax: '3' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['nightsMax']);
    expect(searchParamsSchema.safeParse({ nightsMin: '3', nightsMax: '3' }).success).toBe(true);
  });
  it('rejects a bad month and a bad theme', () => {
    expect(searchParamsSchema.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ themes: 'space' }).success).toBe(false);
  });
});

describe('packageSchema', () => {
  const base = {
    slug: 'x',
    destinationSlug: 'goa',
    name: 'X',
    summary: 's',
    themes: ['beach'],
    nights: 1,
    days: 2,
    departureCity: 'Ex-Mumbai',
    highlights: ['a', 'b', 'c'],
    inclusions: ['i'],
    exclusions: ['e'],
    hotels: [{ name: 'H', city: 'C', stars: 3, nights: 1 }],
    faq: [],
    itinerary: [
      {
        dayNo: 1,
        title: 't',
        description: 'd',
        mealB: false,
        mealL: false,
        mealD: true,
        stay: 'C',
      },
      {
        dayNo: 2,
        title: 't',
        description: 'd',
        mealB: true,
        mealL: false,
        mealD: false,
        stay: null,
      },
    ],
    departures: [
      {
        date: '2026-11-14',
        seatsTotal: 20,
        guaranteed: false,
        priceDoublePaise: 1,
        priceTriplePaise: 1,
        priceChildPaise: 1,
        singleSupplementPaise: 0,
      },
    ],
  };
  it('accepts a consistent package', () =>
    expect(packageSchema.safeParse(base).success).toBe(true));
  it('rejects days !== nights + 1', () =>
    expect(packageSchema.safeParse({ ...base, days: 3 }).success).toBe(false));
  it('rejects an itinerary shorter than days', () =>
    expect(
      packageSchema.safeParse({ ...base, itinerary: base.itinerary.slice(0, 1) }).success,
    ).toBe(false));
  it('rejects more than 3 themes', () =>
    expect(
      packageSchema.safeParse({ ...base, themes: ['beach', 'hills', 'family', 'heritage'] })
        .success,
    ).toBe(false));
});
