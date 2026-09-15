import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApiStatus } from '../src/components/site/ApiStatus';
import type { components } from '../src/lib/api-types';

const meta: components['schemas']['Meta'] = {
  themes: [
    { value: 'beach', label: 'Beach' },
    { value: 'hills', label: 'Hills' },
  ],
  badges: [{ value: 'sold-out', label: 'Sold out' }],
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
      createElement(ApiStatus, { health: { status: 'ok' }, meta, apiUrl: 'http://localhost:8000' }),
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

  it('says the api is unreachable instead of crashing when it is down', () => {
    const html = renderToStaticMarkup(
      createElement(ApiStatus, { error: 'fetch failed', apiUrl: 'http://localhost:8000' }),
    );
    expect(html).toContain('unreachable');
    expect(html).toContain('fetch failed');
  });
});
