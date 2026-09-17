import { headers as requestHeaders } from 'next/headers';
import { z } from 'zod';
import type { components, paths } from './api-types';

/**
 * Typed server-side client for the api. Paths, responses and the error envelope all come from
 * `api-types.ts`, generated from `api/openapi.json` (`pnpm gen:api`) — nothing here is typed by hand.
 */

export type ErrorCode = components['schemas']['ErrorCode'];
export type ApiErrorResponse = components['schemas']['ApiErrorResponse'];

/** Every non-2xx response from the api. `fieldErrors` is present only for `validation`. */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum([
      'validation',
      'unauthorized',
      'forbidden',
      'not_found',
      'rate_limited',
      'conflict',
      'internal',
    ]),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
  }),
}) satisfies z.ZodType<ApiErrorResponse>; // drifts from the contract → typecheck fails

// `new URL(path, BASE)` tolerates a trailing slash on API_URL; next.config.ts strips it for rewrites.
const BASE = process.env.API_URL ?? 'http://localhost:8000';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorResponse['error'],
  ) {
    super(body.message);
  }
}

/**
 * Build the error for a non-2xx response. Only a body matching the api envelope is trusted;
 * anything else (a gateway's own JSON, an empty body) becomes a generic `internal` error that
 * still carries the real HTTP status.
 */
export function errorFromResponse(status: number, statusText: string, raw: unknown) {
  const parsed = apiErrorResponseSchema.safeParse(raw);
  if (parsed.success) return new ApiRequestError(status, parsed.data.error);
  return new ApiRequestError(status, { code: 'internal', message: statusText || `HTTP ${status}` });
}

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
