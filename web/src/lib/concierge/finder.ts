/**
 * The no-AI quick finder (v3 C6, R28): when the concierge is out of turns (the per-IP limit, the
 * site-wide day or month cap, or no model key), the panel offers destination · month · budget and
 * runs the listing's own search — `GET /packages`, the same cached call `/packages` makes, so it
 * costs no model call and almost no function time.
 */

import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';
import { EMPTY_QUERY, type SearchQuery, searchHref, toSearchParams } from '@/lib/search';
import type { ChatPackage } from './types';

type PackageCard = components['schemas']['PackageCard'];
export type PackageList = components['schemas']['PackageList'];
export type FacetOption = components['schemas']['FacetOption'];

/** Whole rupees per person; `undefined` is "any budget". */
export const BUDGETS = [10_000, 15_000, 20_000, 30_000, 50_000, 75_000] as const;

/** How many results the panel shows; the rest are a link to the trips page. */
export const FINDER_SHOWN = 4;

export type FinderQuery = {
  destination?: { slug: string; name: string };
  month?: { value: string; label: string };
  maxBudget?: number;
};

const SLUG = /^[a-z0-9-]+$/;

export function toSearchQuery(q: FinderQuery): SearchQuery {
  return {
    ...EMPTY_QUERY,
    destination: q.destination ? [q.destination.slug] : [],
    month: q.month?.value,
    maxBudget: q.maxBudget,
  };
}

/** The api path the finder fetches, through the web's same-origin `/api` rewrite. */
export function finderUrl(q: FinderQuery): string {
  const sp = toSearchParams(toSearchQuery(q)).toString();
  return sp ? `/api/packages?${sp}` : '/api/packages';
}

/** The same search on the trips page, for "See all". */
export const finderHref = (q: FinderQuery) => searchHref(toSearchQuery(q));

/** A listing card in the chat card's shape — priced the way the concierge's tool prices it. */
export function toChatPackage(c: PackageCard): ChatPackage | null {
  if (!SLUG.test(c.slug)) return null;
  return {
    slug: c.slug,
    name: c.name,
    destination: c.destination,
    nights: c.nights,
    days: c.days,
    fromPricePaise: c.deal ? c.deal.pricePaise : c.startingPricePaise,
    wasPricePaise: c.deal ? c.startingPricePaise : null,
    themes: c.themes,
    highlights: c.highlights,
    coverUrl: c.coverUrl,
    badge: c.badge,
    seatsLeft: c.seatsLeft ?? null,
    url: `/packages/${c.slug}`,
  };
}

/** Short enough for a third of a 360 px panel: `≤ ₹20k`. */
export const budgetLabel = (rupees: number) =>
  rupees % 1000 === 0 ? `≤ ₹${rupees / 1000}k` : `≤ ${inr(rupees * 100)}`;
