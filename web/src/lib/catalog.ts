import { notFound } from 'next/navigation';
import { cache } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { isPriced } from '@/lib/format';

/**
 * Detail loaders shared by a page and its `opengraph-image` (F13), so both read the same tagged,
 * hourly-revalidated fetch (`package:<slug>` / `destination:<slug>` are purged by admin edits in
 * F18; the hour catches departures that have left). Draft, unknown and "no live trips" are all
 * api 404s → the 404 page / a 404 image. Wrapped in React `cache()` so `generateMetadata` and the
 * page share one call per render (the api timeout's `signal` turns off Next's own fetch dedupe).
 */
export const REVALIDATE_SECONDS = 60 * 60;

export const loadPackage = cache(async (slug: string) => {
  try {
    return await api('/packages/{slug}', {
      params: { slug },
      tags: [`package:${slug}`],
      revalidate: REVALIDATE_SECONDS,
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
});

export const loadDestination = cache(async (slug: string) => {
  try {
    return await api('/destinations/{slug}', {
      params: { slug },
      tags: [`destination:${slug}`],
      revalidate: REVALIDATE_SECONDS,
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
});

/** Cheapest priced trip; 0 when every trip is "on request" (the api sorts 0 first, so min over > 0). */
export function cheapest(prices: number[]): number {
  const priced = prices.filter(isPriced);
  return priced.length ? Math.min(...priced) : 0;
}
