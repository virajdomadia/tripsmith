import type { components } from '@/lib/api-types';

export type EnquiryStatus = components['schemas']['EnquiryStatus'];
/** All six DB types — the inbox reads every one; the public form submits only the v1 three. */
export type EnquiryType = components['schemas']['AdminEnquiryType'];

export const INBOX_PATH = '/admin/enquiries';
export const CSV_PATH = '/api/admin/enquiries.csv';

export const STATUSES = ['new', 'contacted', 'converted', 'closed'] as const;
export const TYPES = [
  'standard',
  'custom',
  'contact',
  'callback',
  'group',
  'chat-handoff',
] as const satisfies readonly EnquiryType[];

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  closed: 'Closed',
};

/** "Customise", not "Custom" — the public form calls it "Customise this trip" (06 §meta).
 *  Mirrored by the api's CSV `TYPE_LABELS` (services/admin_enquiries.py). */
export const TYPE_LABELS: Record<EnquiryType, string> = {
  standard: 'Standard',
  custom: 'Customise',
  contact: 'Contact',
  callback: 'Callback request',
  group: 'Group enquiry',
  'chat-handoff': 'From concierge',
};

/** A type's label, or the raw value for one this build doesn't know yet — a newer api must not
 *  crash an older inbox. */
export const typeLabel = (t: string): string =>
  Object.hasOwn(TYPE_LABELS, t) ? TYPE_LABELS[t as EnquiryType] : t;

/** The detail page's subtitle: "Standard enquiry", but "Callback request", not "Callback request
 *  enquiry" — the v2/v3 labels already name what they are. */
export const typeHeadline = (t: string): string =>
  t === 'standard' || t === 'custom' || t === 'contact' ? `${typeLabel(t)} enquiry` : typeLabel(t);

/** R24: the moves the owner may make — nothing returns to `new`; `closed → contacted` reopens.
 *  Mirrors the api's `ALLOWED_MOVES`, which answers 409 to anything else. */
export const STATUS_MOVES: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  new: ['contacted', 'converted', 'closed'],
  contacted: ['converted', 'closed'],
  converted: ['closed'],
  closed: ['contacted'],
};

/** What the status control shows: the current status plus its legal moves, in tab order. */
export const statusChoices = (current: EnquiryStatus): EnquiryStatus[] =>
  STATUSES.filter((s) => s === current || STATUS_MOVES[current].includes(s));

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
const PACKAGE_ID_MAX = 40;

const one = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const oneOf = <T extends string>(allowed: readonly T[], v?: string): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

/** Drop a value longer than the api's bound rather than truncate it — a truncated id names a
 * different package, and silently filtering by the wrong one is worse than not filtering. */
const bounded = (v: string | undefined, max: number): string | undefined =>
  v && v.length <= max ? v : undefined;

/** Shape AND calendar validity: reject `2026-02-30` rather than let `Date` roll it into March. */
const isoDate = (v?: string): string | undefined => {
  if (!v || !ISO_DATE.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
};

/**
 * The URL is the filter state (F21): a filtered inbox is linkable, the back button works, and
 * the tabs, pager and search box degrade to plain links and a GET form with JavaScript off.
 *
 * Anything unrecognised is dropped rather than forwarded, so a hand-edited URL can never make
 * the page throw a 400 out of the api.
 */
export function parseFilters(params: RawParams): Filters {
  const page = Number(one(params.page));
  const from = isoDate(one(params.from));
  let to = isoDate(one(params.to));
  // A reversed range (to < from) still fails the api's `_not_before_from` validator even when
  // both dates are individually well-formed, so drop `to` and keep `from`.
  if (from && to && to < from) to = undefined;
  return {
    status: oneOf(STATUSES, one(params.status)),
    type: oneOf(TYPES, one(params.type)),
    packageId: bounded(one(params.packageId), PACKAGE_ID_MAX),
    from,
    to,
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

/**
 * A page past the end — a hand-edited `?page=20`, or a bookmark to page 4 of a list that has
 * since shrunk — would render an empty table under a pager with nothing highlighted. Returns
 * the last real page's address to redirect to, or null when the page is in range.
 */
export function clampPageHref(f: Filters, totalPages: number): string | null {
  const last = Math.max(1, totalPages);
  return f.page > last ? filterHref(f, { page: last }) : null;
}

/** The export honours the current filters but never a page — it is the whole filtered view. */
export const csvHref = (f: Filters) => filterHref(f, { page: 1 }, CSV_PATH);
