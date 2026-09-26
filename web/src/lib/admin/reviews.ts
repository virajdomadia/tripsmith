import type { components } from '@/lib/api-types';

export type AdminReview = components['schemas']['AdminReview'];
export type ReviewCounts = components['schemas']['ReviewCounts'];
export type ReviewState = components['schemas']['ReviewState'];

export const REVIEWS_PATH = '/admin/reviews';

export const REVIEW_TABS: readonly { state: ReviewState; label: string }[] = [
  { state: 'pending', label: 'Pending' },
  { state: 'published', label: 'Published' },
  { state: 'hidden', label: 'Hidden' },
];

const STATES = new Set<string>(REVIEW_TABS.map((t) => t.state));

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Unknown tab → Pending; a bad page → 1. The api validates again. */
export function parseReviewQuery(sp: Record<string, string | string[] | undefined>): {
  state: ReviewState;
  page: number;
} {
  const state = one(sp.state);
  const page = Number(one(sp.page));
  return {
    state: state && STATES.has(state) ? (state as ReviewState) : 'pending',
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

export function reviewsHref(state: ReviewState, page = 1): string {
  const q = new URLSearchParams();
  if (state !== 'pending') q.set('state', state);
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `${REVIEWS_PATH}?${s}` : REVIEWS_PATH;
}
