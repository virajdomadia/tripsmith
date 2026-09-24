import type { Metadata } from 'next';
import { absolute } from '@/lib/seo/site-url';

/**
 * Open Graph, site-wide (v1.0.1). Only the fields true of every page live in the root layout:
 * site name, locale, type — no title or description, which would leak one page's copy onto
 * /terms, /enquiry/thanks and the rest. Next fills a missing og:title / og:description (and the
 * twitter pair) from the page's own `title` / `description` at render time.
 *
 * The image is never listed here. Next attaches the nearest `opengraph-image` file with its
 * content-hash query (`/opengraph-image?3dc6…`), so a changed card gets a new URL and scrapers
 * refetch it; a hard-coded URL would lose that. The catch: Next replaces `openGraph` wholesale
 * per segment, and a file image only attaches in its own segment. So:
 *   - a page with no `opengraph-image` of its own (every index and legal page) sets no
 *     `openGraph` at all, and inherits the root object + the site card (app/opengraph-image.tsx);
 *   - a page with its own card (packages/[slug], destinations/[slug]) uses `pageOpenGraph`, and
 *     Next adds that segment's card to it.
 */
export const OPEN_GRAPH = {
  siteName: 'Tripsmith',
  locale: 'en_IN',
  type: 'website',
} as const satisfies NonNullable<Metadata['openGraph']>;

/** `openGraph` for a page that ships its own `opengraph-image` (see above). */
export function pageOpenGraph({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): NonNullable<Metadata['openGraph']> {
  return { ...OPEN_GRAPH, title, description, url: absolute(path) };
}
