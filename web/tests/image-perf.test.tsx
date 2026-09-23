// @vitest-environment jsdom
/**
 * H2 (performance): the three image settings a Lighthouse run grades, each pinned so it cannot
 * be dropped by a later edit.
 *
 * 1. `priority` alone does not put `fetchpriority="high"` on the element in Next 15 — it emits
 *    the preload but leaves it at the default priority, and Chrome's "LCP request discovery"
 *    check failed on all three public pages. Every LCP image passes it explicitly.
 * 2. `sizes` has to match the grid the image sits in. A card in a `sm:grid-cols-2 lg:grid-cols-3`
 *    grid is ~50vw between 640 px and 1023 px; a `sizes` that jumps straight from 100vw to a
 *    1024 px breakpoint makes every tablet download the full-width candidate.
 * 3. `images.minimumCacheTTL` is the only thing stopping Vercel's optimizer from inheriting the
 *    `max-age=0` that files under `public/` are served with. It looks like an arbitrary number
 *    in the config, so it is asserted here rather than left to a reviewer to recognise.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../next.config';
import { Hero } from '../src/components/site/home/Hero';
import { PackageCard } from '../src/components/site/PackageCard';
import { Photo } from '../src/components/site/Photo';
import type { components } from '../src/lib/api-types';

vi.mock('../src/components/site/home/SearchBar', () => ({ SearchBar: () => null }));

afterEach(cleanup);

const HERO_ALT = 'A houseboat moored under coconut palms on the Alleppey backwaters, Kerala';

const facets: components['schemas']['SearchFacets'] = {
  destinations: [{ value: 'goa', label: 'Goa', count: 3 }],
  themes: [{ value: 'beach', label: 'Beach', count: 3 }],
  months: [{ value: '2026-11', label: 'November 2026', count: 3 }],
  nights: { min: 2, max: 7 },
  budget: { min: 10000, max: 90000 },
};

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

describe('LCP images declare fetchpriority=high', () => {
  it('the home hero does', () => {
    const { container } = render(<Hero facets={facets} trips={12} />);
    // By alt, not `querySelector('img')`: a decorative image added above the hero would
    // otherwise silently move this assertion onto the wrong element.
    const hero = container.querySelector(`img[alt="${HERO_ALT}"]`);
    expect(hero).not.toBeNull();
    expect(hero!.getAttribute('fetchpriority')).toBe('high');
  });

  it('a `priority` Photo does — that is the package and destination hero', () => {
    const { container } = render(
      <Photo src="https://blob.test/c.jpg" alt="" sizes="100vw" priority />,
    );
    expect(container.querySelector('img')!.getAttribute('fetchpriority')).toBe('high');
  });

  it('a Photo below the fold declares no priority at all — it must not compete with the LCP', () => {
    const { container } = render(<Photo src="https://blob.test/c.jpg" alt="" sizes="100vw" />);
    expect(container.querySelector('img')!.getAttribute('fetchpriority')).toBeNull();
  });
});

describe('card `sizes` match the grid the card sits in', () => {
  it('PackageCard asks for half the viewport in the 2-column range, not all of it', () => {
    const { container } = render(<PackageCard card={card} />);
    const sizes = container.querySelector('img')!.getAttribute('sizes')!;
    // The clause itself, not just the breakpoint: `(min-width: 640px) 100vw` would satisfy a
    // check that only looked for the number 640 while re-introducing the whole regression.
    expect(sizes).toContain('(min-width: 640px) 50vw');
    expect(sizes.endsWith('100vw')).toBe(true);
  });
});

describe('optimized images outlive the response that produced them', () => {
  it('next.config sets a minimumCacheTTL, so `public/` sources do not inherit max-age=0', () => {
    expect(nextConfig.images?.minimumCacheTTL).toBe(60 * 60 * 24);
  });
});
