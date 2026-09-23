import type { MetadataRoute } from 'next';
import { absolute } from '@/lib/seo/site-url';

/**
 * `/robots.txt` (H1, R13).
 *
 * The owner shell and the api proxy are disallowed because there is nothing there for a crawler:
 * `/admin/*` answers a redirect to the login page and `/api/*` answers JSON. Both are already
 * gated — this is tidiness, not a security control, and nothing secret is named here.
 *
 * `/enquiry/thanks` is deliberately **not** disallowed. It carries `robots: noindex` in its own
 * metadata, and a crawler has to fetch a page to read that: disallowing it would leave the URL
 * eligible for listing (reference number in the query string and all) with no way to learn that
 * it should be dropped. Crawlable and noindex beats blocked and unknowable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api'] }],
    sitemap: absolute('/sitemap.xml'),
  };
}
