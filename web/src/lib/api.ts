import type { ApiError } from '@tripsmith/shared';

const BASE = process.env.API_URL ?? 'http://localhost:8787';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiError['error'],
  ) {
    super(body.message);
  }
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
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: { code: 'internal', message: res.statusText } }))) as ApiError;
    throw new ApiRequestError(res.status, body.error);
  }
  return res.json() as Promise<T>;
}
