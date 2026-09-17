import { describe, expect, it } from 'vitest';
import { siteJsonLd } from '../src/lib/seo/site-jsonld';

describe('siteJsonLd', () => {
  it('describes the agency and the site search', () => {
    const [agency, site] = siteJsonLd('https://tripsmith.vercel.app');
    expect(agency).toMatchObject({
      '@type': 'TravelAgency',
      name: 'Tripsmith',
      telephone: '+919845012345',
      address: { '@type': 'PostalAddress', addressLocality: 'Bengaluru', addressCountry: 'IN' },
    });
    expect(site).toMatchObject({
      '@type': 'WebSite',
      url: 'https://tripsmith.vercel.app',
      potentialAction: {
        '@type': 'SearchAction',
        target: 'https://tripsmith.vercel.app/packages?destination={destination}',
      },
    });
  });
});
