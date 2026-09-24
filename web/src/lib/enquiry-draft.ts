import { cookies } from 'next/headers';
import {
  DRAFT_COOKIE,
  DRAFT_COOKIE_OPTIONS,
  draftCookieValue,
  draftFrom,
  isFailedRoundTrip,
} from './enquiry-form-state';

/**
 * Server side of the no-JS draft cookie (see enquiry-form-state.ts): written by `POST /enquire`
 * when it sends the visitor back, read by the form pages on that return only, cleared by a
 * successful send on either path. Route handlers and server components only.
 */

/** Always overwrites: the new draft, or — when there is nothing (or too much) to keep — none, so
 * an older draft can never re-fill the form with stale details. */
export async function saveDraft(raw: Record<string, string>, secure: boolean): Promise<void> {
  const jar = await cookies();
  const value = draftCookieValue(raw);
  if (value) jar.set(DRAFT_COOKIE, value, { ...DRAFT_COOKIE_OPTIONS, secure });
  else if (jar.has(DRAFT_COOKIE)) jar.delete(DRAFT_COOKIE);
}

export async function clearDraft(): Promise<void> {
  const jar = await cookies();
  if (jar.has(DRAFT_COOKIE)) jar.delete(DRAFT_COOKIE);
}

/** The private defaults for a form page — only on the failed-submit return, `{}` otherwise. */
export async function readDraft(
  sp: Record<string, string | string[] | undefined>,
): Promise<Record<string, string>> {
  if (!isFailedRoundTrip(sp)) return {};
  return draftFrom((await cookies()).get(DRAFT_COOKIE)?.value);
}
