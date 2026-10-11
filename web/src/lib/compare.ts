/**
 * Compare (R39, P1b): the rows of `/compare`, which ones differ, the earned tags, and the tray
 * that collects up to three trips while browsing.
 *
 * "Differs" compares what a traveller would read as different: lists (places, stays, what is
 * and isn't included) as sets — order, case and spacing ignored — and prices, nights, seats and
 * ratings by value. The tray (client only) lives in compare-tray.ts.
 */

import type { components } from './api-types';
import { afterDeal } from './deal';

export type CompareTrip = components['schemas']['CompareTrip'];
export const MAX_COMPARE = 3;

export const compareHref = (slugs: readonly string[]) =>
  `/compare?p=${slugs.map(encodeURIComponent).join(',')}`;

/** `?p=a,b,c` → the slugs as asked (the api cleans, dedupes and caps them). */
export function slugsFromParam(p: string | string[] | undefined): string[] {
  const raw = Array.isArray(p) ? p.join(',') : (p ?? '');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- rows ------------------------------------------------------------------------------------

export type RowKey =
  | 'price'
  | 'departures'
  | 'duration'
  | 'places'
  | 'startsFrom'
  | 'stays'
  | 'meals'
  | 'included'
  | 'excluded'
  | 'rating'
  | 'leader'
  | 'deposit'
  | 'cancellation';

export type Row = {
  key: RowKey;
  group: string;
  label: string;
  sub?: string;
  differs: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const asSet = (items: readonly string[]) => [...new Set(items.map(norm))].sort().join('|');

export const priceFrom = (t: CompareTrip) => afterDeal(t.startingPricePaise, t.deal);

/** The value a row compares, per trip. */
const VALUE: Record<RowKey, (t: CompareTrip) => string> = {
  price: (t) => `${priceFrom(t)}`,
  departures: (t) => t.departures.map((d) => `${d.date}:${d.seatsLeft}`).join(','),
  duration: (t) => `${t.nights}`,
  places: (t) => asSet(t.places),
  startsFrom: (t) => norm(t.departureCity),
  stays: (t) => asSet(t.hotels.map((h) => `${h.name} ${h.stars} ${h.nights}`)),
  meals: (t) => `${t.meals.breakfasts}/${t.meals.lunches}/${t.meals.dinners}`,
  included: (t) => asSet(t.inclusions),
  excluded: (t) => asSet(t.exclusions),
  rating: (t) => (t.rating ? `${t.rating.avg.toFixed(1)}/${t.rating.count}` : '-'),
  leader: (t) => t.leader?.slug ?? '-',
  deposit: (t) => `${t.deposit}`,
  cancellation: () => 'site', // one policy for every trip (R43's tier table)
};

const ROWS: readonly Omit<Row, 'differs'>[] = [
  { key: 'price', group: 'Price and dates', label: 'Price from', sub: 'Per person, twin sharing' },
  { key: 'departures', group: 'Price and dates', label: 'Next departures', sub: 'Live seats' },
  { key: 'duration', group: 'The trip', label: 'Duration' },
  { key: 'places', group: 'The trip', label: 'Places' },
  { key: 'startsFrom', group: 'The trip', label: 'Starts from' },
  { key: 'stays', group: 'The trip', label: 'Stays' },
  { key: 'meals', group: 'What is included', label: 'Meals' },
  { key: 'included', group: 'What is included', label: 'Included' },
  { key: 'excluded', group: 'What is included', label: 'Not included' },
  {
    key: 'rating',
    group: 'People',
    label: 'Rating',
    sub: 'Reviews from travellers who completed the trip',
  },
  { key: 'leader', group: 'People', label: 'Trip leader' },
  { key: 'deposit', group: 'Booking terms', label: 'Payment' },
  { key: 'cancellation', group: 'Booking terms', label: 'Cancellation' },
];

/** Every row, with `differs` set when the trips' values are not all the same (2+ trips). */
export function compareRows(trips: readonly CompareTrip[]): Row[] {
  return ROWS.map((r) => ({
    ...r,
    differs: trips.length > 1 && new Set(trips.map(VALUE[r.key])).size > 1,
  }));
}

// --- earned tags -----------------------------------------------------------------------------

export type Win = 'Lowest price' | 'Longest trip' | 'Top rated' | 'Most seats open';
const WIN_ROW: Record<Win, RowKey> = {
  'Lowest price': 'price',
  'Longest trip': 'duration',
  'Top rated': 'rating',
  'Most seats open': 'departures',
};

/** `slug → row → tag`, only where one trip alone is best (a tie earns nobody the tag). */
export function winners(trips: readonly CompareTrip[]): Map<string, Map<RowKey, Win>> {
  const out = new Map<string, Map<RowKey, Win>>();
  if (trips.length < 2) return out;
  const award = (win: Win, score: (t: CompareTrip) => number | null, best: 'min' | 'max') => {
    const scored = trips
      .map((t) => ({ t, s: score(t) }))
      .filter((x): x is { t: CompareTrip; s: number } => x.s !== null);
    if (scored.length < 2) return;
    const top =
      best === 'min' ? Math.min(...scored.map((x) => x.s)) : Math.max(...scored.map((x) => x.s));
    const at = scored.filter((x) => x.s === top);
    if (at.length !== 1) return;
    const slug = at[0]!.t.slug;
    if (!out.has(slug)) out.set(slug, new Map());
    out.get(slug)!.set(WIN_ROW[win], win);
  };
  award('Lowest price', (t) => (priceFrom(t) > 0 ? priceFrom(t) : null), 'min');
  award('Longest trip', (t) => t.nights, 'max');
  award('Top rated', (t) => t.rating?.avg ?? null, 'max');
  award('Most seats open', (t) => t.departures.reduce((n, d) => n + d.seatsLeft, 0), 'max');
  return out;
}
