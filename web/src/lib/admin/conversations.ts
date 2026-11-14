import type { components } from '@/lib/api-types';

export type ConversationRow = components['schemas']['ConversationRow'];
export type AdminConversation = components['schemas']['AdminConversation'];
export type Outcome = components['schemas']['ConversationOutcome'];
type OutcomeFilter = 'open' | 'booking_started' | 'enquiry_created';

export const LOG_PATH = '/admin/conversations';

/** `dropped` is in the column but nothing sets it, so it reads the same as `open`. */
export const OUTCOME_LABELS: Record<Outcome, string> = {
  open: 'No hand-off',
  dropped: 'No hand-off',
  booking_started: 'Booking started',
  enquiry_created: 'Handed off',
};

const FILTERS: readonly OutcomeFilter[] = ['open', 'booking_started', 'enquiry_created'];
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export interface LogFilters {
  outcome?: OutcomeFilter;
  page?: number;
  sel?: string;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Anything unrecognised is dropped, so a hand-edited URL never 400s the api. */
export function parseLogFilters(sp: Record<string, string | string[] | undefined>): LogFilters {
  const outcome = one(sp.outcome);
  const page = Number(one(sp.page));
  const sel = one(sp.sel);
  return {
    outcome: FILTERS.includes(outcome as OutcomeFilter) ? (outcome as OutcomeFilter) : undefined,
    page: Number.isInteger(page) && page > 1 && page <= 10_000 ? page : undefined,
    sel: sel && ID.test(sel) ? sel : undefined,
  };
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

export function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : '–';
}
