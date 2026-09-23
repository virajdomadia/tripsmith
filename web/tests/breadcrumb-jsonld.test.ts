import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';

describe('breadcrumbJsonLd', () => {
  it('numbers the trail from one and makes every item absolute', () => {
    const out = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Goa', path: '/destinations/goa' },
      { name: 'North Goa Beaches', path: '/packages/north-goa-beaches' },
    ]);

    expect(out['@type']).toBe('BreadcrumbList');
    expect(out.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'http://localhost:3000/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Goa',
        item: 'http://localhost:3000/destinations/goa',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'North Goa Beaches',
        item: 'http://localhost:3000/packages/north-goa-beaches',
      },
    ]);
  });
});
