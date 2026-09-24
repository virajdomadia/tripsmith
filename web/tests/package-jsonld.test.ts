import { describe, expect, it } from 'vitest';
import type { components } from '../src/lib/api-types';
import { faqJsonLd, packageJsonLd } from '../src/lib/seo/package-jsonld';

type PackageDetail = components['schemas']['PackageDetail'];

const departure = (over: Partial<PackageDetail['departures'][number]>) => ({
  id: 'd1',
  date: '2026-11-20',
  seatsTotal: 16,
  seatsLeft: 16,
  guaranteed: true,
  priceDoublePaise: 14_999_00,
  priceTriplePaise: 13_499_00,
  priceChildPaise: 8_999_00,
  singleSupplementPaise: 6_000_00,
  badge: 'guaranteed' as const,
  ...over,
});

const noMeals = { breakfast: false, lunch: false, dinner: false };

const pkg: PackageDetail = {
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  summary: 'Three nights in Candolim.',
  destination: { slug: 'goa', name: 'Goa' },
  themes: ['beach', 'family'],
  nights: 3,
  days: 4,
  departureCity: 'Ex-Mumbai',
  startingPricePaise: 14_499_00,
  highlights: ['Sunset from Chapora Fort'],
  inclusions: ['3 nights'],
  exclusions: ['Flights'],
  hotels: [{ name: 'Lemon Tree', city: 'Candolim', stars: 4, nights: 3 }],
  faq: [],
  itinerary: [
    { dayNo: 1, title: 'Arrive Goa', description: '', meals: noMeals, stay: 'Candolim' },
    {
      dayNo: 2,
      title: 'North Goa',
      description: '',
      meals: { ...noMeals, breakfast: true },
      stay: 'Candolim',
    },
  ],
  images: [{ url: 'https://x/a.jpg', alt: 'a', width: 1600, height: 1000 }],
  cover: { url: 'https://x/a.jpg', alt: 'a', width: 1600, height: 1000 },
  departures: [
    departure({}),
    departure({
      id: 'd2',
      date: '2026-12-18',
      seatsLeft: 0,
      badge: 'sold-out',
      priceDoublePaise: 17_499_00,
    }),
  ],
  related: [],
  updatedAt: '2026-09-15T00:00:00Z',
};

describe('packageJsonLd', () => {
  it('emits a TouristTrip with one Offer per upcoming departure', () => {
    const ld = packageJsonLd(pkg, 'https://tripsmith.vercel.app/packages/north-goa-beaches');
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: 'North Goa Beaches',
      url: 'https://tripsmith.vercel.app/packages/north-goa-beaches',
      touristType: ['beach', 'family'],
      image: ['https://x/a.jpg'],
      provider: { '@type': 'TravelAgency', name: 'Tripsmith' },
    });
    const offers = ld.offers as Array<Record<string, unknown>>;
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      '@type': 'Offer',
      price: '14999',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
    });
    // The departure day is not when the offer opens.
    expect(offers[0]).not.toHaveProperty('validFrom');
    expect(offers[1]).toMatchObject({ price: '17499', availability: 'https://schema.org/SoldOut' });
    const itinerary = ld.itinerary as {
      itemListElement: Array<{ position: number; name: string }>;
    };
    expect(itinerary.itemListElement.map((d) => d.name)).toEqual(['Arrive Goa', 'North Goa']);
  });

  it('advertises no Offer for a departure that is still on request (price 0)', () => {
    const ld = packageJsonLd(
      { ...pkg, departures: [departure({ id: 'd3', priceDoublePaise: 0 }), ...pkg.departures] },
      'https://tripsmith.vercel.app/packages/north-goa-beaches',
    );
    const offers = ld.offers as Array<Record<string, unknown>>;
    expect(offers.map((o) => o.price)).toEqual(['14999', '17499']);
  });
});

describe('faqJsonLd', () => {
  it('is null when the package has no questions', () => {
    // An empty FAQPage is a structured-data error, so nothing is emitted at all.
    expect(faqJsonLd(pkg)).toBeNull();
  });

  it('pairs every question with its answer', () => {
    const ld = faqJsonLd({
      ...pkg,
      faq: [
        { q: 'Are flights included?', a: 'No — the price is land only.' },
        { q: 'Can I extend my stay?', a: 'Yes, tell us when you enquire.' },
      ],
    });

    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Are flights included?',
          acceptedAnswer: { '@type': 'Answer', text: 'No — the price is land only.' },
        },
        {
          '@type': 'Question',
          name: 'Can I extend my stay?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, tell us when you enquire.' },
        },
      ],
    });
  });
});
