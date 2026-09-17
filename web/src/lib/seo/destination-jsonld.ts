import type { components } from '@/lib/api-types';

type DestinationDetail = components['schemas']['DestinationDetail'];

/** schema.org TouristDestination (R2 acceptance). `touristType` = every theme its live trips carry. */
export function destinationJsonLd(d: DestinationDetail, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: d.name,
    description: d.tagline,
    url,
    image: d.coverUrl,
    containedInPlace: { '@type': 'Country', name: 'India' },
    touristType: [...new Set(d.packages.flatMap((p) => p.themes))],
  };
}
