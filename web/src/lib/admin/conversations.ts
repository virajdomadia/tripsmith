import { bounded, ID_MAX, MAX_PAGE, one, oneOf, type RawParams } from '@/lib/admin/enquiry-filters';
import type { components } from '@/lib/api-types';

export { pct } from '@/lib/admin/reports';

export type ConversationRow = components['schemas']['ConversationRow'];
export type AdminConversation = components['schemas']['AdminConversation'];
export type Outcome = components['schemas']['ConversationOutcome'];

export const LOG_PATH = '/admin/conversations';

/** `dropped` is in the column but nothing sets it, so it reads the same as `open`. */
export const OUTCOME_LABELS: Record<Outcome, string> = {
  open: 'No hand-off',
  dropped: 'No hand-off',
  booking_started: 'Booking started',
  enquiry_created: 'Handed off',
};

const FILTERS = ['open', 'booking_started', 'enquiry_created'] as const;
type OutcomeFilter = (typeof FILTERS)[number];

export interface LogFilters {
  outcome?: OutcomeFilter;
  page?: number;
  sel?: string;
}

/** Anything unrecognised is dropped, so a hand-edited URL never 400s the api. Same parsing
 *  rules as the enquiry inbox. */
export function parseLogFilters(sp: RawParams): LogFilters {
  const page = Number(one(sp.page));
  return {
    outcome: oneOf(FILTERS, one(sp.outcome)),
    page: Number.isInteger(page) && page > 1 && page <= MAX_PAGE ? page : undefined,
    sel: bounded(one(sp.sel), ID_MAX),
  };
}

/** Past the last page (a bookmark, or a list that shrank) → the last page. */
export function clampLogHref(f: LogFilters, totalPages: number): string | null {
  const last = Math.max(1, totalPages);
  return (f.page ?? 1) > last ? logHref(f, { page: last }) : null;
}

export function logHref(f: LogFilters, patch: Partial<LogFilters> = {}): string {
  const next = { ...f, ...patch };
  const q = new URLSearchParams();
  if (next.outcome) q.set('outcome', next.outcome);
  if (next.page && next.page > 1) q.set('page', String(next.page));
  if (next.sel) q.set('sel', next.sel);
  const s = q.toString();
  return s ? `${LOG_PATH}?${s}` : LOG_PATH;
}

/** "1.2k" — tokens are a cost signal, not an exact figure the owner reconciles. */
export function tokens(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}
