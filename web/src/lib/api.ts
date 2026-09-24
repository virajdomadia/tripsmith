import { headers as requestHeaders } from 'next/headers';
import { cache as memo } from 'react';
import { errorFromResponse } from './api-errors';
import type { paths } from './api-types';
import { stripDraftCookie } from './enquiry-form-state';

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

/**
 * A hung api must fail fast into the page's error boundary rather than hold the render until the
 * platform kills the function. A cold api start (target < 3 s, docs/04) fits well inside this.
 * Next skips its per-render fetch dedupe for a request that carries a `signal`, so public reads
 * go through `publicGet`, memoised per render with React `cache()` instead: `generateMetadata`,
 * the page and the footer asking for the same URL still cost one request.
 */
export const API_TIMEOUT_MS = 8_000;

async function getJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok)
    throw errorFromResponse(res.status, res.statusText, await res.json().catch(() => undefined));
  return res.json();
}

/** Public (cookie-less) GET, keyed on everything that shapes the request (`cache()` compares
 * arguments by identity, so the tags travel as their JSON). */
const publicGet = memo(function publicGet(
  url: string,
  tagsJson: string,
  revalidate: number | false | undefined,
) {
  return getJson(url, {
    next: { tags: (JSON.parse(tagsJson) as string[] | null) ?? undefined, revalidate },
  });
});

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

  if (!init.auth)
    return publicGet(url.toString(), JSON.stringify(init.tags ?? null), init.revalidate) as Promise<
      GetResponse<P>
    >;

  // The raw header, not `cookies().toString()`: that re-encodes values, and the api never
  // percent-decodes, so a base64 session token (`+ / =`) would stop matching its row. The
  // enquiry draft (visitor PII) is the site's business, not the api's: it is dropped.
  const headers = new Headers();
  const cookie = stripDraftCookie((await requestHeaders()).get('cookie'));
  if (cookie) headers.set('cookie', cookie);
  return getJson(url.toString(), {
    headers,
    cache: 'no-store',
    next: { tags: init.tags, revalidate: init.revalidate },
  }) as Promise<GetResponse<P>>;
}
