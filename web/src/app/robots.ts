import type { MetadataRoute } from 'next';
import { absolute } from '@/lib/seo/site-url';

/**
 * `/robots.txt` (H1, R13).
 *
 * The owner shell and the api proxy are disallowed because there is nothing there for a crawler:
 * `/admin/*` answers a redirect to the login page and `/api/*` answers JSON. Both are already
 * gated — this is tidiness, not a security control, and nothing secret is named here.
 *
 * `/enquiry/thanks` also carries `robots: noindex` in its own metadata; a confirmation page with
 * an enquiry reference in the query string should never be a search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/enquiry/thanks'] }],
    sitemap: absolute('/sitemap.xml'),
  };
}
