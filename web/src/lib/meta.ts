import { api } from './api';
import { type Rules, rulesOf } from './rules';

/** The api's runtime constants (`GET /meta`) for server pages. They change only with an api
 * deploy, so an hour's cache is plenty; one request per render however many callers. */
export const getMeta = () => api('/meta', { revalidate: 3600 });

/** For a layout: the rules, or null when the api can't be reached (a CI build, an outage) — so a
 * page that needs none still renders, and one that does fails in its own error boundary. */
export async function loadRules(): Promise<Rules | null> {
  try {
    return rulesOf(await getMeta());
  } catch {
    return null;
  }
}
