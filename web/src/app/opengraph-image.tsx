import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og/card';
import { SITE_URL } from '@/lib/seo/site-url';

export const alt = 'Tripsmith — short Indian holidays with real departure dates';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The site-wide share card (v1.0.1): every page without its own card — home, /packages,
 * /destinations, /about, /contact — gets this one. Same F13 card as a package or destination,
 * over the home hero photo. No params and no fetch, so Next renders it once at build time; the
 * photo goes to satori as a data URI because it is read from disk, not served from a URL.
 */
export default async function Image() {
  const hero = await readFile(join(process.cwd(), 'src/assets/home/hero.jpg'));
  return ogCard({
    cover: `data:image/jpeg;base64,${hero.toString('base64')}`,
    name: 'Holidays across India, planned by people who’ve been',
    line: 'Real departures · per-person prices',
    site: new URL(SITE_URL).host,
  });
}
