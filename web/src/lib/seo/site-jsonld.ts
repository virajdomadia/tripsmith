import { BUSINESS } from '../business';

/**
 * schema.org TravelAgency + WebSite for the home page.
 *
 * No `SearchAction`: the listing filters by destination slug, month and budget, and has no
 * free-text parameter a search box could fill (`parseSearchQuery` drops anything that is not a
 * slug). Advertising one would send "goa beach" to a page that ignores it.
 */
export function siteJsonLd(siteUrl: string): Record<string, unknown>[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'TravelAgency',
      name: BUSINESS.name,
      legalName: BUSINESS.legalName,
      url: siteUrl,
      telephone: BUSINESS.phoneHref.replace('tel:', ''),
      email: BUSINESS.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: BUSINESS.address,
        addressLocality: 'Bengaluru',
        postalCode: '560001',
        addressCountry: 'IN',
      },
      areaServed: { '@type': 'Country', name: 'India' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BUSINESS.name,
      url: siteUrl,
    },
  ];
}
