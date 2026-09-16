import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApiStatus } from '../src/components/site/ApiStatus';
import type { components } from '../src/lib/api-types';

const packages: components['schemas']['PackageList'] = {
  total: 1,
  items: [
    {
      slug: 'north-goa-beaches',
      name: 'North Goa Beaches',
      destination: 'Goa',
      nights: 3,
      days: 4,
      startingPricePaise: 1449900,
      themes: ['beach', 'family'],
      coverUrl: 'https://blob.test/packages/north-goa-beaches/vagator-palms-1.jpg',
      highlights: ['Sunset from Chapora Fort', 'Anjuna flea market'],
      badge: 'guaranteed',
    },
  ],
  facets: {
    budget: { min: 1000000, max: 2000000 },
    destinations: [{ value: 'goa', label: 'Goa', count: 1 }],
    months: [{ value: '2026-12', label: 'December 2026', count: 1 }],
    nights: { min: 3, max: 4 },
    themes: [{ value: 'beach', label: 'Beach', count: 1 }],
  },
};

const meta: components['schemas']['Meta'] = {
  themes: [
    { value: 'beach', label: 'Beach' },
    { value: 'hills', label: 'Hills' },
  ],
  badges: [
    { value: 'sold-out', label: 'Sold out' },
    { value: 'guaranteed', label: 'Guaranteed departure' },
  ],
  enquiryTypes: [{ value: 'custom', label: 'Customise this trip' }],
  limits: {
    maxTravellers: 12,
    maxThemesPerPackage: 3,
    enquiryMessageMax: 1000,
    imageMaxBytes: 5242880,
  },
};

describe('<ApiStatus>', () => {
  it('renders the health status and every /meta value with its label', () => {
    const html = renderToStaticMarkup(
      createElement(ApiStatus, {
        health: { status: 'ok' },
        meta,
        packages,
        apiUrl: 'http://localhost:8000',
      }),
    );
    expect(html).toContain('ok');
    expect(html).toContain('http://localhost:8000');
    for (const text of [
      'Beach',
      'Hills',
      'beach',
      'Sold out',
      'Customise this trip',
      '12',
      '3',
      '1000',
      '5242880',
    ])
      expect(html).toContain(text);
  });

  it('lists every seeded package with cover, price in rupees, duration and badge', () => {
    const html = renderToStaticMarkup(
      createElement(ApiStatus, {
        health: { status: 'ok' },
        meta,
        packages,
        apiUrl: 'http://localhost:8000',
      }),
    );
    expect(html).toContain('North Goa Beaches');
    expect(html).toContain('Goa');
    expect(html).toContain('3 nights / 4 days');
    expect(html).toContain('₹14,499');
    expect(html).toContain(
      'src="https://blob.test/packages/north-goa-beaches/vagator-palms-1.jpg"',
    );
    expect(html).toContain('Guaranteed departure');
    expect(html).toContain('Sunset from Chapora Fort');
    expect(html).toContain('/packages/north-goa-beaches');
  });

  it('says the api is unreachable instead of crashing when it is down', () => {
    const html = renderToStaticMarkup(
      createElement(ApiStatus, { error: 'fetch failed', apiUrl: 'http://localhost:8000' }),
    );
    expect(html).toContain('unreachable');
    expect(html).toContain('fetch failed');
  });
});
