import type { components } from '@/lib/api-types';

type PackageDetail = components['schemas']['PackageDetail'];

/**
 * schema.org `FAQPage` from the package's own questions (H1, R13).
 *
 * Null when the package has no FAQ: an empty `FAQPage` is a structured-data error, and most
 * packages in the catalogue carry a few questions while a new draft carries none.
 */
export function faqJsonLd(p: PackageDetail): Record<string, unknown> | null {
  if (p.faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

/** schema.org TouristTrip + one Offer per upcoming departure (R4 acceptance). */
export function packageJsonLd(p: PackageDetail, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: p.name,
    description: p.summary,
    url,
    image: p.images.map((i) => i.url),
    touristType: p.themes,
    provider: { '@type': 'TravelAgency', name: 'Tripsmith' },
    itinerary: {
      '@type': 'ItemList',
      numberOfItems: p.itinerary.length,
      itemListElement: p.itinerary.map((d) => ({
        '@type': 'ListItem',
        position: d.dayNo,
        name: d.title,
      })),
    },
    offers: p.departures.map((d) => ({
      '@type': 'Offer',
      name: `Departure ${d.date}`,
      url,
      price: String(Math.round(d.priceDoublePaise / 100)),
      priceCurrency: 'INR',
      validFrom: d.date,
      availability: d.seatsLeft > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    })),
  };
}
