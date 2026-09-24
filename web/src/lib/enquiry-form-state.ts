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
 * never goes in a URL (history, server logs, analytics, `Referer`) — it travels in a short-lived
 * httpOnly cookie that only the form pages read, cleared by the next successful send.
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
const DRAFT_MAX_AGE = 600; // ten minutes: long enough to fix a typo, short enough to forget
const DRAFT_MAX_CHARS = 3800; // one cookie is capped at 4 KB, name and attributes included
/** Dropped in this order, longest free text first, when the encoded draft would not fit. */
const DRAFT_DROP_ORDER = ['changes', 'message', 'preferredDates'] as const;

type Search = Record<string, string | string[] | undefined>;

/** The private fields of a raw form post, encoded for a cookie; undefined when there are none. */
export function draftCookieValue(raw: Record<string, string>): string | undefined {
  const draft: Record<string, string> = {};
  for (const k of PRIVATE_FIELDS) if (raw[k]) draft[k] = raw[k];
  let value = encodeURIComponent(JSON.stringify(draft));
  for (const k of DRAFT_DROP_ORDER) {
    if (value.length <= DRAFT_MAX_CHARS) break;
    delete draft[k];
    value = encodeURIComponent(JSON.stringify(draft));
  }
  return Object.keys(draft).length > 0 && value.length <= DRAFT_MAX_CHARS ? value : undefined;
}

/** `Set-Cookie` for the draft (`value`), or the header that clears it (no value). */
export function draftCookieHeader(value: string | undefined, secure: boolean): string {
  const attrs = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return value
    ? `${DRAFT_COOKIE}=${value}; Max-Age=${DRAFT_MAX_AGE}; ${attrs}`
    : `${DRAFT_COOKIE}=; Max-Age=0; ${attrs}`;
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
