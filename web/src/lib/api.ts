import { headers as requestHeaders } from 'next/headers';
import { errorFromResponse } from './api-errors';
import type { paths } from './api-types';

export {
  ApiRequestError,
  apiErrorResponseSchema,
  errorFromResponse,
  type ApiErrorResponse,
  type ErrorCode,
} from './api-errors';

/**
 * Typed server-side client for the api. Paths, responses and the error envelope all come from
 * `api-types.ts`, generated from `api/openapi.json` (`pnpm gen:api`) — nothing here is typed by hand.
 *
 * Tagged reads are cached in Next's data cache and revalidated on demand (the api calls
 * `POST {WEB_URL}/revalidate` after an owner write); that on-demand re-fetch still goes over the
 * network, and would otherwise land in Vercel's edge cache in front of the api (keyed by the full
 * URL) for up to `s-maxage=60` + `stale-while-revalidate=300`. So a tagged call appends `?fresh=1`
 * to bypass it — the api's `FreshQueryMiddleware` (`FRESH_PARAM` in `api/app/middleware.py`)
 * answers it with `Cache-Control: no-store`. Untagged reads and `auth` reads are unchanged.
 */

// `new URL(path, BASE)` tolerates a trailing slash on API_URL; next.config.ts strips it for rewrites.
const BASE = process.env.API_URL ?? 'http://localhost:8000';

/** Paths that have a GET operation in the contract. */
export type GetPath = {
  [P in keyof paths]: paths[P] extends { get: object } ? P : never;
}[keyof paths];

type JsonOf<R> = R extends { content: { 'application/json': infer J } } ? J : never;
/** The 200 JSON body of `GET path`. */
export type GetResponse<P extends GetPath> = JsonOf<paths[P]['get']['responses'][200]>;

export interface ApiInit {
  /** Values for `{name}` tokens in the path (`/packages/{slug}`), URL-encoded. */
  params?: Record<string, string>;
  /** Cache tags for on-demand revalidation (`/revalidate` route handler). */
  tags?: string[];
  revalidate?: number | false;
  /** Query string; an array appends one `k=v` per value; blanks and undefined are omitted. */
  searchParams?: Record<string, string | string[] | undefined>;
  /**
   * Forward the viewer's `Cookie` header (owner session) and never cache. Only for `/admin/**`
   * and `/auth/session`; public data must not vary by viewer.
   */
  auth?: boolean;
}

/** `/packages/{slug}` + `{ slug: 'x' }` → `/packages/x`. Throws rather than sending a literal `{slug}`. */
export function fillPath(path: string, params: Record<string, string> = {}) {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path param "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}

/** Server-side typed GET to the api; throws `ApiRequestError` on any non-2xx. */
export async function api<P extends GetPath>(path: P, init: ApiInit = {}): Promise<GetResponse<P>> {
  const url = new URL(fillPath(path, init.params), BASE);
  for (const [k, v] of Object.entries(init.searchParams ?? {}))
    for (const one of Array.isArray(v) ? v : [v]) if (one) url.searchParams.append(k, one);
  if (init.tags && init.tags.length > 0) url.searchParams.set('fresh', '1');

  const headers = new Headers();
  let cache: RequestCache | undefined;
  if (init.auth) {
    // The raw header, not `cookies().toString()`: that re-encodes values, and the api never
    // percent-decodes, so a base64 session token (`+ / =`) would stop matching its row.
    const cookie = (await requestHeaders()).get('cookie');
    if (cookie) headers.set('cookie', cookie);
    cache = 'no-store';
  }

  const res = await fetch(url, {
    headers,
    cache,
    next: { tags: init.tags, revalidate: init.revalidate },
  });
  if (!res.ok)
    throw errorFromResponse(res.status, res.statusText, await res.json().catch(() => undefined));
  return res.json() as Promise<GetResponse<P>>;
}
