import { describe, expect, it } from 'vitest';
import type { components } from '../src/lib/api-types';
import { monthRange } from '../src/lib/format';
import { proseBlocks } from '../src/lib/prose';
import { destinationJsonLd } from '../src/lib/seo/destination-jsonld';

type DestinationDetail = components['schemas']['DestinationDetail'];

describe('monthRange', () => {
  it('joins a run that wraps the year end', () => {
    expect(monthRange([11, 12, 1, 2])).toBe('Nov – Feb');
    expect(monthRange([2, 1, 12, 11])).toBe('Nov – Feb'); // order does not matter
  });
  it('lists several runs and single months', () => {
    expect(monthRange([3, 4, 5, 6, 12])).toBe('Mar – Jun · Dec');
    expect(monthRange([6])).toBe('Jun');
    expect(monthRange([9, 10, 11, 12, 1, 2, 3])).toBe('Sep – Mar');
  });
  it('handles the edges', () => {
    expect(monthRange([])).toBe('');
    expect(monthRange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('All year');
  });
});

describe('proseBlocks', () => {
  it('splits paragraphs on blank lines and joins soft line breaks', () => {
    expect(proseBlocks('One\nline.\n\nTwo.\n')).toEqual([['One line.'], ['Two.']]);
  });
  it('turns **bold** into strong parts and leaves the rest as text', () => {
    expect(proseBlocks('**Best time:** Nov to Feb — dry.')).toEqual([
      [{ strong: 'Best time:' }, ' Nov to Feb — dry.'],
    ]);
  });
});

describe('destinationJsonLd', () => {
  const card = (slug: string, themes: DestinationDetail['packages'][number]['themes']) => ({
    slug,
    name: slug,
    destination: 'Kerala',
    nights: 4,
    days: 5,
    startingPricePaise: 21_999_00,
    deal: null,
    themes,
    coverUrl: 'https://blob.test/x.jpg',
    highlights: ['a'],
    badge: null,
  });
  const d: DestinationDetail = {
    slug: 'kerala',
    name: 'Kerala',
    tagline: 'Backwaters, tea hills and a slow coast',
    intro: 'Kerala is…',
    coverUrl: 'https://blob.test/kerala.jpg',
    region: 'South India',
    bestMonths: [9, 10, 11],
    packages: [card('a', ['hills', 'honeymoon']), card('b', ['family', 'heritage'])],
  };
  it('is a TouristDestination in India with the union of the trips themes', () => {
    const ld = destinationJsonLd(d, 'https://tripsmith.vercel.app/destinations/kerala');
    expect(ld['@type']).toBe('TouristDestination');
    expect(ld.name).toBe('Kerala');
    expect(ld.url).toBe('https://tripsmith.vercel.app/destinations/kerala');
    expect(ld.image).toBe('https://blob.test/kerala.jpg');
    expect(ld.containedInPlace).toEqual({ '@type': 'Country', name: 'India' });
    expect(ld.touristType).toEqual(['hills', 'honeymoon', 'family', 'heritage']);
  });
});
