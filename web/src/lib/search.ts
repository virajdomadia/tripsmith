import type { components, paths } from './api-types';
import { inr } from './format';

/**
 * The listing's query, one shape for three jobs: the URL (`/packages?…`), the api call and
 * the filter panel's state. Pure — parse Next's `searchParams`, serialise back canonically,
 * describe the active filters as chips. Param names are the api's, so the page forwards them 1:1.
 */

export type SortOrder = components['schemas']['SortOrder'];
export type Theme = components['schemas']['Theme'];
export type Facets = components['schemas']['SearchFacets'];
/** What the contract says `GET /packages` accepts; `SearchQuery` must stay assignable to it. */
export type ContractQuery = NonNullable<paths['/packages']['get']['parameters']['query']>;

export interface SearchQuery {
  destination: string[];
  /** Whole rupees, like the api's `maxBudget`. */
  maxBudget?: number;
  nightsMin?: number;
  nightsMax?: number;
  themes: Theme[];
  /** `YYYY-MM` */
  month?: string;
  sort: SortOrder;
}

/** Next.js `searchParams` after `await`: repeated keys arrive as arrays. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_SORT: SortOrder = 'price-asc';
export const SORT_LABEL: Record<SortOrder, string> = {
  'price-asc': 'Price, low to high',
  'price-desc': 'Price, high to low',
  duration: 'Shortest first',
};
/** Mirrors the api `Theme` enum (a type test keeps them equal); `/meta` supplies labels. */
export const THEMES = [
  'beach',
  'hills',
  'honeymoon',
  'family',
  'adventure',
  'heritage',
] as const satisfies readonly Theme[];
export const NIGHTS_MAX = 30;
export const DESTINATION_MAX = 20; // the api caps `destination` at this many slugs
const BUDGET_MAX = 10_000_000; // rupees — anything above is a typo, not a filter
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SLUG = /^[a-z0-9-]+$/;

export const EMPTY_QUERY: SearchQuery = { destination: [], themes: [], sort: DEFAULT_SORT };

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v === undefined ? [] : [v]).map((s) => s.trim()).filter(Boolean);
const first = (v: string | string[] | undefined) => list(v)[0];
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const isTheme = (s: string): s is Theme => (THEMES as readonly string[]).includes(s);
const isSort = (s: string | undefined): s is SortOrder => s !== undefined && s in SORT_LABEL;

/** A whole number inside [min, max], else undefined — URLs are user input, never throw. */
function int(v: string | string[] | undefined, min: number, max: number): number | undefined {
  const s = first(v);
  if (s === undefined || !/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= min && n <= max ? n : undefined;
}

/** Lenient: anything the api would reject is dropped or repaired, so a hand-edited URL still renders. */
export function parseSearchQuery(raw: RawSearchParams): SearchQuery {
  let nightsMin = int(raw.nightsMin, 1, NIGHTS_MAX);
  let nightsMax = int(raw.nightsMax, 1, NIGHTS_MAX);
  if (nightsMin !== undefined && nightsMax !== undefined && nightsMax < nightsMin)
    [nightsMin, nightsMax] = [nightsMax, nightsMin];
  const month = first(raw.month);
  const sort = first(raw.sort);
  return {
    destination: uniq(list(raw.destination).filter((s) => SLUG.test(s))).slice(0, DESTINATION_MAX),
    maxBudget: int(raw.maxBudget, 1, BUDGET_MAX),
    nightsMin,
    nightsMax,
    themes: uniq(list(raw.themes).filter(isTheme)),
    month: month !== undefined && MONTH.test(month) ? month : undefined,
    sort: isSort(sort) ? sort : DEFAULT_SORT,
  };
}

/** Canonical order, defaults omitted: equal queries → equal URLs (shareable, one cache entry). */
export function toSearchParams(q: SearchQuery): URLSearchParams {
  const sp = new URLSearchParams();
  for (const d of q.destination) sp.append('destination', d);
  if (q.maxBudget !== undefined) sp.set('maxBudget', String(q.maxBudget));
  if (q.nightsMin !== undefined) sp.set('nightsMin', String(q.nightsMin));
  if (q.nightsMax !== undefined) sp.set('nightsMax', String(q.nightsMax));
  for (const t of q.themes) sp.append('themes', t);
  if (q.month !== undefined) sp.set('month', q.month);
  if (q.sort !== DEFAULT_SORT) sp.set('sort', q.sort);
  return sp;
}

export function searchHref(q: SearchQuery): string {
  const s = toSearchParams(q).toString();
  return s ? `/packages?${s}` : '/packages';
}

/** For `api('/packages', { searchParams })`: arrays stay arrays, numbers become strings. */
export function toApiSearchParams(q: SearchQuery): Record<string, string | string[] | undefined> {
  return {
    destination: q.destination,
    maxBudget: q.maxBudget?.toString(),
    nightsMin: q.nightsMin?.toString(),
    nightsMax: q.nightsMax?.toString(),
    themes: q.themes,
    month: q.month,
    sort: q.sort,
  };
}

/** True when a filter (not the sort) narrows the catalog. */
export const isFiltered = (q: SearchQuery) => toSearchParams({ ...q, sort: DEFAULT_SORT }).size > 0;

export function nightsLabel(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined)
    return min === max ? `${min} nights` : `${min}–${max} nights`;
  if (min !== undefined) return `${min}+ nights`;
  if (max !== undefined) return `Up to ${max} nights`;
  return 'Any length';
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `'2026-11'` → `'November 2026'`; the api's facet labels say the same, this covers months it no longer lists. */
export function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  return `${MONTH_NAMES[Number(mon) - 1]} ${year}`;
}

export const resultCount = (n: number) => (n === 1 ? '1 package' : `${n} packages`);

export interface FilterChip {
  key: string;
  label: string;
  /** The same query without this one filter. */
  href: string;
}

/** The toolbar's removable chips, in a fixed order: destinations, budget, nights, themes, month. */
export function activeChips(q: SearchQuery, facets: Facets): FilterChip[] {
  const label = (options: Facets['destinations'], value: string, fallback: string) =>
    options.find((o) => o.value === value)?.label ?? fallback;
  const chips: FilterChip[] = q.destination.map((d) => ({
    key: `destination:${d}`,
    label: label(facets.destinations, d, d),
    href: searchHref({ ...q, destination: q.destination.filter((x) => x !== d) }),
  }));
  if (q.maxBudget !== undefined)
    chips.push({
      key: 'maxBudget',
      label: `Up to ${inr(q.maxBudget * 100)}`,
      href: searchHref({ ...q, maxBudget: undefined }),
    });
  if (q.nightsMin !== undefined || q.nightsMax !== undefined)
    chips.push({
      key: 'nights',
      label: nightsLabel(q.nightsMin, q.nightsMax),
      href: searchHref({ ...q, nightsMin: undefined, nightsMax: undefined }),
    });
  for (const t of q.themes)
    chips.push({
      key: `themes:${t}`,
      label: label(facets.themes, t, t),
      href: searchHref({ ...q, themes: q.themes.filter((x) => x !== t) }),
    });
  if (q.month !== undefined)
    chips.push({
      key: 'month',
      label: label(facets.months, q.month, monthLabel(q.month)),
      href: searchHref({ ...q, month: undefined }),
    });
  return chips;
}
