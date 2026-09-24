/** Pure helpers shared by EnquiryForm, the enquire/contact pages and the POST /enquire proxy. */

export type ServerError = 'rate_limited' | 'internal';

export type FormState = {
  defaultValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  error?: ServerError;
};

export const enquireHref = (slug: string) => `/packages/${slug}/enquire`;

export function thanksHref(p: {
  ref: string;
  firstName: string;
  packageSlug?: string | null;
  emailed?: boolean;
}) {
  const q = new URLSearchParams({ ref: p.ref, name: p.firstName });
  if (p.packageSlug) q.set('package', p.packageSlug);
  if (p.emailed) q.set('emailed', '1');
  return `/enquiry/thanks?${q}`;
}

/**
 * The no-JS round trip (`POST /enquire` → back to the form) re-fills what the visitor sent, split
 * by sensitivity. Choices ride in the query string; anything a person typed about themselves
 * never goes in a URL (history, server logs, analytics, `Referer`) — it travels in a two-minute
 * httpOnly cookie (enquiry-draft.ts) that the form pages read only on that failed-submit return,
 * cleared by the next successful send.
 *
 * `Path=/` is the narrowest path that works: the pages are `/contact` and
 * `/packages/<slug>/enquire` and the POST is `/enquire`, with no common prefix. So the browser
 * also sends it to the `/api/*` rewrite (FastAPI ignores it); the web's own proxies strip it
 * (`stripDraftCookie`), and the two-minute life bounds the rest.
 */
export const PUBLIC_FIELDS = ['type', 'travelMonth', 'adults', 'children', 'budget'] as const;
export const PRIVATE_FIELDS = [
  'name',
  'phone',
  'email',
  'message',
  'preferredDates',
  'changes',
] as const;

export const DRAFT_COOKIE = 'ts_enquiry_draft';
/** Two minutes: one round trip back to the form, not a lingering copy of someone's details. */
export const DRAFT_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 120,
  httpOnly: true,
  sameSite: 'lax',
} as const;
const DRAFT_MAX_CHARS = 3800; // one cookie is capped at 4 KB, name and attributes included
/** Dropped in this order, longest free text first, when the encoded draft would not fit. */
const DRAFT_DROP_ORDER = ['changes', 'message', 'preferredDates'] as const;

type Search = Record<string, string | string[] | undefined>;

/**
 * The private fields of a raw form post as the cookie's JSON value (Next percent-encodes it on
 * the way out); undefined when there are none or they cannot fit.
 */
export function draftCookieValue(raw: Record<string, string>): string | undefined {
  const draft: Record<string, string> = {};
  for (const k of PRIVATE_FIELDS) if (raw[k]) draft[k] = raw[k];
  const size = () => encodeURIComponent(JSON.stringify(draft)).length;
  for (const k of DRAFT_DROP_ORDER) {
    if (size() <= DRAFT_MAX_CHARS) break;
    delete draft[k];
  }
  return Object.keys(draft).length > 0 && size() <= DRAFT_MAX_CHARS
    ? JSON.stringify(draft)
    : undefined;
}

/** A `Cookie` header minus the draft (exact name match), for hops to the api; undefined if empty. */
export function stripDraftCookie(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const kept = header
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c && c.split('=')[0].trim() !== DRAFT_COOKIE);
  return kept.length ? kept.join('; ') : undefined;
}

/** Only the redirect back from a failed `POST /enquire` carries these; a plain visit never does. */
export function isFailedRoundTrip(sp: Search): boolean {
  return typeof sp.error === 'string' || typeof sp.fieldErrors === 'string';
}

/** The draft cookie's value (Next hands it over already percent-decoded) → private defaults. */
export function draftFrom(value: string | undefined): Record<string, string> {
  if (!value) return {};
  let raw: unknown;
  for (const text of [value, safeDecode(value)]) {
    try {
      raw = JSON.parse(text);
      break;
    } catch {
      /* try the next spelling */
    }
  }
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object')
    for (const k of PRIVATE_FIELDS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'string') out[k] = v;
    }
  return out;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * `?fieldErrors=<json>&adults=2&error=rate_limited` (from `POST /enquire`) plus the draft cookie →
 * form props; junk is ignored. Private fields are taken from the draft only, never the query.
 */
export function formStateFrom(sp: Search, draft: Record<string, string> = {}): FormState {
  const one = (k: string) => (typeof sp[k] === 'string' ? sp[k] : undefined);
  let fieldErrors: Record<string, string> = {};
  try {
    const raw: unknown = one('fieldErrors') ? JSON.parse(one('fieldErrors') as string) : {};
    if (raw && typeof raw === 'object')
      fieldErrors = Object.fromEntries(
        Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
  } catch {
    /* not JSON — no errors to show */
  }
  const defaultValues: Record<string, string> = {};
  for (const k of PUBLIC_FIELDS) {
    const v = one(k);
    if (v !== undefined) defaultValues[k] = v;
  }
  for (const k of PRIVATE_FIELDS) if (draft[k] !== undefined) defaultValues[k] = draft[k];
  const e = one('error');
  return {
    defaultValues,
    fieldErrors,
    error: e === 'rate_limited' || e === 'internal' ? e : undefined,
  };
}
