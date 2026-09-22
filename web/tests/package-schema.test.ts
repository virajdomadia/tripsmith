import { describe, expect, it } from 'vitest';
import {
  blankDay,
  blankDeparture,
  packageSchema,
  THEMES,
  toInput,
} from '../src/lib/admin/package-schema';

const soon = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const valid = {
  slug: 'konkan-coast',
  destinationId: 'd-goa',
  name: 'Konkan Coast',
  summary: 'Three slow nights on the Konkan coast with one free beach day and a fort sunset.',
  themes: ['beach'],
  nights: 3,
  departureCity: 'Ex-Mumbai',
  highlights: ['Sunset at the fort'],
  inclusions: ['3 nights with breakfast'],
  exclusions: ['Flights'],
  hotels: [{ name: 'Lemon Tree', city: 'Candolim', stars: 4, nights: 3 }],
  faq: [{ q: 'Is it family friendly?', a: 'Yes, the beach is calm.' }],
  featured: false,
  itinerary: [1, 2, 3, 4].map(() => ({
    title: 'A day',
    description: 'Something real happens on this day of the trip.',
    meals: { breakfast: true, lunch: false, dinner: false },
    stay: 'Lemon Tree, Candolim',
  })),
  departures: [
    {
      id: null,
      date: soon(30),
      seatsTotal: 16,
      guaranteed: false,
      priceDoublePaise: 1_499_900,
      priceTriplePaise: 1_349_900,
      priceChildPaise: 899_900,
      singleSupplementPaise: 600_000,
    },
  ],
};

describe('packageSchema', () => {
  it('accepts a full record and produces the exact wire body', () => {
    const out = packageSchema.parse(valid);
    const body = toInput(out);
    expect(body.slug).toBe('konkan-coast');
    // `departures` is optional on the generated type (pydantic gives it a default), but
    // `toInput` always sends it — that is the point of having a separate mapping step.
    expect(body.departures?.[0]?.priceDoublePaise).toBe(1_499_900);
    expect(body).not.toHaveProperty('days');
    expect(body).not.toHaveProperty('status');
  });

  it('mirrors the api rules the owner can trip', () => {
    expect(packageSchema.safeParse({ ...valid, slug: 'Konkan Coast' }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, summary: 'too short' }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, nights: 0 }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, nights: 31 }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, destinationId: '' }).success).toBe(false);
  });

  it('rejects an itinerary longer than the trip, matching the api model validator', () => {
    const tooLong = { ...valid, itinerary: [...valid.itinerary, blankDay()] };
    const result = packageSchema.safeParse(tooLong);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'itinerary')).toBe(true);
    }
  });

  it('rejects two departures on the same date', () => {
    const clash = { ...valid, departures: [valid.departures[0]!, { ...valid.departures[0]! }] };
    const result = packageSchema.safeParse(clash);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'departures')).toBe(true);
    }
  });

  it('allows a parked departure with no prices so a draft can be saved', () => {
    const parked = {
      ...valid,
      departures: [{ ...valid.departures[0]!, priceDoublePaise: 0, priceChildPaise: 0 }],
    };
    expect(packageSchema.safeParse(parked).success).toBe(true);
  });

  it('allows a short itinerary so a draft can be saved half-written', () => {
    expect(packageSchema.safeParse({ ...valid, itinerary: [] }).success).toBe(true);
  });

  it('coerces the numeric text inputs and rejects a cleared one', () => {
    const coerced = packageSchema.parse({ ...valid, nights: '3' });
    expect(coerced.nights).toBe(3);
    expect(packageSchema.safeParse({ ...valid, nights: '' }).success).toBe(false);
  });

  it('drops blank lines from the one-per-line editors', () => {
    const out = packageSchema.parse({ ...valid, highlights: ['  Sunset  ', '', '   '] });
    expect(out.highlights).toEqual(['Sunset']);
  });

  it('offers every theme the api enum defines', () => {
    expect(THEMES.map((t) => t.value)).toEqual([
      'beach',
      'hills',
      'honeymoon',
      'family',
      'adventure',
      'heritage',
    ]);
  });

  it('blank rows carry no api id until the server assigns one', () => {
    expect(blankDeparture().id).toBeNull();
    expect(blankDay().meals).toEqual({ breakfast: false, lunch: false, dinner: false });
  });
});
