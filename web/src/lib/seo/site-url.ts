/**
 * The site's own origin, in one place (H1).
 *
 * Every page used to keep its own `const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? …`, so a
 * canonical, an OG image and the sitemap could each have drifted to a different fallback. The
 * variable is `NEXT_PUBLIC_` because the OG routes and the share buttons read it in the browser.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * An absolute URL for a site-relative path — what a canonical, a sitemap entry and JSON-LD all
 * need. `new URL` normalises a doubled slash, so `absolute('/packages')` is safe whether or not
 * the env var carries a trailing one.
 */
export const absolute = (path: string): string => new URL(path, SITE_URL).toString();
