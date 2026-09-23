import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { POLICY_SLUGS } from '@/lib/policies';
import { absolute } from '@/lib/seo/site-url';

/**
 * `/sitemap.xml` (H1, R13) — every public URL, built from the same api the pages read.
 *
 * The two catalogue calls carry the `packages` and `destinations` cache tags, so an owner save
 * revalidates the sitemap along with the pages themselves: a package published at noon is in the
 * sitemap at noon, not whenever a build next happens.
 *
 * Only live packages appear, because `GET /packages` only ever returns live ones — a draft is
 * invisible to the api, so it cannot leak into the sitemap by omission here.
 *
 * `lastModified` is deliberately absent from the catalogue entries: the list endpoints carry no
 * `updatedAt`, and fetching a dozen package details to fill a field crawlers treat as a hint
 * would cost more than it is worth.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [packages, destinations] = await Promise.all([
    api('/packages', { tags: ['packages'] }),
    api('/destinations', { tags: ['destinations'] }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absolute('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absolute('/packages'), changeFrequency: 'daily', priority: 0.9 },
    { url: absolute('/destinations'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absolute('/about'), changeFrequency: 'yearly', priority: 0.5 },
    { url: absolute('/contact'), changeFrequency: 'yearly', priority: 0.5 },
    ...POLICY_SLUGS.map((slug) => ({
      url: absolute(`/${slug}`),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  return [
    ...staticPages,
    ...packages.items.map((p) => ({
      url: absolute(`/packages/${p.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...destinations.items.map((d) => ({
      url: absolute(`/destinations/${d.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
