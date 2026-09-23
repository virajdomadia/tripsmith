// @vitest-environment jsdom
/**
 * H2 (performance): the two image properties a Lighthouse/DevTools run actually grades.
 *
 * 1. `priority` alone does not put `fetchpriority="high"` on the element in Next 15 — Chrome's
 *    "LCP request discovery" insight failed that check on all three public pages, so every LCP
 *    image passes it explicitly.
 * 2. `sizes` has to match the grid the image sits in. A card in a `sm:grid-cols-2 lg:grid-cols-3`
 *    grid is ~50vw between 640 px and 1023 px; a `sizes` that jumps straight from 100vw to a
 *    1024 px breakpoint makes every tablet download the full-width candidate.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hero } from '../src/components/site/home/Hero';
import { PackageCard } from '../src/components/site/PackageCard';
import { Photo } from '../src/components/site/Photo';
import type { components } from '../src/lib/api-types';

vi.mock('../src/components/site/home/SearchBar', () => ({ SearchBar: () => null }));

afterEach(cleanup);

const facets = {
  destinations: [],
  themes: [],
  months: [],
  nights: { min: 2, max: 7 },
  pricePaise: { min: 100000, max: 900000 },
} as unknown as components['schemas']['SearchFacets'];

const card: components['schemas']['PackageCard'] = {
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  destination: 'Goa',
  nights: 3,
  days: 4,
  startingPricePaise: 1449900,
  themes: ['beach'],
  coverUrl: 'https://blob.test/cover.jpg',
  highlights: ['Sunset from Chapora Fort'],
  badge: 'guaranteed',
};

/** `(min-width: 640px) 50vw, 100vw` → [640]; the widths a `sizes` list switches at. */
const breakpoints = (sizes: string) =>
  [...sizes.matchAll(/min-width:\s*(\d+)px/g)].map((m) => Number(m[1]));

describe('LCP images declare fetchpriority=high', () => {
  it('the home hero does', () => {
    const { container } = render(<Hero facets={facets} trips={12} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('fetchpriority')).toBe('high');
  });

  it('a `priority` Photo does — that is the package and destination hero', () => {
    const { container } = render(
      <Photo src="https://blob.test/c.jpg" alt="" sizes="100vw" priority />,
    );
    expect(container.querySelector('img')!.getAttribute('fetchpriority')).toBe('high');
  });

  it('a Photo below the fold does not — it would compete with the real LCP element', () => {
    const { container } = render(<Photo src="https://blob.test/c.jpg" alt="" sizes="100vw" />);
    expect(container.querySelector('img')!.getAttribute('fetchpriority')).not.toBe('high');
  });
});

describe('card `sizes` match the grid the card sits in', () => {
  it('PackageCard steps down at the 2-column breakpoint', () => {
    const { container } = render(<PackageCard card={card} />);
    const sizes = container.querySelector('img')!.getAttribute('sizes')!;
    expect(breakpoints(sizes)).toContain(640);
  });
});
