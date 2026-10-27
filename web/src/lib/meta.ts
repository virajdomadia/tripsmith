import { api } from './api';
import { type Rules, rulesOf } from './rules';

/** The api's runtime constants (`GET /meta`). They change only with an api deploy; five minutes
 * bounds how long a pre-deploy body (no `rules`, the web/api deploy race) can outlive it. One
 * request per render however many callers. */
export const getMeta = () => api('/meta', { revalidate: 300 });

/** For a layout: the rules, or null when the api can't be reached (a CI build, an outage) — so a
 * page that needs none still renders, and one that does fails in its own error boundary. */
export async function loadRules(): Promise<Rules | null> {
  try {
    const meta = await getMeta();
    // `?.`: an api from before V8 (the web/api deploy race) sends no `rules`.
    return meta.rules?.cancellationTiers ? rulesOf(meta) : null;
  } catch {
    return null;
  }
}

/** Whether the live api already serves the booking rules (false before V8, or unreachable). */
export const hasRules = async () => (await loadRules()) !== null;

/** For a page that cannot render without the rules: they, or a clear error for the page's error
 * boundary (never a half-built object from a pre-V8 api). */
export async function getRules(): Promise<Rules> {
  const rules = await loadRules();
  if (!rules) throw new Error('The booking rules (GET /meta) are unavailable');
  return rules;
}
