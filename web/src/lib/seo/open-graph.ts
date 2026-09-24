import type { Metadata } from 'next';

/**
 * Site-wide Open Graph fields (v1.0.1). Next merges `metadata` one key deep, so a page that sets
 * `openGraph` at all replaces the root layout's object — image included: the root
 * app/opengraph-image.tsx is only attached automatically to pages that leave `openGraph` alone.
 * So a page spreads this to keep the site name, locale, type and the site card, then sets its own
 * title and description. A segment with its own `opengraph-image` file (packages, destinations)
 * still wins: Next ranks file-based images over the ones listed here.
 */
export const OPEN_GRAPH = {
  siteName: 'Tripsmith',
  locale: 'en_IN',
  type: 'website',
  images: [
    {
      url: '/opengraph-image',
      width: 1200,
      height: 630,
      type: 'image/jpeg',
      alt: 'Tripsmith — short Indian holidays with real departure dates',
    },
  ],
} as const satisfies NonNullable<Metadata['openGraph']>;
