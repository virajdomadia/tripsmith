import type { components } from '@/lib/api-types';
import { MONTHS } from '@/lib/format';

export type AdminReview = components['schemas']['AdminReview'];
export type ReviewCounts = components['schemas']['ReviewCounts'];
export type ReviewState = components['schemas']['ReviewState'];
export type ReviewStats = components['schemas']['ReviewStats'];

export const REVIEWS_PATH = '/admin/reviews';

export const REVIEW_TABS: readonly { state: ReviewState; label: string }[] = [
  { state: 'pending', label: 'Pending' },
  { state: 'published', label: 'Published' },
  { state: 'hidden', label: 'Hidden' },
];

const STATES = new Set<string>(REVIEW_TABS.map((t) => t.state));

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type ReviewQuery = { state: ReviewState; page: number; sel?: string };

/** Unknown tab → Pending; a bad page → 1. The api validates again. */
export function parseReviewQuery(sp: Record<string, string | string[] | undefined>): ReviewQuery {
  const state = one(sp.state);
  const page = Number(one(sp.page));
  const sel = one(sp.sel)?.trim();
  return {
    state: state && STATES.has(state) ? (state as ReviewState) : 'pending',
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
    ...(sel ? { sel: sel.slice(0, 64) } : {}),
  };
}

/** The review open in the reading pane lives in `?sel=`, like the desk's. */
export function reviewsHref(state: ReviewState, page = 1, sel?: string): string {
  const q = new URLSearchParams();
  if (state !== 'pending') q.set('state', state);
  if (page > 1) q.set('page', String(page));
  if (sel) q.set('sel', sel);
  const s = q.toString();
  return s ? `${REVIEWS_PATH}?${s}` : REVIEWS_PATH;
}

/** The pane shows the review asked for, or the first in the tab — a review that just moved to
 *  another tab falls back to the next one waiting, so moderating runs down the queue. */
export function pickReview(items: readonly AdminReview[], sel?: string): AdminReview | null {
  return items.find((r) => r.id === sel) ?? items[0] ?? null;
}

/** The queue's one-line excerpt: the first paragraph. */
export function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim()) ?? '';
}

/** `9` from `2026-09-27`: the month of an IST business day. */
const monthOf = (today: string) => Number(today.slice(5, 7));

/**
 * Reviews A's KPI strip: waiting (and since when), the published average and how many trips it
 * covers, published this month against last, and hidden. `oldest` is the waiting review's sent
 * day, already formatted; `today` is the IST business day (YYYY-MM-DD).
 */
export function reviewKpis(
  counts: ReviewCounts,
  stats: ReviewStats,
  today: string,
  oldest: string | null,
): { label: string; value: string; hint: string; tone?: 'up' | 'down' }[] {
  const m = monthOf(today);
  const thisMonth = MONTHS[m - 1];
  const lastMonth = MONTHS[(m + 10) % 12];
  const diff = stats.publishedThisMonth - stats.publishedLastMonth;
  const trips = stats.publishedPackages;
  return [
    {
      label: 'Waiting',
      value: String(counts.pending),
      hint: counts.pending && oldest ? `Oldest sent ${oldest}` : 'Queue clear',
      tone: counts.pending ? 'down' : 'up',
    },
    {
      label: 'Average published',
      value: stats.publishedAvg === null ? '—' : stats.publishedAvg.toFixed(1),
      hint: trips ? `across ${trips} ${trips === 1 ? 'trip' : 'trips'}` : 'Nothing published yet',
    },
    {
      label: `Published · ${thisMonth}`,
      value: String(stats.publishedThisMonth),
      hint:
        diff === 0
          ? `same as ${lastMonth}`
          : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} on ${lastMonth}`,
      ...(diff !== 0 ? { tone: diff > 0 ? ('up' as const) : ('down' as const) } : {}),
    },
    { label: 'Hidden', value: String(counts.hidden), hint: 'Spam or personal details' },
  ];
}
