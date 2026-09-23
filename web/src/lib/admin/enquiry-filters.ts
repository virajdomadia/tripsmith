import type { components } from '@/lib/api-types';

export type EnquiryStatus = components['schemas']['EnquiryStatus'];
export type EnquiryType = components['schemas']['EnquiryType'];

export const INBOX_PATH = '/admin/enquiries';
export const CSV_PATH = '/api/admin/enquiries.csv';

export const STATUSES = ['new', 'contacted', 'converted', 'closed'] as const;
export const TYPES = ['standard', 'custom', 'contact'] as const;

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  closed: 'Closed',
};

/** "Customise", not "Custom" — the public form calls it "Customise this trip" (06 §meta). */
export const TYPE_LABELS: Record<EnquiryType, string> = {
  standard: 'Standard',
  custom: 'Customise',
  contact: 'Contact',
};

export interface Filters {
  status?: EnquiryStatus;
  type?: EnquiryType;
  packageId?: string;
  from?: string;
  to?: string;
  q?: string;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE = 10_000;
const SEARCH_MAX = 80;

const one = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const oneOf = <T extends string>(allowed: readonly T[], v?: string): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

const isoDate = (v?: string) => (v && ISO_DATE.test(v) ? v : undefined);

/**
 * The URL is the filter state (F21): a filtered inbox is linkable, the back button works, and
 * the tabs, pager and search box degrade to plain links and a GET form with JavaScript off.
 *
 * Anything unrecognised is dropped rather than forwarded, so a hand-edited URL can never make
 * the page throw a 400 out of the api.
 */
export function parseFilters(params: RawParams): Filters {
  const page = Number(one(params.page));
  return {
    status: oneOf(STATUSES, one(params.status)),
    type: oneOf(TYPES, one(params.type)),
    packageId: one(params.packageId),
    from: isoDate(one(params.from)),
    to: isoDate(one(params.to)),
    q: one(params.q)?.slice(0, SEARCH_MAX),
    page: Number.isInteger(page) && page > 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The query for `api('/admin/enquiries', { searchParams })`; `api()` drops the blanks itself. */
export function toQuery(f: Filters): Record<string, string | undefined> {
  return {
    status: f.status,
    type: f.type,
    packageId: f.packageId,
    from: f.from,
    to: f.to,
    q: f.q,
    page: f.page > 1 ? String(f.page) : undefined,
  };
}

/**
 * The same inbox with some filters changed. Any change other than paging returns to page 1 —
 * staying on page 7 of a list that just became three rows long shows an empty screen.
 */
export function filterHref(f: Filters, patch: Partial<Filters>, path = INBOX_PATH): string {
  const next: Filters = { ...f, ...patch, page: patch.page ?? 1 };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(toQuery(next))) if (value) search.append(key, value);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The export honours the current filters but never a page — it is the whole filtered view. */
export const csvHref = (f: Filters) => filterHref(f, { page: 1 }, CSV_PATH);
