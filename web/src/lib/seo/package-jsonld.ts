import type { components } from '@/lib/api-types';
import { isPriced } from '@/lib/format';

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

/**
 * schema.org TouristTrip + one Offer per upcoming priced departure (R4 acceptance). A departure
 * at price 0 is "on request" (a date parked before the rate is set), not a free trip, so it gets
 * no Offer, and a package with none priced carries no `offers` at all. No `validFrom`: the departure day is when the trip starts, not when the offer opens,
 * and we do not track the latter.
 */
export function packageJsonLd(p: PackageDetail, url: string): Record<string, unknown> {
  const offers = p.departures
    .filter((d) => isPriced(d.priceDoublePaise))
    .map((d) => ({
      '@type': 'Offer',
      name: `Departure ${d.date}`,
      url,
      price: String(Math.round(d.priceDoublePaise / 100)),
      priceCurrency: 'INR',
      availability: d.seatsLeft > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    }));
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
    ...(offers.length > 0 ? { offers } : {}),
  };
}
