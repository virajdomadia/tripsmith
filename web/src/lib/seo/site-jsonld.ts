import { BUSINESS } from '../business';

/** schema.org TravelAgency + WebSite (with the site search) for the home page. */
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
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/packages?destination={destination}`,
        'query-input': 'required name=destination',
      },
    },
  ];
}
