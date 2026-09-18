/** Pure helpers shared by EnquiryForm, the enquire/contact pages and the POST /enquire proxy. */

export type ServerError = 'rate_limited' | 'internal';

export type FormState = {
  defaultValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  error?: ServerError;
};

export const enquireHref = (slug: string) => `/packages/${slug}/enquire`;

export function thanksHref(p: { ref: string; firstName: string; packageSlug?: string | null }) {
  const q = new URLSearchParams({ ref: p.ref, name: p.firstName });
  if (p.packageSlug) q.set('package', p.packageSlug);
  return `/enquiry/thanks?${q}`;
}

/** The fields the proxy echoes back so a no-JS visitor does not retype everything. */
export const ECHOED_FIELDS = [
  'type',
  'name',
  'phone',
  'email',
  'travelMonth',
  'adults',
  'children',
  'message',
  'preferredDates',
  'budget',
  'changes',
] as const;

type Search = Record<string, string | string[] | undefined>;

/** `?fieldErrors=<json>&name=…&error=rate_limited` (from `POST /enquire`) → form props; junk is ignored. */
export function formStateFrom(sp: Search): FormState {
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
  for (const k of ECHOED_FIELDS) {
    const v = one(k);
    if (v !== undefined) defaultValues[k] = v;
  }
  const e = one('error');
  return {
    defaultValues,
    fieldErrors,
    error: e === 'rate_limited' || e === 'internal' ? e : undefined,
  };
}
