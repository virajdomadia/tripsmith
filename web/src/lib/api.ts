import { apiErrorResponseSchema, type ApiErrorResponse } from '@tripsmith/shared';

// `new URL(path, BASE)` tolerates a trailing slash on API_URL; next.config.ts strips it for rewrites.
const BASE = process.env.API_URL ?? 'http://localhost:8787';

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

/** Server-side typed fetch to the Hono api. Tags feed on-demand revalidation. */
export async function api<T>(
  path: string,
  init: {
    tags?: string[];
    revalidate?: number | false;
    searchParams?: Record<string, string | undefined>;
  } = {},
): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(init.searchParams ?? {})) if (v) url.searchParams.set(k, v);
  const res = await fetch(url, { next: { tags: init.tags, revalidate: init.revalidate } });
  if (!res.ok)
    throw errorFromResponse(res.status, res.statusText, await res.json().catch(() => undefined));
  return res.json() as Promise<T>;
}
